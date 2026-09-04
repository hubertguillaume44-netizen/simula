#!/usr/bin/env node
/**
 * Où suivre la position : sur la bougie de décision, ou sur la H1 ?
 *
 * Le signal est lu sur la clôture D1 dans les deux cas — invariants 2, 3 et 5 intacts.
 * Seul change le pas auquel le stop, l'objectif et les paliers sont surveillés :
 *
 *   suivi D1 — l'actuel : une bougie journalière, dont on ne connaît que O/H/L/C
 *   suivi H1 — la position est suivie sur les 24 bougies H1 de la journée
 *
 * Le second n'a besoin d'aucune donnée supplémentaire : les H1 SONT les données de base
 * (invariant 1). Il n'exige pas non plus de toucher au moteur — `signal_force` suffit à
 * reporter le signal D1 sur la bougie H1 d'exécution.
 *
 *   node scripts/suivi-h1.mjs --csv GOLD_H1.csv --ligne ema --periode 5 --sl 0,6 --rr 3 \
 *        --mt5-eur 4519 --eur-par-r 200
 */
import { readFileSync } from "node:fs";
import { chargerMoteur } from "./mt5/charger-moteur.mjs";
import { construireConfig, lirePaliers, PALIERS_REFERENCE } from "./mt5/config.mjs";

const num = (x, d) => (x === undefined ? d : Number(String(x).replace(",", ".")));
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "—");
const sgn = (x, d = 1) =>
  Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d).replace(".", ",")}` : "—";

function args(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
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

const jourDe = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

async function main() {
  const o = args(process.argv);
  if (!o.csv) {
    console.error("Manque --csv");
    process.exit(1);
  }
  const M = await chargerMoteur();
  const debut = o.depuis ? Date.parse(`${o.depuis}T00:00:00Z`) : Date.UTC(2020, 0, 1);
  const df = M.decouper(M.texteVersDf(readFileSync(o.csv, "utf8")), debut, undefined);
  const ut = o.ut || "D1";
  const base = M.resampler(df, ut);

  const socle = {
    entree: o.entree || "croisement_ou_rebond",
    ligne: o.ligne || "mediane",
    periode: num(o.periode, 15),
    sl: num(o.sl, 0.5),
    rr: num(o.rr, 2),
    sens: o.sens === "vente" ? "vente" : "achat",
    paliers: o.paliers !== undefined ? lirePaliers(o.paliers) : PALIERS_REFERENCE,
    commission: num(o.commission, 0),
    swap: num(o.swap, 0),
    debut,
  };
  const eurParR = num(o["eur-par-r"], 200);
  const mt5 = o["mt5-eur"] !== undefined ? num(o["mt5-eur"]) : NaN;

  // indices H1 de chaque journée
  const parJour = new Map();
  for (let i = 0; i < df.n; i++) {
    const j = jourDe(df.t[i]);
    if (!parJour.has(j)) parJour.set(j, []);
    parJour.get(j).push(i);
  }

  const lignes = [];
  for (const prudent of [false, true]) {
    const cfg = construireConfig({ ...socle, prudent });
    const trBase = M.backtester(base, cfg);
    const rBase = M.resume(trBase);

    // même signal, reporté sur la première bougie H1 de la journée d'entrée
    const sig = M.signalDe(base, cfg);
    const force = new Array(df.n).fill(false);
    for (let k = 0; k < base.n; k++) {
      if (!sig[k] || base.t[k] < debut) continue;
      const idx = parJour.get(jourDe(base.t[k]));
      if (idx) force[idx[0]] = true;
    }
    const trH1 = M.backtester(df, { ...cfg, signal_force: force, filtres: [] });
    const rH1 = M.resume(trH1);
    lignes.push({ lecture: prudent ? "basse" : "haute", rBase, rH1 });
  }

  console.log(`# Suivi de position — ${o.symbole || o.csv}`);
  console.log();
  console.log(
    `Règle : ${socle.entree} · ${socle.ligne} ${socle.periode} · SL ${f(socle.sl, 2)} % · R/R ${f(socle.rr, 2)} · signal lu en ${ut}`,
  );
  console.log(
    `Conversion : ${f(eurParR, 0)} € par R${Number.isFinite(mt5) ? ` · MT5 mesure ${sgn(mt5, 0)} €` : ""}`,
  );
  console.log();
  console.log(
    `| suivi | lecture | trades | R net | € | facteur de profit | creux (R) | bougies ambiguës |${Number.isFinite(mt5) ? " écart à MT5 |" : ""}`,
  );
  console.log(`|---|---|---:|---:|---:|---:|---:|---:|${Number.isFinite(mt5) ? "---:|" : ""}`);
  for (const l of lignes) {
    for (const [nom, r] of [
      [ut, l.rBase],
      ["H1", l.rH1],
    ]) {
      const eur = r.total * eurParR;
      const ecart = Number.isFinite(mt5) ? ` ${sgn(eur - mt5, 0)} € |` : "";
      console.log(
        `| ${nom} | ${l.lecture} | ${r.n} | ${sgn(r.total)} | ${sgn(eur, 0)} | ${f(r.pf, 2)} | ${f(r.dd)} | ${f((100 * r.ambigus) / Math.max(1, r.n), 1)} % |${ecart}`,
      );
    }
  }
  console.log();
  const [haute, basse] = lignes;
  console.log(
    `Écart entre les deux lectures — suivi ${ut} : ${f(Math.abs(haute.rBase.total - basse.rBase.total))} R · suivi H1 : ${f(Math.abs(haute.rH1.total - basse.rH1.total))} R.`,
  );
  console.log(
    "Plus cet écart est large, moins la mesure est décidable : il chiffre la part du résultat qui dépend d'une convention de lecture et non de la donnée.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
