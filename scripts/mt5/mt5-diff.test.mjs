/**
 * Vérifie le harnais sur un couple (CSV, rapport MT5) dont les écarts sont connus :
 * décalage d'heure serveur, spread, commission, swap, trades manquants ou en trop,
 * sorties divergentes. Le harnais doit les retrouver au chiffre près.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellules, horodatage, lireRapportMt5, nombre } from "./parse-mt5.mjs";
import { apparier, comparer, decalages, quantile } from "./comparer.mjs";
import { DEBUT, fabriquer } from "./fixture.mjs";
import { construireConfig } from "./config.mjs";
import { chargerMoteur } from "./charger-moteur.mjs";

test("nombre() lit les formats MT5", () => {
  assert.equal(nombre("1 234.56"), 1234.56);
  assert.equal(nombre("-2 863,00"), -2863);
  assert.equal(nombre("0.87654"), 0.87654);
  assert.equal(nombre("1,234.56"), 1234.56);
  assert.equal(nombre("−12"), -12); // signe typographique ignoré, valeur lue
  assert.equal(nombre(""), null);
  assert.equal(nombre("balance"), null);
});

test("horodatage() lit les formats MT5", () => {
  const attendu = Date.UTC(2024, 2, 15, 9, 0, 0);
  assert.equal(horodatage("2024.03.15 09:00:00"), attendu);
  assert.equal(horodatage("2024.03.15 09:00"), attendu);
  assert.equal(horodatage("15.03.2024 09:00"), attendu);
  assert.equal(horodatage("2024-03-15T09:00"), attendu);
  assert.equal(horodatage("pas une date"), null);
});

test("cellules() accepte HTML, tabulations et point-virgules", () => {
  assert.deepEqual(cellules("<tr><td>a</td><td>b</td></tr>"), [["a", "b"]]);
  assert.deepEqual(cellules("a\tb\tc"), [["a", "b", "c"]]);
  assert.deepEqual(cellules("a;b;c;d"), [["a", "b", "c", "d"]]);
});

test("le rapport MT5 se lit sous forme Transactions comme sous forme Positions", async () => {
  const a = await fabriquer({ forme: "deals" });
  const b = await fabriquer({ forme: "positions" });
  const la = lireRapportMt5(a.rapport);
  const lb = lireRapportMt5(b.rapport);
  assert.equal(la.source, "transactions");
  assert.equal(lb.source, "positions");
  assert.equal(la.avertissements.length, 0, la.avertissements.join(" | "));
  assert.equal(la.trades.length, a.verite.nMt5);
  assert.equal(lb.trades.length, b.verite.nMt5);
  for (let i = 0; i < la.trades.length; i++) {
    const x = la.trades[i],
      y = lb.trades[i];
    assert.equal(x.entree_t, y.entree_t);
    assert.ok(Math.abs(x.entree - y.entree) < 1e-9);
    assert.ok(Math.abs(x.sortie - y.sortie) < 1e-9);
    assert.ok(Math.abs(x.net - y.net) < 0.02);
  }
});

test("la ligne de solde initial (« balance ») n'est pas comptée comme un trade", () => {
  const { trades } = lireRapportMt5(
    [
      "Deals",
      "Time\tDeal\tSymbol\tType\tDirection\tVolume\tPrice\tOrder\tCommission\tSwap\tProfit\tBalance\tComment",
      "2024.01.01 00:00:00\t1\t\tbalance\t\t\t0\t\t0.00\t0.00\t0.00\t10 000.00\t",
      "2024.01.02 09:00:00\t2\tAUDCAD\tbuy\tin\t1.00\t0.90000\t3\t-3.50\t0.00\t0.00\t9 996.50\t",
      "2024.01.02 15:00:00\t3\tAUDCAD\tsell\tout\t1.00\t0.89550\t4\t0.00\t-1.20\t-450.00\t9 545.30\tsl 0.89550",
    ].join("\n"),
  );
  assert.equal(trades.length, 1);
  assert.equal(trades[0].motif, "sl");
  assert.equal(trades[0].commission, -3.5);
  assert.equal(trades[0].swap, -1.2);
  assert.equal(trades[0].net, -454.7);
});

test("les clôtures partielles sont recollées en un seul aller-retour", () => {
  const { trades } = lireRapportMt5(
    [
      "Deals",
      "Time\tDeal\tSymbol\tType\tDirection\tVolume\tPrice\tOrder\tCommission\tSwap\tProfit\tBalance\tComment",
      "2024.01.02 09:00:00\t2\tGOLD\tbuy\tin\t1.00\t2000.00\t3\t-6.00\t0.00\t0.00\t0\t",
      "2024.01.02 12:00:00\t3\tGOLD\tsell\tout\t0.50\t2010.00\t4\t0.00\t0.00\t500.00\t0\ttp 2010.00",
      "2024.01.02 14:00:00\t4\tGOLD\tsell\tout\t0.50\t2020.00\t5\t0.00\t0.00\t1000.00\t0\ttp 2020.00",
    ].join("\n"),
  );
  assert.equal(trades.length, 1);
  assert.equal(trades[0].sortie, 2015); // moyenne pondérée par le volume
  assert.equal(trades[0].profit, 1500);
  assert.equal(trades[0].net, 1494);
});

test("le décalage d'heure serveur est retrouvé", async () => {
  const f = await fabriquer({ decalageH: 3 });
  const moteur = await chargerMoteur();
  const df = moteur.decouper(moteur.texteVersDf(f.csv), DEBUT, undefined);
  const sim = moteur.backtester(df, construireConfig(f.reglages));
  const mt5 = lireRapportMt5(f.rapport).trades;
  assert.equal(decalages(sim, mt5)[0].ms, 3 * 3600000);
});

test("le harnais chiffre les écarts injectés", async () => {
  const f = await fabriquer();
  const moteur = await chargerMoteur();
  const df = moteur.decouper(moteur.texteVersDf(f.csv), DEBUT, undefined);
  const cfg = construireConfig(f.reglages);
  const sim = moteur.backtester(df, cfg);
  const mt5 = lireRapportMt5(f.rapport).trades;

  const c = comparer(sim, mt5, {
    toleranceMs: 30 * 60000,
    decalageMs: NaN,
    capital: f.reglages.capital,
    risquePct: f.reglages.risquePct,
    frais: cfg.frais,
    eurImpose: NaN,
  });

  // Entrées : décalage, comptes, spread.
  assert.equal(c.entrees.decalageMs, f.verite.decalageMs);
  assert.equal(c.entrees.nSim, f.verite.nSim);
  assert.equal(c.entrees.nMt5, f.verite.nMt5);
  assert.equal(c.entrees.simSeule.length, f.verite.manquants);
  assert.equal(c.entrees.mt5Seule.length, f.verite.ajoutes);
  assert.equal(c.entrees.ecartHeure.med, 0);
  assert.ok(
    Math.abs(c.entrees.ecartPrix.med - f.verite.spread) < 1e-9,
    `spread lu ${c.entrees.ecartPrix.med} au lieu de ${f.verite.spread}`,
  );

  // Sorties : seules les divergences injectées doivent apparaître.
  const divergentes = c.entrees.apparies - c.sorties.memeMotif;
  assert.equal(divergentes, f.verite.divergents);
  assert.equal(c.sorties.memeHeure, c.entrees.apparies - f.verite.divergents);

  // Frais : commission et swap retrouvés à l'euro près.
  assert.ok(Math.abs(c.frais.mt5Commission - f.verite.commissionTotale) < 0.5);
  assert.ok(Math.abs(c.frais.mt5Swap - f.verite.swapTotal) < 0.5);
  assert.ok(Math.abs(c.frais.mt5Net - f.verite.netTotal) < 5);
  assert.ok(Math.abs(c.frais.eur.retenu - f.verite.eurParR) / f.verite.eurParR < 0.1);

  // La décomposition de l'écart doit refaire l'écart total.
  assert.ok(
    Math.abs(c.ecart.controle - c.ecart.total) < 1,
    `postes ${c.ecart.controle} ≠ écart ${c.ecart.total}`,
  );

  // Sur les trades identiques, tout l'écart doit s'expliquer par les frais injectés :
  // c'est le contrôle qui prouve que le harnais ne laisse rien dans l'ombre.
  assert.ok(
    Math.abs(c.ecart.inexplique) < 0.01 * Math.abs(c.ecart.total),
    `résidu inexpliqué ${c.ecart.inexplique} € sur un écart de ${c.ecart.total} €`,
  );
});

test("un décalage imposé qui ne colle pas fait tomber l'appariement", async () => {
  const f = await fabriquer();
  const moteur = await chargerMoteur();
  const df = moteur.decouper(moteur.texteVersDf(f.csv), DEBUT, undefined);
  const sim = moteur.backtester(df, construireConfig(f.reglages));
  const mt5 = lireRapportMt5(f.rapport).trades;
  const { paires } = apparier(sim, mt5, 0, 30 * 60000);
  // Quelques coïncidences d'horaire subsistent (même heure, autre jour) : ce qui
  // compte est l'effondrement du nombre d'appariements sans le bon décalage.
  assert.ok(
    paires.length < 0.1 * sim.length,
    `${paires.length} paires sur ${sim.length} sans le décalage`,
  );
});

test("quantile()", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([5], 0.9), 5);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});
