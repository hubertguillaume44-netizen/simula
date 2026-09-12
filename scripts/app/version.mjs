#!/usr/bin/env node
/**
 * Date le fichier livré : `VERSION_APP` prend la date du jour, au format AAMMJJ.
 *
 *   npm run app:version      # pose la date du jour
 *   npm run app:version -- --voir   # dit ce qui est posé, sans rien écrire
 *
 * ————— POURQUOI CE NUMÉRO COMPTE —————
 *
 * Il ne sert pas à faire joli dans un pied de page. Il part avec CHAQUE rapport d'avis
 * et CHAQUE fichier de diagnostic : c'est la seule chose qui dise quelle version
 * l'utilisateur avait sous les yeux quand il a vu le défaut qu'il rapporte. Figé, il ne
 * se contente pas d'être inutile — il MENT, et un rapport qui ment sur sa version fait
 * chercher un défaut là où il n'est plus.
 *
 * Il est distinct de `MOTEUR_V`, qui dit comment les trades sont calculés et sert de
 * clé de cache. Celui-ci ne conditionne aucun calcul : le changer ne périme rien et
 * n'efface rien. C'est une étiquette, et c'est pour ça qu'on peut la bouger sans
 * précaution — mais aussi pour ça qu'on l'oublie.
 *
 * Le format est une DATE, pas un compteur : « 260912 » se lit tout de suite comme le
 * 12 septembre 2026, alors que « v47 » demande un tableau de correspondance que
 * personne ne tient. Deux livraisons le même jour portent le même numéro, et c'est
 * assumé : la journée est la granularité utile pour retrouver ce qui tournait.
 *
 * Après ce script : `npm run app:solo`, sans quoi l'artefact annonce l'ancienne date et
 * `publier-solo.mjs` refuse de publier — il compare les deux exprès.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(new URL("../../", import.meta.url).pathname);
const SOURCE = path.join(RACINE, "Vena.dc.html");
const MARQUE = /(VERSION_APP = ')([^']+)(')/;

/** La date du jour en AAMMJJ, dans le fuseau de la machine — celui de qui livre. */
export function dateDuJour(d = new Date()) {
  const deux = (n) => String(n).padStart(2, "0");
  return deux(d.getFullYear() % 100) + deux(d.getMonth() + 1) + deux(d.getDate());
}

const src = readFileSync(SOURCE, "utf8");
const m = MARQUE.exec(src);
if (!m) {
  console.error("[version] VERSION_APP est introuvable dans Vena.dc.html.");
  process.exit(1);
}
const avant = m[2];
const jour = dateDuJour();

if (process.argv.includes("--voir")) {
  console.log(`[version] posée : ${avant} · aujourd'hui : ${jour}`
    + (avant === jour ? " — à jour." : " — À DATER."));
  process.exit(0);
}

if (avant === jour) {
  console.log(`[version] déjà datée d'aujourd'hui (${jour}) — rien à faire.`);
  process.exit(0);
}
writeFileSync(SOURCE, src.replace(MARQUE, `$1${jour}$3`));
console.log(`[version] ${avant} → ${jour}. Relancez « npm run app:solo » pour dater l'artefact.`);
