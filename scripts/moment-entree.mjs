#!/usr/bin/env node
/**
 * Même signal, quatre moments d'exécution — mesurés EN LOT, sortis en CSV.
 *
 * Le signal est lu sur la clôture de la bougie D1 ; seule change la bougie H1 sur
 * laquelle l'ordre part :
 *
 *   ouverture  — la première bougie du jour (l'actuel : 00:00, l'heure du rollover)
 *   spread     — la première bougie du jour dont le spread passe sous la médiane de la série
 *   glissant   — idem, contre la médiane des ~250 dernières séances
 *   heure      — une heure fixe de séance (--heure, 08:00 par défaut)
 *
 * LA MESURE PASSE PAR LE MOTEUR LUI-MÊME : backtesterSuivi + cfg.moment, le chemin
 * exact que l'application et le robot exporté suivront. Un script qui mesurerait avec
 * sa propre sélection de bougies publierait des chiffres que personne ne peut rejouer.
 * Le suivi de position reste en H1 aux quatre moments : stop, objectif et paliers
 * voient la même granularité, sinon on comparerait aussi des sorties différentes.
 *
 *   node scripts/moment-entree.mjs --csv AUDCAD_H1.csv --ref AUDCAD
 *   node scripts/moment-entree.mjs --dossier exports/ --sortie moments.csv
 *   node scripts/moment-entree.mjs --csv GOLD_H1.csv,AUDCAD_H1.csv --sortie moments.csv
 *
 * En lot, la configuration de chaque instrument vient de sa référence (references.mjs)
 * quand elle existe, sinon des défauts — et elle est ÉCRITE dans le CSV : un verdict
 * sans sa configuration n'est ni reproductible ni comparable. La médiane de spread de
 * la série et la date de mesure y sont aussi : c'est ce que le robot exporté embarque
 * pour honorer les moments « spread » sans recalculer sur un autre historique.
 *
 * Le fichier de sortie est la matière que l'application lit (dépôt « moments.csv ») :
 * son format compte plus que son affichage. Séparateur « ; », décimales à point.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { chargerMoteur } from "./mt5/charger-moteur.mjs";
import { construireConfig, lirePaliers, PALIERS_REFERENCE } from "./mt5/config.mjs";
import { REFERENCES } from "./mt5/references.mjs";

const num = (x, d) => (x === undefined ? d : Number(String(x).replace(",", ".")));

function args(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [cle, val] = a.slice(2).split("=");
    if (val !== undefined) { o[cle] = val; continue; }
    const suiv = argv[i + 1];
    if (suiv === undefined || suiv.startsWith("--")) o[cle] = true;
    else { o[cle] = suiv; i++; }
  }
  return o;
}

const jourDe = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const MOMENTS = ["ouverture", "spread", "glissant", "heure"];

/** Mesure un fichier : quatre lignes, une par moment. */
function mesurerFichier(M, chemin, o) {
  const sym = basename(chemin).replace(/\.csv$/i, "").replace(/_H1$/i, "").replace(/^#/, "");
  const debut = o.depuis ? Date.parse(`${o.depuis}T00:00:00Z`) : Date.UTC(2020, 0, 1);
  const df = M.decouper(M.texteVersDf(readFileSync(chemin, "utf8")), debut, undefined);
  // LA source des médianes est le moteur (medianesSpread) : la même que
  // backtesterSuivi applique — deux calculs auraient fini par diverger.
  const meds = M.medianesSpread(df);
  if (!meds) return { sym, erreur: "pas de colonne de spread exploitable" };
  const sp = meds.sp;
  const medSpread = meds.serie;

  // la configuration : la référence du symbole quand elle existe (--ref la force),
  // sinon les défauts — écrite dans chaque ligne du CSV
  let ref = null;
  if (o.ref) {
    const [rs, variante] = String(o.ref).split(":");
    ref = REFERENCES.find((x) => x.sym === rs && (!variante || x.variante === variante)) || null;
    if (!ref) throw new Error(`Référence inconnue : ${o.ref}. Connues : `
      + REFERENCES.map((x) => x.sym + (x.variante ? ":" + x.variante : "")).join(", "));
  } else {
    ref = REFERENCES.find((x) => x.sym === sym) || null;
  }
  const reglages = {
    entree: o.entree || ref?.entree || "croisement_ou_rebond",
    ligne: o.ligne || ref?.ligne || "mediane",
    periode: num(o.periode, ref?.periode ?? 15),
    sl: num(o.sl, ref?.sl ?? 0.5),
    rr: num(o.rr, ref?.rr ?? 2),
    filtres: ref?.filtres ?? [],
    sens: o.sens === "vente" ? "vente" : "achat",
    paliers: o.paliers !== undefined ? lirePaliers(o.paliers) : PALIERS_REFERENCE,
    commission: num(o.commission, 0),
    swap: num(o.swap, 0),
    debut,
  };
  const heureFixe = num(o.heure, 8);

  // le compte des signaux (et des perdus du moment « heure ») se lit sur la série de
  // décision, avec les MÊMES fonctions que le moteur
  const base = M.resampler(df, "D1");
  const cfgBase = construireConfig(reglages);
  const sigD1 = M.signalDe(base, cfgBase);
  const autoriseD1 = M.autorisePar(base, cfgBase.filtres);
  const parJour = new Map();
  for (let i = 0; i < df.n; i++) {
    const j = jourDe(df.t[i]);
    if (!parJour.has(j)) parJour.set(j, []);
    parJour.get(j).push(i);
  }
  // signaux perdus PAR MOMENT : un jour sans bougie qui satisfait le moment perd son
  // signal — jamais de repli sur l'ouverture, le robot ne peut pas entrer
  // rétroactivement (même règle que backtesterSuivi)
  let signaux = 0;
  const perdusPar = { ouverture: 0, spread: 0, glissant: 0, heure: 0 };
  for (let k = 0; k < base.n; k++) {
    if (!sigD1[k] || base.t[k] < debut) continue;
    if (autoriseD1 && !autoriseD1[k]) continue;
    signaux++;
    const idx = parJour.get(jourDe(base.t[k]));
    if (!idx) { for (const m of MOMENTS) perdusPar[m]++; continue; }
    if (!idx.some((i) => new Date(df.t[i]).getUTCHours() >= heureFixe)) perdusPar.heure++;
    if (!idx.some((i) => sp[i] > 0 && medSpread > 0 && sp[i] <= medSpread)) perdusPar.spread++;
    if (!idx.some((i) => sp[i] > 0 && meds.glissante[i] > 0 && sp[i] <= meds.glissante[i])) perdusPar.glissant++;
  }

  const lignes = [];
  for (const nom of MOMENTS) {
    const cfg = { ...construireConfig(reglages), moment: { type: nom, heure: heureFixe } };
    const trades = M.backtesterSuivi(df, cfg, "D1");
    const r = M.resume(trades);

    // Frais en R, rechiffrés avec la formule du moteur (coût ≈ spread% / stop%) : le
    // spread n'est pas déduit du R, il est dans le prix d'entrée — on le rend lisible.
    let spreadR = 0, commR = 0, swapR = 0, spreadPct = 0;
    const parT = new Map();
    for (let i = 0; i < df.n; i++) parT.set(df.t[i], i);
    for (const t of trades) {
      const slP = (Math.abs(t.entree - t.sl_initial) / t.entree) * 100;
      const iEnt = parT.get(t.entree_t);
      const sEnt = iEnt !== undefined && sp[iEnt] > 0 ? sp[iEnt] : df.spreadPctMoyen || 0;
      spreadPct += sEnt;
      spreadR += sEnt / slP;
      commR += (reglages.commission * 2) / slP;
      swapR += -(reglages.swap / 360) * (((t.sortie_t - t.entree_t) / 86400000) / slP);
    }
    const n = trades.length || 1;
    const heures = new Map();
    for (const t of trades) {
      const h = new Date(t.entree_t).getUTCHours();
      heures.set(h, (heures.get(h) || 0) + 1);
    }
    lignes.push({
      sym, moment: nom, heureFixe,
      trades: r.n, rNet: r.total, pf: r.pf, winRate: r.winRate, dd: r.dd,
      fraisR: spreadR + commR + swapR, spreadR,
      spreadMoyen: spreadPct / n, horsSpread: r.total + spreadR,
      signaux, perdus: perdusPar[nom] || 0,
      heuresExec: [...heures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([h, c]) => `${h}:${c}`).join("|"),
      reglages, medSpread,
      premiere: df.t[0], derniere: df.t[df.n - 1],
    });
  }
  return { sym, lignes };
}

const COLS = ["sym", "moment", "heure_fixe", "trades", "r_net", "pf", "taux_reussite_pct",
  "pire_creux_r", "frais_r", "spread_r", "spread_moyen_pct", "r_net_hors_spread",
  "signaux", "signaux_perdus", "heures_exec",
  "entree", "ligne", "periode", "sl_pct", "rr", "filtres",
  "med_spread_pct", "mesure_le", "premiere", "derniere"];

function csvDe(toutes, quand) {
  const f2 = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : "");
  const out = [COLS.join(";")];
  for (const l of toutes) {
    out.push([l.sym, l.moment, l.moment === "heure" ? l.heureFixe : "",
      l.trades, f2(l.rNet, 2), f2(l.pf, 3), f2(l.winRate, 1), f2(l.dd, 2),
      f2(-l.fraisR, 2), f2(-l.spreadR, 2), f2(l.spreadMoyen, 5), f2(l.horsSpread, 2),
      l.signaux, l.perdus, l.heuresExec,
      l.reglages.entree, l.reglages.ligne, l.reglages.periode,
      f2(l.reglages.sl, 2), f2(l.reglages.rr, 2),
      (l.reglages.filtres || []).map((f) => f.type).join("+") || "aucun",
      f2(l.medSpread, 5), quand,
      new Date(l.premiere).toISOString().slice(0, 10),
      new Date(l.derniere).toISOString().slice(0, 10)].join(";"));
  }
  return out.join("\n") + "\n";
}

