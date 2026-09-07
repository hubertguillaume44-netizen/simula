#!/usr/bin/env node
/**
 * Fabrique la VRAIE paire de clés de licence — à exécuter UNE fois avant la vente.
 *
 *   node scripts/licence/generer-cles.mjs
 *
 * Ce qu'il fait :
 *   1. génère une paire Ed25519 neuve ;
 *   2. remplace la clé publique dans Sivula.dc.html (constante CLE_PUB_LICENCE) —
 *      rebâtissez ensuite le solo : node scripts/app/solo.mjs ;
 *   3. affiche la clé privée UNE FOIS, à coller dans la variable d'environnement
 *      LICENCE_CLE_PRIVEE de la fonction Netlify. Elle n'est écrite dans AUCUN
 *      fichier : si vous la perdez, relancez ce script (les anciens codes émis
 *      deviennent alors invalides — renvoyez-les avec signer.mjs).
 *
 * La clé qui vit dans le dépôt (cle-demo.mjs) est une clé de DÉMONSTRATION,
 * connue de tous : la fonction refuse de signer avec elle.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { genererCles } from "./licence-noyau.mjs";

const cles = genererCles();
const fichier = new URL("../../Sivula.dc.html", import.meta.url);
const page = readFileSync(fichier, "utf8");
const re = /(CLE_PUB_LICENCE = ')[A-Za-z0-9_-]+(')/;
if (!re.test(page)) {
  console.error("CLE_PUB_LICENCE introuvable dans Sivula.dc.html — rien n'a été modifié.");
  process.exit(1);
}
writeFileSync(fichier, page.replace(re, "$1" + cles.publique + "$2"));

console.log("Clé publique posée dans Sivula.dc.html :", cles.publique);
console.log("Rebâtissez le fichier livré : node scripts/app/solo.mjs");
console.log("");
console.log("Clé PRIVÉE — affichée une seule fois, à coller dans Netlify");
console.log("(Site settings → Environment variables → LICENCE_CLE_PRIVEE) :");
console.log("");
console.log(cles.privee);
console.log("");
console.log("Ne la mettez ni dans le dépôt, ni dans un fichier, ni dans un mail.");
