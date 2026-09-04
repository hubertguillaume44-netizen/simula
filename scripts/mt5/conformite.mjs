#!/usr/bin/env node
/**
 * Compare, journée par journée, ce que le ROBOT a décidé et ce que le MOTEUR décide.
 *
 * Ce script existe parce que trouver un écart coûtait un aller-retour par hypothèse :
 * une exécution du testeur, une supposition, une correction, et on recommence. Sur le
 * plafond de spread, trois exécutions ont été dépensées pour deux suppositions fausses,
 * et la réponse est venue d'un journal instrumenté. Autant journaliser d'emblée.
 *
 * Le robot écrit, sous InpConformite, une ligne par fait :
 *
 *   D | date        | signal | c1 | c2 | l1 | l2 | haut1 | bas1 | raison du refus
 *   T | bougie H1   | spread | plafond | accepté | premiere/reprise | raison
 *   E | bougie H1   | heure réelle | prix | stop | objectif | lots
 *   S | bougie H1   | heure réelle | prix | résultat | swap | commission | motif
 *   P | heure       | parcours % | ancien stop | nouveau stop | extrême atteint
 *
 * On rend, pour chaque journée, la PREMIÈRE divergence et sa nature — signal, bougie
 * d'entrée, prix, plafond — au lieu d'un écart global qu'il faut ensuite instruire.
 *
 *   node scripts/mt5/conformite.mjs --log journal.log --csv AUDCAD_H1.csv --ref AUDCAD
 */
import { readFileSync } from "node:fs";
import { chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig, PALIERS_REFERENCE } from "./config.mjs";
import { REFERENCES } from "./references.mjs";
import { lireFichierMt5 } from "./parse-mt5.mjs";
// Une SEULE implémentation de la confrontation, partagée avec la page : deux copies
// auraient divergé, comme `src/lib/moteur.ts` a divergé de `moteur.js`.
import { lireConformite, confronter } from "../../conformite-noyau.js";
export { lireConformite };

const M = await chargerMoteur();

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const c = argv[i].slice(2);
    o[c] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return o;
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.log || !o.csv || !o.ref) {
    console.error("Usage : --log <journal> --csv <serie.csv> --ref <SYMBOLE[:variante]>"
      + "\n        [--sens vente] [--sans-palier]");
    process.exit(2);
  }
  const [sym, variante] = String(o.ref).split(":");
  const ref = REFERENCES.find((x) => x.sym === sym && (!variante || x.variante === variante));
  if (!ref) { console.error(`Référence inconnue : ${o.ref}`); process.exit(2); }

  const conf = lireConformite(lireFichierMt5(o.log));
  if (!conf.D.size) {
    console.error("Aucune ligne CONF| dans ce journal. Le robot a-t-il tourné avec "
      + "InpConformite = true ?");
    process.exit(2);
  }

  const df = M.nettoyer(M.texteVersDf(readFileSync(o.csv, "utf8")));
  const plage = M.plageExploitable(df);
  const debut = Math.max(Number(o.depuis ? Date.parse(o.depuis) : Date.UTC(2020, 0, 1)), plage.debut);
  const cfg = {
    // Le sens et les paliers se surchargent : la référence est à l'achat avec les trois
    // paliers, mais un robot de conformité peut tourner à la vente ou sans palier, et
    // c'est justement ce qu'il faut pouvoir confronter — la vente emprunte un chemin
    // entièrement en miroir, et le swap n'y est pas symétrique.
    ...construireConfig({
      ...ref,
      sens: o.sens === "vente" ? "vente" : (ref.sens || "achat"),
      paliers: o["sans-palier"] ? [] : PALIERS_REFERENCE,
      debut,
    }),
    spread_max_facteur: Number(o.facteur ?? M.SPREAD_FACTEUR),
    ...(plage.complete ? {} : { fin: plage.fin }),
    // Le portage relevé chez le courtier : sans lui on comparerait le R BRUT du moteur
    // au R du robot, qui paie. Sur GOLD l'écart est de 15,2 R sur 54,5.
    ...(ref.portage ? { frais: ref.portage } : {}),
    lire_reconstituees: true,
  };

  const res = confronter({ M, df, cfg, conf, debut, portage: ref.portage });
  const f = res.fraisRobot;
  if (f) {
    console.log(`\nfrais du robot, sur ${f.n} sorties : brut ${f.brut.toFixed(2)}, `
      + `swap ${f.swap.toFixed(2)}, commission ${f.commission.toFixed(2)} → net ${f.net.toFixed(2)} `
      + `(les frais pèsent ${f.partPct === null ? "?" : f.partPct.toFixed(1)} % du brut)`);
  }
  const b = res.bilan;
  if (b) {
    console.log(`\nR sur ${b.nRobot} trades robot / ${b.nMoteur} moteur `
      + `(cours ${sym} → devise du compte : ${b.change.toFixed(4)}) :`);
    console.log(`  brut   robot ${b.brutRobot.toFixed(1)}   moteur ${b.brutMoteur.toFixed(1)}   écart ${(b.brutMoteur - b.brutRobot).toFixed(1)}`);
    console.log(`  frais  robot ${b.fraisRobot.toFixed(1)} (portage ${b.portageRobot.toFixed(1)}, commission ${b.commissionRobot.toFixed(1)})`
      + `   moteur ${b.fraisMoteur.toFixed(1)}`);
    console.log(`  NET    robot ${b.netRobot.toFixed(1)}   moteur ${b.netMoteur.toFixed(1)}   `
      + `écart ${(b.netMoteur - b.netRobot).toFixed(1)}`);
    console.log(`\n  bande des deux lectures, en R net : [${b.bande[0].toFixed(1)} … ${b.bande[1].toFixed(1)}]`
      + `  largeur ${b.largeur.toFixed(1)} R`);
    console.log(`  robot à ${b.netRobot.toFixed(1)} : ${b.dedans ? "DANS la bande" : "HORS de la bande — défaut de modèle"}`
      + (b.dedans && b.positionPct !== null ? `, à ${b.positionPct.toFixed(0)} % du bas` : ""));
    console.log(`  ${b.ambigus} trades sur ${b.nLecture} (${(100 * b.ambigus / b.nLecture).toFixed(0)} %) dont l'issue dépend de l'ordre des mouvements dans une bougie`);
  }

  console.log(`\n${sym}${variante ? " " + variante : ""} — ${res.communs} journées comparées `
    + `(robot ${res.nJoursRobot}, moteur ${res.nJoursMoteur}) ; `
    + `${res.nEntreesRobot} entrées robot, ${res.nEntreesMoteur} moteur`
    + (res.nSortiesRobot ? ` ; ${res.nSortiesRobot} sorties robot` : ""));
  if (!res.divergences.length) { console.log("  aucune divergence."); return 0; }
  console.log("\n  divergences, par nature :");
  for (const d of res.divergences) {
    console.log(`\n  ${String(d.n).padStart(5)}  ${d.nom}`);
    for (const ex of d.exemples) console.log(`         ${ex}`);
  }
  return 1;
}

// Exécuté seulement en ligne de commande : importé, le module ne doit rien faire, sinon
// `lireConformite` n'est pas testable — et c'est la partie qu'il faut verrouiller, un
// champ déplacé dans le format cassant la comparaison en silence.
if (process.argv[1] && process.argv[1].endsWith("conformite.mjs")) process.exit(main());