async function main() {
  const o = args(process.argv);
  const fichiers = [];
  if (o.dossier) {
    for (const f of readdirSync(String(o.dossier)).sort()) {
      if (/_H1\.csv$/i.test(f)) fichiers.push(join(String(o.dossier), f));
    }
  }
  if (o.csv) for (const c of String(o.csv).split(",")) if (c.trim()) fichiers.push(c.trim());
  if (!fichiers.length) {
    console.error("Rien à mesurer : --csv fichier[,fichier…] et/ou --dossier chemin (les *_H1.csv).");
    process.exit(1);
  }
  const M = await chargerMoteur();
  const quand = new Date().toISOString().slice(0, 10);
  const toutes = [];
  const erreurs = [];
  for (const chemin of fichiers) {
    let r;
    try { r = mesurerFichier(M, chemin, o); }
    catch (e) { erreurs.push(`${chemin} : ${e && e.message || e}`); continue; }
    if (r.erreur) { erreurs.push(`${chemin} : ${r.erreur}`); continue; }
    toutes.push(...r.lignes);
    console.error(`${r.sym} : ${r.lignes[0].signaux} signaux, `
      + r.lignes.map((l) => `${l.moment} ${l.rNet >= 0 ? "+" : ""}${l.rNet.toFixed(1)} R`).join(" · "));
  }
  const csv = csvDe(toutes, quand);
  if (o.sortie) {
    writeFileSync(String(o.sortie), csv);
    console.error(`${toutes.length} ligne(s) écrites dans ${o.sortie} (${toutes.length / 4} instrument(s)).`);
  } else {
    process.stdout.write(csv);
  }
  for (const e of erreurs) console.error("ignoré — " + e);
  if (!toutes.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
