#!/usr/bin/env node
/**
 * Harnais de comparaison Simula ↔ testeur MT5.
 *
 *   node scripts/mt5-diff.mjs --csv AUDCAD_H1.csv --mt5 rapport.html \
 *        --ligne mediane --periode 15 --sl 0.5 --rr 2
 *
 * Rejoue le moteur du dépôt sur le CSV H1, lit le rapport MT5 collé en entrée,
 * puis compare séparément les ENTRÉES, les SORTIES et les FRAIS.
 * Ne modifie rien : il mesure et il chiffre.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chargerMoteur } from "./mt5/charger-moteur.mjs";
import { construireConfig, lirePaliers, PALIERS_REFERENCE } from "./mt5/config.mjs";
import { lireFichierMt5, lireRapportMt5 } from "./mt5/parse-mt5.mjs";
import { comparer, motifSimula, rNet } from "./mt5/comparer.mjs";

const AIDE = `
Harnais Simula ↔ MT5 — compare la liste de trades du moteur à un rapport du testeur.

  node scripts/mt5-diff.mjs --csv <H1.csv> --mt5 <rapport MT5> [options]

Données
  --csv <f>            CSV H1 de l'instrument (obligatoire)
  --mt5 <f>            rapport du testeur MT5 : HTML, ou copier-coller
                       des onglets Transactions / Ordres / Positions (obligatoire)
                       « - » pour lire l'entrée standard

Réglages du moteur (moteur.js à la racine — la spécification)
  --symbole <s>        étiquette de l'instrument, pour l'affichage
  --entree <type>      croisement_ou_rebond (défaut) | croisement_prix | rebond
                       | croisement_lignes | cassure
  --ut <H1|H4|D1>      unité de décision ; H4/D1 sont agrégées depuis le H1 (défaut H1)
  --ligne <ema|ma|mediane>                  --periode <n>
  --sl <pct>           --rr <x>             --sens <achat|vente>
  --paliers <s>        « 25:0,50:25,75:50 » (défaut) ou « aucun »
  --trailing <pct>     stop suiveur, à la place des paliers
  --prudent            lecture basse : bougie ambiguë tranchée en défaveur
  --duree-max <n>      fermeture au cours de clôture après N bougies
  --filtres <f.json>   tableau JSON de filtres du moteur
  --spread <pct>       spread de repli quand la série n'en porte pas
  --swap <pct/an>      --commission <pct>
  --capital <eur>      --risque <pct>       (repli pour la conversion R → €)
  --depuis <AAAA-MM-JJ>  début de simulation (défaut : 2020-01-01)
  --suivi-decision     suit la position sur la bougie de décision au lieu de la H1
                       (l'ancien comportement, pour comparer)

Démonstration
  --demo               fabrique un couple (CSV, rapport MT5) aux écarts connus
                       et lance le harnais dessus, pour le voir tourner sans données

Comparaison
  --decalage <h>       force le décalage d'heure serveur (défaut : détecté)
  --tolerance <min>    fenêtre d'appariement des entrées (défaut : 30)
  --eur-par-r <eur>    valeur monétaire d'un R (défaut : déduite du rapport MT5)
  --lignes <n>         nombre d'exemples listés par section (défaut : 12)
  --out-csv <f>        écrit le journal apparié trade à trade
  --json <f>           écrit le résultat complet en JSON
`;

function args(argv) {
  const o = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      o._.push(a);
      continue;
    }
    const [cle, val] = a.slice(2).split("=");
    if (val !== undefined) {
      o[cle] = val;
      continue;
    }
    const suiv = argv[i + 1];
    if (suiv === undefined || suiv.startsWith("--")) o[cle] = true;
    else {
      o[cle] = suiv;
      i++;
    }
  }
  return o;
}

const num = (x, d) => (x === undefined ? d : Number(String(x).replace(",", ".")));
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "—");
const sgn = (x, d = 2) =>
  Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d).replace(".", ",")}` : "—";
const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

function ligneStats(nom, s, d = 4, unite = "") {
  return `| ${nom} | ${s.n} | ${fr(s.med, d)}${unite} | ${fr(s.moy, d)}${unite} | ${fr(s.p10, d)}${unite} | ${fr(s.p90, d)}${unite} | ${fr(s.min, d)}${unite} | ${fr(s.max, d)}${unite} |`;
}
const ENTETE_STATS =
  "| mesure | n | médiane | moyenne | p10 | p90 | min | max |\n|---|---:|---:|---:|---:|---:|---:|---:|";

async function main() {
  const o = args(process.argv);
  if (o.aide || o.help || o.h || (!o.csv && !o.mt5 && !o.demo)) {
    console.log(AIDE);
    process.exit(o.csv || o.mt5 ? 0 : 1);
  }
  if (o.demo) {
    const { fabriquer } = await import("./mt5/fixture.mjs");
    const f = await fabriquer();
    const dir = mkdtempSync(path.join(tmpdir(), "simula-mt5-"));
    o.csv = path.join(dir, "demo_H1.csv");
    o.mt5 = path.join(dir, "demo_mt5.html");
    writeFileSync(o.csv, f.csv);
    writeFileSync(o.mt5, f.rapport);
    Object.assign(o, {
      symbole: f.reglages.symbol,
      ligne: f.reglages.ligne,
      periode: f.reglages.periode,
      sl: f.reglages.sl,
      rr: f.reglages.rr,
      "sans-mtf": true,
      "sans-be": true,
      "sans-frais": true,
    });
    console.error(`Démo : écarts injectés = ${JSON.stringify(f.verite)}`);
  }
  if (!o.csv) {
    console.error("Manque --csv");
    process.exit(1);
  }
  if (!o.mt5) {
    console.error("Manque --mt5");
    process.exit(1);
  }

  const moteur = await chargerMoteur();

  // ---------- Données ----------
  const texteCsv = readFileSync(o.csv, "utf8");
  const brut = moteur.texteVersDf(texteCsv);
  const lues = brut.n + (brut.ecartees || 0);
  const debut = o.depuis ? Date.parse(`${o.depuis}T00:00:00Z`) : Date.UTC(2020, 0, 1);
  const df = moteur.decouper(brut, debut, undefined);

  // ---------- Réglages ----------
  const reglages = {
    symbol: o.symbole || "?",
    ut: o.ut || "H1",
    entree: o.entree || "croisement_ou_rebond",
    ligne: o.ligne || "mediane",
    periode: num(o.periode, 15),
    sl: num(o.sl, 0.5),
    rr: num(o.rr, 2),
    sens: o.sens === "vente" ? "vente" : "achat",
    paliers: o.paliers !== undefined ? lirePaliers(o.paliers) : PALIERS_REFERENCE,
    trailing: o.trailing !== undefined ? num(o.trailing) : 0,
    prudent: !!o.prudent,
    dureeMax: num(o["duree-max"], 0),
    spread: num(o.spread, 0),
    swap: num(o.swap, 0),
    commission: num(o.commission, 0),
    capital: num(o.capital, 20000),
    risquePct: num(o.risque, 1),
    filtres: o.filtres ? JSON.parse(readFileSync(o.filtres, "utf8")) : [],
    debut,
  };

  const cfg = construireConfig(reglages);
  // Invariant 1 : les données de base sont en H1 ; H4 et D1 sont agrégées, jamais lues
  // depuis une autre série. Le robot MT5 fait la même agrégation (InpBougiesAgr).
  // Le signal est lu sur la bougie de décision, la position suivie sur la H1 — comme
  // l'application. Mesurer autrement ici ferait mentir l'instrument de mesure.
  const base = reglages.ut === "H1" ? df : moteur.resampler(df, reglages.ut);
  const sim = o["suivi-decision"]
    ? moteur.backtester(base, cfg)
    : moteur.backtesterSuivi(df, cfg, reglages.ut);
  const resumeSim = moteur.resume(sim);

  // ---------- Rapport MT5 ----------
  const texteMt5 = o.mt5 === "-" ? readFileSync(0, "utf8") : lireFichierMt5(o.mt5);
  const rapport = lireRapportMt5(texteMt5);
  if (!rapport.trades.length) {
    console.error("Aucun trade lu dans le rapport MT5.");
    for (const a of rapport.avertissements) console.error("  ! " + a);
    console.error("  Sections repérées : " + JSON.stringify(rapport.compte));
    process.exit(2);
  }

  const cmp = comparer(sim, rapport.trades, {
    toleranceMs: num(o.tolerance, 30) * 60000,
    decalageMs: o.decalage !== undefined ? num(o.decalage) * 3600000 : NaN,
    capital: reglages.capital,
    risquePct: reglages.risquePct,
    frais: cfg.frais,
    eurImpose: o["eur-par-r"] !== undefined ? num(o["eur-par-r"]) : NaN,
  });
  const { entrees, sorties, frais, ecart } = cmp;
  const k = frais.eur.retenu;
  const N = Math.max(0, num(o.lignes, 12));
  const L = [];
  const p = (s = "") => L.push(s);

  // ---------- Rendu ----------
  p(`# Simula ↔ MT5 — ${reglages.symbol}`);
  p();
  p(`CSV : \`${o.csv}\` · rapport MT5 : \`${o.mt5}\``);
  p(
    `Règle : ${reglages.entree} · ${reglages.ligne} ${reglages.periode} · SL ${fr(reglages.sl, 2)} % · R/R ${fr(reglages.rr, 2)} · ${reglages.sens} · UT ${reglages.ut}`,
  );
  p(
    `Filtres actifs : ${cfg.filtres.length ? cfg.filtres.map((f) => f.type).join(", ") : "aucun"} · sécurisation : ${cfg.sortie.securisation.type}${cfg.sortie.securisation.etapes ? " " + cfg.sortie.securisation.etapes.map((e) => e.join("\u2192")).join(" / ") : ""}${cfg.sortie.prudent ? " · lecture basse" : ""}`,
  );
  p();

  p("## 0. Périmètre des données");
  p();
  p("| | valeur |");
  p("|---|---|");
  p(`| Bougies lues dans le CSV | ${lues} |`);
  p(`| Écartées par \`nettoyer()\` | ${brut.ecartees || 0} |`);
  p(`| Heures de session retenues (UTC) | ${(brut.heuresSession || []).join(", ") || "—"} |`);
  p(`| Bougies après \`decouper()\` | ${df.n} |`);
  p(`| Bougies de décision (UT ${reglages.ut}) | ${base.n} |`);
  p(
    `| Colonne spread du CSV | ${brut.spreadRenseigne ? `renseignée · moyenne ${fr(brut.spreadPctMoyen, 4)} %` : "absente ou vide"} |`,
  );
  p(`| Fenêtre CSV simulée | ${df.n ? `${iso(df.t[0])} → ${iso(df.t[df.n - 1])}` : "—"} |`);
  p(`| Début de simulation (\`cfg.debut\`) | ${iso(debut)} |`);
  p(
    `| Fenêtre MT5 | ${iso(rapport.trades[0].entree_t)} → ${iso(rapport.trades.at(-1).sortie_t)} |`,
  );
  p(`| Source MT5 | table « ${rapport.source} » (${JSON.stringify(rapport.compte)}) |`);
  p();
  if (rapport.avertissements.length) {
    for (const a of rapport.avertissements.slice(0, 10)) p(`> ⚠ ${a}`);
    p();
  }

  p("## 1. Verdict brut");
  p();
  p("| | Simula | MT5 |");
  p("|---|---:|---:|");
  p(`| Trades | ${resumeSim.n} | ${rapport.trades.length} |`);
  p(
    `| Résultat | ${sgn(resumeSim.total, 1)} R (${sgn(resumeSim.total * k, 0)} €) | ${sgn(frais.mt5Net, 0)} € |`,
  );
  p(
    `| Facteur de profit | ${fr(resumeSim.pf, 2)} | ${fr(pfDe(rapport.trades.map((t) => t.net)), 2)} |`,
  );
  p(
    `| Taux de réussite | ${fr(resumeSim.winRate, 1)} % | ${fr((100 * rapport.trades.filter((t) => t.net > 0).length) / rapport.trades.length, 1)} % |`,
  );
  p(
    `| Motifs | tp ${resumeSim.tp} · sl ${resumeSim.sl} · be ${resumeSim.be} · gap ${resumeSim.gap} | ${compter(rapport.trades.map((t) => t.motif || "?"))} |`,
  );
  p();
  p(`Conversion R → € : **${fr(k, 2)} € par R** — ${frais.eur.source}.`);
  p(
    `Estimateurs : stops pleins MT5 ${fr(frais.eur.parStop, 2)} € · régression sur le profit ${fr(frais.eur.pente, 2)} € · sur le net ${fr(frais.eur.penteNet, 2)} € · nominal réglages ${fr(frais.eur.nominal, 2)} €.`,
  );
  p();

  p("## 2. Entrées");
  p();
  p(
    `Décalage d'heure serveur appliqué : **${sgn(entrees.decalageMs / 3600000, 2)} h** (${entrees.decalageAuto ? "détecté" : "imposé par --decalage"}).`,
  );
  p();
  p("Modes de l'histogramme des écarts d'entrée (avant appariement) :");
  p();
  p("| décalage | paires |");
  p("|---|---:|");
  for (const m of entrees.modes.slice(0, 6)) p(`| ${sgn(m.minutes / 60, 2)} h | ${m.n} |`);
  p();
  p("| | trades |");
  p("|---|---:|");
  p(`| Entrées Simula | ${entrees.nSim} |`);
  p(`| Entrées MT5 | ${entrees.nMt5} |`);
  p(`| **Appariées** | **${entrees.apparies}** |`);
  p(`| Simula seul (MT5 n'a pas pris) | ${entrees.simSeule.length} |`);
  p(`| MT5 seul (Simula n'a pas vu) | ${entrees.mt5Seule.length} |`);
  p();
  p(ENTETE_STATS);
  p(ligneStats("écart d'heure d'entrée (min)", entrees.ecartHeure, 1));
  p(ligneStats("écart de prix d'entrée", entrees.ecartPrix, 5));
  p(ligneStats("écart de prix d'entrée (%)", entrees.ecartPrixPct, 4));
  p(ligneStats("écart de prix d'entrée (en R)", entrees.ecartPrixR, 4));
  p();
  if (entrees.simSeule.length) {
    p(
      `### Entrées prises par Simula seul (${entrees.simSeule.length}, ${Math.min(N, entrees.simSeule.length)} affichées)`,
    );
    p();
    p("| entrée Simula | prix | motif | R net | € |");
    p("|---|---:|---|---:|---:|");
    for (const t of entrees.simSeule.slice(0, N)) {
      p(
        `| ${iso(t.entree_t)} | ${fr(t.entree, 5)} | ${motifSimula(t)} | ${sgn(rNet(t), 2)} | ${sgn(rNet(t) * k, 0)} |`,
      );
    }
    p();
    p(
      `Poids total : **${sgn(ecart.bucket.simSeule, 0)} €** de résultat Simula sans contrepartie MT5.`,
    );
    p();
  }
  if (entrees.mt5Seule.length) {
    p(
      `### Entrées prises par MT5 seul (${entrees.mt5Seule.length}, ${Math.min(N, entrees.mt5Seule.length)} affichées)`,
    );
    p();
    p("| entrée MT5 | prix | motif | net € |");
    p("|---|---:|---|---:|");
    for (const t of entrees.mt5Seule.slice(0, N)) {
      p(`| ${iso(t.entree_t)} | ${fr(t.entree, 5)} | ${t.motif || "?"} | ${sgn(t.net, 0)} |`);
    }
    p();
    p(`Poids total : **${sgn(ecart.bucket.mt5Seule, 0)} €** de résultat MT5 que Simula ignore.`);
    p();
  }

  p("## 3. Sorties (sur les " + entrees.apparies + " entrées communes)");
  p();
  p(`Sorties à la même heure (± tolérance) : **${sorties.memeHeure} / ${entrees.apparies}**.`);
  p(`Même motif de sortie : **${sorties.memeMotif} / ${entrees.apparies}**.`);
  p(`Résultat de signe opposé : **${sorties.signeOppose.length} / ${entrees.apparies}**.`);
  p();
  p("| motif Simula → MT5 | trades |");
  p("|---|---:|");
  for (const [nom, n] of sorties.matrice) p(`| ${nom} | ${n} |`);
  p();
  p(ENTETE_STATS);
  p(ligneStats("écart d'heure de sortie (min)", sorties.ecartHeure, 1));
  p(ligneStats("écart de prix de sortie", sorties.ecartPrix, 5));
  p(ligneStats("écart de prix de sortie (en R)", sorties.ecartPrixR, 4));
  p(ligneStats("durée Simula (h)", sorties.dureeSim, 1));
  p(ligneStats("durée MT5 (h)", sorties.dureeMt5, 1));
  p();
  const divergentes = cmp.paires
    .filter((x) => motifSimula(x.sim) !== x.mt5.motif)
    .sort((a, b) => Math.abs(b.mt5.net - rNet(b.sim) * k) - Math.abs(a.mt5.net - rNet(a.sim) * k));
  if (divergentes.length) {
    p(
      `### Sorties divergentes (${divergentes.length}, les ${Math.min(N, divergentes.length)} plus coûteuses)`,
    );
    p();
    p("| entrée | Simula : sortie / motif / R | MT5 : sortie / motif / € | écart € |");
    p("|---|---|---|---:|");
    for (const x of divergentes.slice(0, N)) {
      p(
        `| ${iso(x.sim.entree_t)} | ${iso(x.sim.sortie_t)} · ${motifSimula(x.sim)} · ${sgn(rNet(x.sim), 2)} R | ${iso(x.mt5.sortie_t)} · ${x.mt5.motif || "?"} · ${sgn(x.mt5.net, 0)} € | ${sgn(x.mt5.net - rNet(x.sim) * k, 0)} |`,
      );
    }
    p();
  }

  p("## 4. Frais");
  p();
  p(
    "Ce que Simula modélise. Le spread n'est plus déduit du R : il est payé dans le prix d'entrée (`px = open × (1 + spread)`), donc porté par le stop et l'objectif. Ne restent en coût post-hoc que la commission et le portage :",
  );
  p();
  p(ENTETE_STATS);
  p(ligneStats("spread modélisé (R/trade)", frais.simSpreadR, 4));
  p(ligneStats("commission modélisée (R/trade)", frais.simCommR, 4));
  p(ligneStats("swap modélisé (R/trade)", frais.simSwapR, 4));
  p();
  p(
    `Coût total modélisé sur les entrées communes : **${fr(frais.simCoutTotalR, 2)} R** = ${sgn(-frais.simCoutTotalR * k, 0)} €.`,
  );
  p();
  p("Ce que MT5 facture réellement :");
  p();
  p("| poste | total € | en R (à " + fr(k, 2) + " €/R) |");
  p("|---|---:|---:|");
  p(`| Commission | ${sgn(frais.mt5Commission, 2)} | ${sgn(frais.mt5Commission / k, 2)} |`);
  p(`| Swap | ${sgn(frais.mt5Swap, 2)} | ${sgn(frais.mt5Swap / k, 2)} |`);
  p(
    `| Profit (hors commission et swap) | ${sgn(frais.mt5Profit, 2)} | ${sgn(frais.mt5Profit / k, 2)} |`,
  );
  p(`| **Net** | **${sgn(frais.mt5Net, 2)}** | **${sgn(frais.mt5Net / k, 2)}** |`);
  p();
  p(
    "Spread réellement subi, déduit de l'écart de prix d'entrée (MT5 achète à l'ask, Simula à l'open du CSV) :",
  );
  p();
  p(ENTETE_STATS);
  p(ligneStats("spread impliqué (prix)", frais.spreadImpliquePrix, 5));
  p(ligneStats("spread impliqué (R/trade)", frais.spreadImpliqueR, 4));
  p(ligneStats("swap MT5 (R/trade)", frais.mt5SwapR, 4));
  p(ligneStats("commission MT5 (R/trade)", frais.mt5CommissionR, 4));
  p();
  p(
    `Réglage Simula : spread de repli ${fr(reglages.spread, 4)} % · swap ${fr(reglages.swap, 3)} %/an · commission ${fr(reglages.commission, 4)} %.`,
  );
  p();

  p("## 5. D'où vient l'écart");
  p();
  p("| poste | € |");
  p("|---|---:|");
  p(
    `| Résultat Simula (${fr(ecart.totalSimR, 2)} R × ${fr(k, 2)} €) | ${sgn(ecart.totalSimEur, 0)} |`,
  );
  p(`| Résultat MT5 | ${sgn(ecart.totalMt5Eur, 0)} |`);
  p(`| **Écart total (MT5 − Simula)** | **${sgn(ecart.total, 0)}** |`);
  p("| | |");
  p(`| dont trades pris par Simula seul | ${sgn(-ecart.bucket.simSeule, 0)} |`);
  p(`| dont trades pris par MT5 seul | ${sgn(ecart.bucket.mt5Seule, 0)} |`);
  p(`| dont sorties divergentes | ${sgn(ecart.bucket.sortieDifferente, 0)} |`);
  p(`| dont même sortie, écart résiduel | ${sgn(ecart.bucket.memeSortie, 0)} |`);
  p(
    `| &nbsp;&nbsp;→ expliqué par les frais MT5 (commission + swap + spread) | ${sgn(ecart.fraisAttendus, 0)} |`,
  );
  p(`| &nbsp;&nbsp;→ **inexpliqué** | **${sgn(ecart.inexplique, 0)}** |`);
  p(`| contrôle : somme des postes | ${sgn(ecart.controle, 0)} |`);
  p();
  p(
    Math.abs(ecart.inexplique) < 0.02 * Math.abs(ecart.total)
      ? "Le résidu inexpliqué est négligeable : l'écart tient entièrement aux trades non communs, aux sorties divergentes et aux frais listés ci-dessus."
      : "⚠ Un résidu inexpliqué subsiste sur des trades pourtant identiques : la conversion R → € ou le prix de sortie ne colle pas. Rejouer avec --eur-par-r pour trancher.",
  );
  p();

  const rendu = L.join("\n");
  console.log(rendu);

  if (o["out-csv"]) {
    const lignes = [
      "statut;entree_sim;entree_mt5;prix_sim;prix_mt5;sortie_sim;sortie_mt5;prix_sortie_sim;prix_sortie_mt5;motif_sim;motif_mt5;R;R_net;eur_sim;eur_mt5;ecart_eur",
    ];
    for (const x of cmp.paires) {
      lignes.push(
        [
          "apparie",
          iso(x.sim.entree_t),
          iso(x.mt5.entree_t),
          x.sim.entree,
          x.mt5.entree,
          iso(x.sim.sortie_t),
          iso(x.mt5.sortie_t),
          x.sim.sortie,
          x.mt5.sortie,
          motifSimula(x.sim),
          x.mt5.motif,
          x.sim.R,
          rNet(x.sim),
          rNet(x.sim) * k,
          x.mt5.net,
          x.mt5.net - rNet(x.sim) * k,
        ].join(";"),
      );
    }
    for (const t of cmp.simSeule) {
      lignes.push(
        [
          "simula_seul",
          iso(t.entree_t),
          "",
          t.entree,
          "",
          iso(t.sortie_t),
          "",
          t.sortie,
          "",
          motifSimula(t),
          "",
          t.R,
          rNet(t),
          rNet(t) * k,
          "",
          -rNet(t) * k,
        ].join(";"),
      );
    }
    for (const t of cmp.mt5Seule) {
      lignes.push(
        [
          "mt5_seul",
          "",
          iso(t.entree_t),
          "",
          t.entree,
          "",
          iso(t.sortie_t),
          "",
          t.sortie,
          "",
          t.motif,
          "",
          "",
          "",
          t.net,
          t.net,
        ].join(";"),
      );
    }
    writeFileSync(o["out-csv"], lignes.join("\n") + "\n");
    console.error(`Journal apparié écrit : ${o["out-csv"]} (${lignes.length - 1} lignes)`);
  }
  if (o.json) {
    writeFileSync(
      o.json,
      JSON.stringify(
        {
          reglages,
          cfg,
          entrees: { ...entrees, simSeule: undefined, mt5Seule: undefined },
          sorties: { ...sorties, signeOppose: undefined },
          frais,
          ecart,
        },
        null,
        2,
      ),
    );
    console.error(`JSON écrit : ${o.json}`);
  }
}

function pfDe(nets) {
  const g = nets.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const pertes = nets.filter((x) => x <= 0).reduce((a, b) => a + b, 0);
  return pertes !== 0 ? g / Math.abs(pertes) : Infinity;
}
function compter(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${n} ${c}`)
    .join(" · ");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
