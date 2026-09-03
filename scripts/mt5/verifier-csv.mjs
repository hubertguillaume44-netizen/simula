#!/usr/bin/env node
/**
 * Contrôle la colonne de spread d'un CSV exporté, AVANT de mesurer quoi que ce soit.
 *
 * Un spread à zéro n'est pas un spread nul : c'est une information absente. Le moteur
 * refuse alors la bougie (elle ne peut pas passer le plafond), et si toute une journée
 * est à zéro le signal du jour est perdu. Sur les exports du 3 septembre, Germany40 et
 * BITCOIN portaient 34 % et 36 % de bougies sans spread — 100 % sur 2019-2021, la M1 de
 * ces symboles ne remontant pas si loin chez le courtier. Mesurer dessus revenait à
 * mesurer sur deux ans de vide sans que rien ne le dise.
 *
 * À l'inverse, des zéros CONCENTRÉS sur l'heure d'ouverture ne sont pas un défaut :
 * GOLD et Japan225 en ont 88 % et 90 % à 00:00, l'heure où ces marchés sont en pause.
 * Aucun cours n'y est coté, le robot ne peut pas y entrer, et le moteur refuse la
 * bougie pour la même raison. C'est l'accord, pas l'écart.
 *
 *   node scripts/mt5/verifier-csv.mjs AUDCAD_H1.csv GOLD_H1.csv …
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { chargerMoteur } from "./charger-moteur.mjs";

const M = await chargerMoteur();
const SEUIL_ANNEE = 20;   // % de bougies sans spread au-delà duquel l'année est inutilisable

const pct = (a, b) => (b ? (100 * a) / b : 0);
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

function verifier(chemin) {
  const df = M.nettoyer(M.texteVersDf(readFileSync(chemin, "utf8")));
  const parAn = new Map(), parH = new Map();
  let zeros = 0;
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]), a = d.getUTCFullYear(), h = d.getUTCHours();
    const nul = !(df.sp && df.sp[i] > 0);
    if (nul) zeros++;
    if (!parAn.has(a)) parAn.set(a, [0, 0]);
    const ea = parAn.get(a); ea[0]++; if (nul) ea[1]++;
    if (!parH.has(h)) parH.set(h, [0, 0, []]);
    const eh = parH.get(h); eh[0]++; if (nul) eh[1]++; else eh[2].push(df.sp[i]);
  }
  // heure d'ouverture : celle qui porte le plus de « premières bougies du jour »
  const prem = new Map();
  let jour = null;
  for (let i = 0; i < df.n; i++) {
    const j = Math.floor(df.t[i] / 86400000);
    if (j === jour) continue;
    jour = j;
    const h = new Date(df.t[i]).getUTCHours();
    prem.set(h, (prem.get(h) || 0) + 1);
  }
  const hOuv = [...prem.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const nom = basename(chemin);
  const annees = [...parAn.entries()].sort();
  const mauvaises = annees.filter(([, [n, z]]) => pct(z, n) >= SEUIL_ANNEE);
  console.log(`\n${nom}`);
  console.log(`  ${df.n} bougies, ${new Date(df.t[0]).toISOString().slice(0, 10)} → `
    + `${new Date(df.t[df.n - 1]).toISOString().slice(0, 10)}, ${pct(zeros, df.n).toFixed(2)} % sans spread`);
  console.log(`  par année : ${annees.map(([a, [n, z]]) => `${a} ${pct(z, n).toFixed(0)}%`).join("  ")}`);

  const eo = parH.get(hOuv);
  const eSeance = parH.get((hOuv + 6) % 24);
  console.log(`  ouverture ${String(hOuv).padStart(2, "0")}h : médiane ${med(eo[2])} pts, `
    + `${pct(eo[1], eo[0]).toFixed(0)} % sans spread — séance : médiane ${med(eSeance[2])} pts`);

  if (mauvaises.length) {
    console.log(`  ⚠ INUTILISABLE sur ${mauvaises.map(([a]) => a).join(", ")} : `
      + `plus de ${SEUIL_ANNEE} % de bougies sans spread. La M1 du courtier ne remonte pas `
      + `jusque-là — mesurez à partir de ${Number(mauvaises[mauvaises.length - 1][0]) + 1}.`);
  } else if (pct(eo[1], eo[0]) > 50) {
    console.log(`  ✓ les zéros sont concentrés sur l'heure d'ouverture : marché en pause, `
      + `bougie non traitable. Le moteur la refusera, comme le robot.`);
  } else {
    console.log("  ✓ colonne de spread exploitable.");
  }
  return mauvaises.length === 0;
}

const fichiers = process.argv.slice(2);
if (!fichiers.length) {
  console.error("Usage : node scripts/mt5/verifier-csv.mjs <fichier.csv> [...]");
  process.exit(2);
}
let bon = true;
for (const f of fichiers) bon = verifier(f) && bon;
process.exit(bon ? 0 : 1);
