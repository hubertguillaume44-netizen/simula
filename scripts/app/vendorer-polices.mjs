#!/usr/bin/env node
/**
 * Rafraîchit les polices du système de design DANS le dépôt.
 *
 * La feuille livrée par le système commence par une importation distante vers le service
 * de polices de Google. Sur un produit payant, elle coûte trois choses : un réseau
 * d'entreprise qui bloque le domaine sert une page sans sa typographie, une panne du
 * service la retire sans recours, et chaque ouverture signale une visite à un tiers —
 * ce que la promesse « rien ne sort de votre navigateur » interdit.
 *
 * Ce script fait le travail une fois : il demande la feuille, télécharge les fichiers
 * `.woff2`, et réécrit les `@font-face` sur des chemins du dépôt. Il ne tourne PAS à la
 * construction — les polices sont versionnées, et une construction ne doit pas dépendre
 * d'un service tiers pour réussir. Il ne sert qu'à les remettre à jour à la main.
 *
 * Sous-ensembles latin et latin-ext seulement : l'application est en français, et les
 * noms d'instruments n'en sortent pas.
 *
 *   node scripts/app/vendorer-polices.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(new URL("../../", import.meta.url).pathname);
const DS = path.join(RACINE, "public/_ds/industry-cbc1f2df-2f0f-4cb9-a754-a8a64e9401b6");
const SOUS_ENSEMBLES = new Set(["latin", "latin-ext"]);
// le même appel que la feuille d'origine, avec les graisses que les jetons nomment
const FEUILLE = "https://fonts.googleapis.com/css2"
  + "?family=Barlow:wght@400;500;700&family=Barlow+Condensed:wght@400;600&display=swap";
// sans un en-tête de navigateur, le service rend du woff (ancien) au lieu du woff2
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const css = await (await fetch(FEUILLE, { headers: { "user-agent": UA } })).text();
mkdirSync(path.join(DS, "fonts"), { recursive: true });

const faces = [];
for (const [, sous, corps] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g)) {
  if (!SOUS_ENSEMBLES.has(sous)) continue;
  const fam = /font-family:\s*'([^']+)'/.exec(corps)[1];
  const poids = /font-weight:\s*(\d+)/.exec(corps)[1];
  const url = /url\((https:\/\/[^)]+)\)/.exec(corps)[1];
  const nom = fam.replace(/\s+/g, "") + "-" + poids + "-" + sous + ".woff2";
  writeFileSync(path.join(DS, "fonts", nom), Buffer.from(await (await fetch(url)).arrayBuffer()));
  faces.push("@font-face {" + corps.replace(url, "fonts/" + nom) + "}");
  console.log("  " + nom);
}
if (faces.length < 8) throw new Error("trop peu de fontes récupérées : " + faces.length);

// on remplace le bloc de @font-face dans la feuille, sans toucher au reste
const p = path.join(DS, "styles.css");
const feuille = readFileSync(p, "utf8");
const debut = feuille.indexOf("@font-face");
const fin = feuille.lastIndexOf("}", feuille.indexOf(":root")) + 1;
if (debut < 0 || fin <= debut) throw new Error("bloc de @font-face introuvable dans styles.css");
writeFileSync(p, feuille.slice(0, debut) + faces.join("\n") + "\n" + feuille.slice(fin));
console.log(faces.length + " fontes vendorées dans " + path.relative(RACINE, DS) + "/fonts");
