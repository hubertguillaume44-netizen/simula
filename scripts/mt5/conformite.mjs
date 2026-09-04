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
  const sorties = [];
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
      const s = { t, reel: horo(c[2]), prix: +c[3], resultat: +c[4],
        swap: +c[5], commission: +c[6], motif: c[7] || "" };
      sorties.push(s);
      // Indexée par jour pour l'appariement, mais AUSSI gardée entière : deux positions
      // peuvent se clore le même jour, et la Map n'en garderait qu'une. Les frais
      // totalisés sur la Map annonçaient -124,8 % du résultat au lieu de 30 %.
      S.set(jour(t), s);
    } else if (c[0] === "P") {
      P.push({ t: horo(c[1]), parcours: +c[2], avant: +c[3], apres: +c[4], extreme: +c[5] });
    }
  }
  return { D, T, E, S, P, sorties };
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

  // Le robot tourne sur toute la période du testeur, le moteur sur la plage mesurable :
  // hors de celle-ci il n'y a pas de désaccord, il n'y a rien à comparer. Sans ce
  // recadrage, BITCOIN affichait 653 « journée absente du moteur » et 101 « sortie chez
  // le robot seul » qui ne sont que les deux premières années, où le courtier n'a relevé
  // aucun spread.
  const jourDans = (j) => j * 86400000 >= debut - 86400000
    && (!cfg.fin || j * 86400000 < cfg.fin);
  const jours = [...new Set([...conf.D.keys(), ...decision.keys()])]
    .filter(jourDans).sort((a, b) => a - b);
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
    for (const j of [...new Set([...conf.S.keys(), ...sorties.keys()])].filter(jourDans).sort((a, b) => a - b)) {
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
    // sur TOUTES les sorties, pas sur la Map par jour
    const sw = conf.sorties.reduce((a, x) => a + x.swap, 0);
    const co = conf.sorties.reduce((a, x) => a + x.commission, 0);
    const brut = conf.sorties.reduce((a, x) => a + x.resultat, 0);
    console.log(`\nfrais du robot, sur ${conf.sorties.length} sorties : brut ${brut.toFixed(2)}, `
      + `swap ${sw.toFixed(2)}, commission ${co.toFixed(2)} → net ${(brut + sw + co).toFixed(2)} `
      + `(les frais pèsent ${brut !== 0 ? (100 * (sw + co) / Math.abs(brut)).toFixed(1) : "?"} % du brut)`);
  }

  // ————— le chiffre que l'on cherche à faire coïncider —————
  if (conf.sorties.length && ref.portage) {
    const contrat = Number(ref.portage.contrat) || 0;
    const E = [];
    for (const [, e] of conf.E) E.push(e);
    // apparier entrées et sorties dans l'ordre : une position à la fois, donc la
    // n-ième sortie clôt la n-ième entrée
    // Le robot tourne sur toute la période du testeur ; le moteur, lui, se limite à la
    // plage réellement mesurable — celle où le courtier a relevé un spread. Comparer les
    // deux totaux sans recadrer additionne des trades que le moteur n'a jamais eu le
    // droit de prendre : sur #Germany40 (mesurable à partir d'octobre 2021) le robot en
    // portait 111 contre 76, sur BITCOIN (mars 2022) 455 contre 422.
    const dans = (t) => t >= debut && (!cfg.fin || t < cfg.fin);
    const tousEnt = [...conf.E.values()].sort((a, b) => a.t - b.t);
    const tousSor = [...conf.sorties].sort((a, b) => a.t - b.t);
    const garde = tousEnt.map((_, i) => dans(tousEnt[i].t));
    const ent = tousEnt.filter((_, i) => garde[i]);
    const sor = tousSor.filter((_, i) => garde[i]);
    // Le courtier tient les frais dans la devise du COMPTE (EUR), le risque se calcule
    // dans celle du SYMBOLE (USD sur GOLD) : diviser l'un par l'autre sous-estimait les
    // frais du robot de 10 %. On lit le cours sur les trades eux-mêmes — le résultat en
    // devise du compte divisé par le R, rapporté au risque en devise du symbole — puis
    // on l'applique à tous. Mesuré sur GOLD, ce cours implicite reproduit l'EUR/USD
    // réel : 0,848 en 2021 (1,18), 0,951 en 2022 (1,05), 0,922 en 2023 (1,08).
    const paires = [];
    for (let i = 0; i < Math.min(ent.length, sor.length); i++) {
      const rp = ent[i].prix - ent[i].sl;
      const r = (sor[i].prix - ent[i].prix) / rp;
      if (!Number.isFinite(r) || Math.abs(r) < 0.2 || !(ent[i].lots > 0) || contrat <= 0) continue;
      const f = Math.abs(sor[i].resultat / r) / (ent[i].lots * contrat * Math.abs(rp));
      if (f > 0) paires.push(f);
    }
    paires.sort((a2, b2) => a2 - b2);
    const change = paires.length ? paires[paires.length >> 1] : 1;

    let brut = 0, coutSwap = 0, coutComm = 0, k = 0;
    for (let i = 0; i < Math.min(ent.length, sor.length); i++) {
      const risquePrix = ent[i].prix - ent[i].sl;
      const r = (sor[i].prix - ent[i].prix) / risquePrix;
      if (!Number.isFinite(r)) continue;
      brut += r; k++;
      if (contrat > 0 && ent[i].lots > 0) {
        const risque = ent[i].lots * contrat * Math.abs(risquePrix) * change;
        coutSwap += -sor[i].swap / risque;
        coutComm += -sor[i].commission / risque;
      }
    }
    const rm = trades.reduce((a, t) => a + t.R, 0);
    const rmNet = trades.reduce((a, t) => a + (t.R_net !== undefined ? t.R_net : t.R), 0);
    console.log(`\nR sur ${k} trades robot / ${trades.length} moteur `
      + `(cours ${sym} → devise du compte : ${change.toFixed(4)}) :`);
    console.log(`  brut   robot ${brut.toFixed(1)}   moteur ${rm.toFixed(1)}   écart ${(rm - brut).toFixed(1)}`);
    console.log(`  frais  robot ${(coutSwap + coutComm).toFixed(1)} (portage ${coutSwap.toFixed(1)}, commission ${coutComm.toFixed(1)})`
      + `   moteur ${(rm - rmNet).toFixed(1)}`);
    console.log(`  NET    robot ${(brut - coutSwap - coutComm).toFixed(1)}   moteur ${rmNet.toFixed(1)}   `
      + `écart ${(rmNet - (brut - coutSwap - coutComm)).toFixed(1)}`);

    // La bande entre les deux lectures : c'est la promesse du produit. L'ordre des
    // mouvements à l'intérieur d'une bougie H1 est inconnu, donc le moteur ne peut pas
    // donner UN chiffre — il donne un intervalle, et ce que MT5 mesure doit tomber
    // dedans. Une bande qui ne contient pas le chiffre du robot est un défaut de
    // modèle, pas une incertitude honnête.
    const lire = (prudent) => M.backtesterSuivi(df, { ...cfg, sortie: { ...cfg.sortie, prudent } }, "D1");
    const bas = lire(true), haut = lire(false);
    const totNet = (a2) => a2.reduce((x, t) => x + (t.R_net !== undefined ? t.R_net : t.R), 0);
    const bNet = totNet(bas), hNet = totNet(haut);
    const robotNet = brut - coutSwap - coutComm;
    const dedans = robotNet >= Math.min(bNet, hNet) && robotNet <= Math.max(bNet, hNet);
    const amb = haut.filter((t) => t.ambigu).length;
    console.log(`\n  bande des deux lectures, en R net : [${Math.min(bNet, hNet).toFixed(1)} … ${Math.max(bNet, hNet).toFixed(1)}]`
      + `  largeur ${Math.abs(hNet - bNet).toFixed(1)} R`);
    console.log(`  robot à ${robotNet.toFixed(1)} : ${dedans ? "DANS la bande" : "HORS de la bande — défaut de modèle"}`
      + (dedans && Math.abs(hNet - bNet) > 0 ? `, à ${(100 * (robotNet - Math.min(bNet, hNet)) / Math.abs(hNet - bNet)).toFixed(0)} % du bas` : ""));
    console.log(`  ${amb} trades sur ${haut.length} (${(100 * amb / haut.length).toFixed(0)} %) dont l'issue dépend de l'ordre des mouvements dans une bougie`);
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
