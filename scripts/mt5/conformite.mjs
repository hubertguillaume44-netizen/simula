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

const jour = (ms) => Math.floor(ms / 86400000);
const bougie = (ms) => Math.floor(ms / 3600000);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
/** « 2020.05.19 00:00 » → ms UTC */
const horo = (s) => Date.parse(s.trim().replace(/\./g, "-").replace(" ", "T") + ":00Z");

/** Lit les lignes CONF| du journal, quel que soit le bruit autour. */
export function lireConformite(texte) {
  const D = new Map(), T = new Map(), E = new Map(), S = new Map(), P = [];
  for (const brute of texte.split("\n")) {
    const i = brute.indexOf("CONF|");
    if (i < 0) continue;
    const c = brute.slice(i + 5).trim().split("|");
    if (c[0] === "D") {
      const t = horo(c[1]);
      D.set(jour(t), { t, signal: c[2] === "1", c1: +c[3], c2: +c[4], l1: +c[5], l2: +c[6],
        haut1: +c[7], bas1: +c[8], raison: c[9] || "" });
    } else if (c[0] === "T") {
      const t = horo(c[1]);
      if (!T.has(jour(t))) T.set(jour(t), []);
      T.get(jour(t)).push({ t, sp: +c[2], plafond: +c[3], accepte: c[4] === "1",
        quand: c[5], raison: c[6] || "" });
    } else if (c[0] === "E") {
      const t = horo(c[1]);
      E.set(jour(t), { t, reel: horo(c[2]), prix: +c[3], sl: +c[4], tp: +c[5], lots: +c[6] });
    } else if (c[0] === "S") {
      // La sortie est indexée sur le jour de la BOUGIE de sortie, pas sur celui de
      // l'entrée : une position ouverte lundi et fermée jeudi doit se retrouver là où
      // le moteur la ferme, sinon la comparaison des sorties compare deux trades.
      const t = horo(c[1]);
      S.set(jour(t), { t, reel: horo(c[2]), prix: +c[3], resultat: +c[4],
        swap: +c[5], commission: +c[6], motif: c[7] || "" });
    } else if (c[0] === "P") {
      P.push({ t: horo(c[1]), parcours: +c[2], avant: +c[3], apres: +c[4], extreme: +c[5] });
    }
  }
  return { D, T, E, S, P };
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.log || !o.csv || !o.ref) {
    console.error("Usage : --log <journal> --csv <serie.csv> --ref <SYMBOLE[:variante]>");
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
    ...construireConfig({ ...ref, paliers: PALIERS_REFERENCE, debut }),
    spread_max_facteur: Number(o.facteur ?? M.SPREAD_FACTEUR),
    ...(plage.complete ? {} : { fin: plage.fin }),
  };

  // Le moteur, sur la même série et la même configuration.
  const sup = M.resampler(df, "D1");
  const signal = M.signalDe(sup, cfg);
  const autorise = M.autorisePar(sup, cfg.filtres);
  const trades = M.backtesterSuivi(df, cfg, "D1");
  const entrees = new Map(trades.map((t) => [jour(t.entree_t), t]));
  const sorties = new Map(trades.map((t) => [jour(t.sortie_t), t]));

  const sp = M.spreadEnPct(df);
  const seuil = M.seuilSpread(df, cfg.spread_max_facteur);
  const parBougie = new Map();
  for (let i = 0; i < df.n; i++) parBougie.set(bougie(df.t[i]), i);

  // décision du moteur, jour par jour, alignée sur les seaux D1
  const decision = new Map();
  for (let k = 0; k < sup.n; k++) {
    if (sup.t[k] < debut || (cfg.fin && sup.t[k] >= cfg.fin)) continue;
    decision.set(jour(sup.t[k]), {
      signal: !!signal[k] && !(autorise && !autorise[k]),
      brut: !!signal[k],
      filtre: !autorise || !!autorise[k],
    });
  }

  const cat = new Map();
  const exemples = new Map();
  const noter = (nom, texte) => {
    cat.set(nom, (cat.get(nom) || 0) + 1);
    if (!exemples.has(nom)) exemples.set(nom, []);
    if (exemples.get(nom).length < 3) exemples.get(nom).push(texte);
  };

  const jours = [...new Set([...conf.D.keys(), ...decision.keys()])].sort((a, b) => a - b);
  let communs = 0;
  for (const j of jours) {
    const r = conf.D.get(j), m = decision.get(j);
    const d = iso(j * 86400000).slice(0, 10);
    if (!r) { noter("journée absente du journal", d); continue; }
    if (!m) { noter("journée absente du moteur", d); continue; }
    communs++;

    if (r.signal !== m.signal) {
      noter(r.signal ? "signal chez le robot seul" : "signal chez le moteur seul",
        `${d} — robot ${r.signal ? "SIGNAL" : "refus : " + r.raison}, moteur ${m.signal ? "SIGNAL" : (m.brut ? "écarté par un filtre" : "pas de signal")}`);
      continue;
    }
    if (!m.signal) continue;   // les deux refusent : rien à comparer plus loin

    const e = conf.E.get(j), t = entrees.get(j);
    if (!e && !t) continue;
    if (!e) { noter("entrée chez le moteur seul", `${d} — moteur ${iso(t.entree_t)}`); continue; }
    if (!t) {
      const der = (conf.T.get(j) || []).slice(-1)[0];
      noter("entrée chez le robot seul",
        `${d} — robot ${iso(e.t)}${der ? `, dernière tentative ${der.accepte ? "acceptée" : "refusée : " + der.raison}` : ""}`);
      continue;
    }
    if (bougie(e.t) !== bougie(t.entree_t)) {
      const i = parBougie.get(bougie(t.entree_t));
      noter("bougie d'entrée différente",
        `${d} — moteur ${iso(t.entree_t)} (spread ${i !== undefined ? sp[i].toFixed(5) : "?"} / plafond ${i !== undefined ? seuil[i].toFixed(5) : "?"}), robot ${iso(e.t)} (tentatives ${(conf.T.get(j) || []).map((x) => `${new Date(x.t).getUTCHours()}h:${x.sp.toFixed(5)}${x.accepte ? "✓" : "✗"}`).join(" ")})`);
      continue;
    }
    const ecart = Math.abs(e.prix - t.entree) / (t.entree - t.sl_initial);
    if (ecart > 0.02) {
      noter("prix d'entrée différent",
        `${d} ${iso(t.entree_t)} — moteur ${t.entree}, robot ${e.prix} (${(ecart * 100).toFixed(1)} % du risque)`);
    }
  }

  // Les SORTIES, comparées à part. Une entrée juste avec une sortie fausse donne le
  // même nombre de trades et un R différent : sans ce bloc, l'écart restait sans nom.
  if (conf.S.size) {
    for (const j of [...new Set([...conf.S.keys(), ...sorties.keys()])].sort((a, b) => a - b)) {
      const r = conf.S.get(j), m = sorties.get(j);
      const d = iso(j * 86400000).slice(0, 10);
      if (!r || !m) { noter(r ? "sortie chez le robot seul" : "sortie chez le moteur seul", d); continue; }
      if (bougie(r.t) !== bougie(m.sortie_t)) {
        noter("bougie de sortie différente", `${d} — moteur ${iso(m.sortie_t)} (${m.motif}), robot ${iso(r.t)} (${r.motif})`);
        continue;
      }
      const risque = Math.abs(m.entree - m.sl_initial);
      const ecart = risque > 0 ? Math.abs(r.prix - m.sortie) / risque : 0;
      if (ecart > 0.02) {
        noter("prix de sortie différent",
          `${d} ${iso(m.sortie_t)} — moteur ${m.sortie} (${m.motif}), robot ${r.prix} (${r.motif}) : ${(ecart * 100).toFixed(1)} % du risque`);
      }
    }
    const frais = [...conf.S.values()].reduce((a, x) => a + x.swap + x.commission, 0);
    const brut = [...conf.S.values()].reduce((a, x) => a + x.resultat, 0);
    console.log(`\nfrais du robot : ${frais.toFixed(2)} sur ${brut.toFixed(2)} de résultat `
      + `(${brut !== 0 ? (100 * frais / Math.abs(brut)).toFixed(1) : "?"} %) — swap et commission, ${conf.S.size} sorties`);
  }

  console.log(`\n${sym}${variante ? " " + variante : ""} — ${communs} journées comparées `
    + `(robot ${conf.D.size}, moteur ${decision.size}) ; `
    + `${conf.E.size} entrées robot, ${trades.length} moteur`
    + (conf.S.size ? ` ; ${conf.S.size} sorties robot` : ""));
  if (!cat.size) { console.log("  aucune divergence."); return 0; }
  console.log("\n  divergences, par nature :");
  for (const [nom, n] of [...cat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`\n  ${n.toString().padStart(5)}  ${nom}`);
    for (const ex of exemples.get(nom)) console.log(`         ${ex}`);
  }
  return 1;
}

// Exécuté seulement en ligne de commande : importé, le module ne doit rien faire, sinon
// `lireConformite` n'est pas testable — et c'est la partie qu'il faut verrouiller, un
// champ déplacé dans le format cassant la comparaison en silence.
if (process.argv[1] && process.argv[1].endsWith("conformite.mjs")) process.exit(main());
