/**
 * La confrontation moteur ↔ robot vit dans UN seul module, appelé par la ligne de
 * commande et par la page. Ces tests tiennent les deux bouts : le format du journal, et
 * le fait qu'un journal parfaitement conforme ne produise AUCUNE divergence.
 *
 * Le second point est le plus important. Un comparateur qui ne trouve jamais rien est
 * inutile ; un comparateur qui trouve des écarts là où il n'y en a pas est pire, parce
 * qu'on part alors chercher un défaut qui n'existe pas — trois exécutions du testeur ont
 * déjà été dépensées comme ça.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig } from "./config.mjs";
import { lireConformite, confronter, journalUtilisable } from "../../conformite-noyau.js";

const M = await chargerMoteur();

/** « ms UTC » → « 2020.05.19 00:00 », l'écriture du robot */
const mt5 = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ").replace(/-/g, ".");

function serie() {
  const n = 24 * 400;
  const t = [], o = [], h = [], l = [], c = [], sp = [];
  let px = 100, a = 20260906;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.01;
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.002); l.push(Math.min(ouv, px) * 0.998);
    sp.push(10);
  }
  return { n, t, o, h, l, c, sp, grain: { decimales: 4 } };
}

test("le format du journal est lu champ par champ, dans son ordre stable", () => {
  const txt = [
    "bruit avant",
    "2020.05.19 00:00:00   CONF|D|2020.05.19 00:00|1|1.1|1.2|1.3|1.4|1.5|1.6|",
    "CONF|T|2020.05.19 02:00|0.01|0.02|1|premiere|",
    "CONF|E|2020.05.19 02:00|2020.05.19 02:00|1.5|1.4|1.7|0.25",
    "CONF|S|2020.05.21 08:00|2020.05.21 08:00|1.7|123.45|-2.5|-0.7|DEAL_REASON_TP",
    "CONF|P|2020.05.20 10:00|30|1.4|1.5|1.6",
  ].join("\n");
  const conf = lireConformite(txt);
  assert.ok(journalUtilisable(conf));
  const d = conf.D.get(Math.floor(Date.UTC(2020, 4, 19) / 86400000));
  assert.equal(d.signal, true);
  const e = conf.E.get(Math.floor(Date.UTC(2020, 4, 19) / 86400000));
  assert.equal(e.prix, 1.5); assert.equal(e.sl, 1.4); assert.equal(e.lots, 0.25);
  assert.equal(conf.sorties.length, 1);
  assert.equal(conf.sorties[0].resultat, 123.45);
  assert.equal(conf.sorties[0].swap, -2.5);
  assert.equal(conf.sorties[0].commission, -0.7);
  assert.equal(conf.P.length, 1);
  // La sortie est classée au jour de la BOUGIE de sortie, pas de l'entrée : une position
  // ouverte mardi et fermée jeudi doit tomber là où le moteur la ferme.
  assert.ok(conf.S.has(Math.floor(Date.UTC(2020, 4, 21) / 86400000)));

  assert.equal(journalUtilisable(lireConformite("aucune ligne utile ici")), false);
});

test("un journal parfaitement conforme ne produit AUCUNE divergence", () => {
  const df = serie();
  const debut = df.t[0];
  const cfg = { ...construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 1, rr: 3, paliers: [[25, 0], [50, 25], [75, 50]], debut }),
    spread_max_facteur: M.SPREAD_FACTEUR };
  const trades = M.backtesterSuivi(df, cfg, "D1");
  assert.ok(trades.length > 20, "gabarit sans trades : le test ne prouve rien");

  // On rejoue le moteur SOUS LA FORME d'un journal de robot : mêmes journées, mêmes
  // bougies, mêmes prix. Le comparateur ne doit alors rien avoir à dire.
  const sup = M.resampler(df, "D1");
  const signal = M.signalDe(sup, cfg);
  const autorise = M.autorisePar(sup, cfg.filtres);
  const lignes = [];
  for (let k = 0; k < sup.n; k++) {
    const ok = !!signal[k] && !(autorise && !autorise[k]);
    lignes.push(`CONF|D|${mt5(sup.t[k])}|${ok ? 1 : 0}|0|0|0|0|0|0|`);
  }
  for (const t of trades) {
    lignes.push(`CONF|E|${mt5(t.entree_t)}|${mt5(t.entree_t)}|${t.entree}|${t.sl_initial}|0|0.10`);
    lignes.push(`CONF|S|${mt5(t.sortie_t)}|${mt5(t.sortie_t)}|${t.sortie}|0|0|0|${t.motif}`);
  }
  const conf = lireConformite(lignes.join("\n"));
  const res = confronter({ M, df, cfg, conf, debut, portage: null });

  assert.equal(res.divergences.length, 0,
    "divergences sur un journal identique au moteur : "
    + res.divergences.map((d) => `${d.n} ${d.nom} (${d.exemples[0]})`).join(" · "));
  assert.equal(res.nEntreesMoteur, trades.length);
  assert.equal(res.nEntreesRobot, trades.length);

  // Sans taille de contrat, pas de bilan chiffré : on ne devine pas les frais du robot.
  assert.equal(res.bilan, null);
});

test("une entrée décalée d'une heure est NOMMÉE, pas noyée dans un écart global", () => {
  const df = serie();
  const debut = df.t[0];
  const cfg = { ...construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 1, rr: 3, paliers: [], debut }), spread_max_facteur: M.SPREAD_FACTEUR };
  const trades = M.backtesterSuivi(df, cfg, "D1");
  const sup = M.resampler(df, "D1");
  const signal = M.signalDe(sup, cfg);
  const autorise = M.autorisePar(sup, cfg.filtres);
  const lignes = [];
  for (let k = 0; k < sup.n; k++) {
    const ok = !!signal[k] && !(autorise && !autorise[k]);
    lignes.push(`CONF|D|${mt5(sup.t[k])}|${ok ? 1 : 0}|0|0|0|0|0|0|`);
  }
  trades.forEach((t, i) => {
    // une seule entrée décalée d'une heure : c'est elle qu'on doit retrouver, seule
    const quand = i === 3 ? t.entree_t + 3600000 : t.entree_t;
    lignes.push(`CONF|E|${mt5(quand)}|${mt5(quand)}|${t.entree}|${t.sl_initial}|0|0.10`);
  });
  const res = confronter({ M, df, cfg, conf: lireConformite(lignes.join("\n")), debut, portage: null });
  const d = res.divergences.find((x) => x.nom === "bougie d'entrée différente");
  assert.ok(d, "l'entrée décalée doit être nommée");
  assert.equal(d.n, 1, "une seule entrée a été décalée");
  assert.ok(d.exemples[0].includes("tentatives") || d.exemples[0].includes("moteur"),
    "l'exemple doit porter de quoi instruire l'écart");
});
