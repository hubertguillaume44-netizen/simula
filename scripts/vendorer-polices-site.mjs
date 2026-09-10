#!/usr/bin/env node
/**
 * Rafraîchit les polices DU SITE dans le dépôt.
 *
 * `src/styles.css` commençait par une importation distante vers le service de polices de
 * Google. Elle coûtait trois choses : un réseau qui bloque le domaine sert le site sans
 * sa typographie, une panne du service la retire sans recours, et chaque ouverture de
 * page signale une visite à un tiers — sur un outil qui touche à des données financières
 * personnelles, cette dernière ne se rattrape pas.
 *
 * Ce script fait le travail une fois : il demande la feuille, télécharge les `.woff2`, et
 * écrit `src/polices.css` avec des `@font-face` sur des chemins du dépôt. Il ne tourne PAS
 * à la construction — les polices sont versionnées, et une construction ne doit pas
 * dépendre d'un service tiers pour réussir.
 *
 * Il est le jumeau de scripts/app/vendorer-polices.mjs, qui fait le même travail pour
 * l'application. Deux scripts et non un : les deux jeux n'ont pas les mêmes graisses, et
 * celles du système de design de l'application se rafraîchissent avec lui.
 *
 * Sous-ensembles latin et latin-ext seulement, woff2 seul : le site est en français.
 *
 *   npm run site:polices
 *   node scripts/vendorer-polices-site.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(new URL("../", import.meta.url).pathname);
const DOSSIER = path.join(RACINE, "public/fonts");
const FEUILLE_CSS = path.join(RACINE, "src/polices.css");
const CHEMIN_PUBLIC = "/fonts";
const SOUS_ENSEMBLES = new Set(["latin", "latin-ext"]);

// Les graisses réellement utilisées par le site, et elles seules : --font-sans est
// Barlow, --font-display est Barlow Condensed (src/styles.css).
const FEUILLE =
  "https://fonts.googleapis.com/css2" +
  "?family=Barlow:ital,wght@0,400;0,500;0,600;1,400" +
  "&family=Barlow+Condensed:wght@500;600;700&display=swap";

// sans un en-tête de navigateur, le service rend du woff (ancien) au lieu du woff2
const NAVIGATEUR =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

function nomFichier(famille, graisse, style, sousEnsemble) {
  const base = famille.replace(/\s+/g, "");
  return `${base}-${graisse}${style === "italic" ? "italic" : ""}-${sousEnsemble}.woff2`;
}

/**
 * Découpe la feuille du service en blocs @font-face, un par sous-ensemble.
 *
 * Le service annonce chaque sous-ensemble par un commentaire placé AVANT son bloc, pas
 * dedans. On apparie donc le commentaire et le bloc qui le suit : découper sur
 * « @font-face » décalerait toutes les étiquettes d'un cran, et chaque fichier serait
 * enregistré sous le nom du suivant.
 */
function lireBlocs(css) {
  const blocs = [];
  for (const m of css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/gi)) {
    const [, sousEnsemble, corps] = m;
    const url = corps.match(/url\((https:[^)]+\.woff2)\)/);
    const famille = corps.match(/font-family:\s*'([^']+)'/);
    const graisse = corps.match(/font-weight:\s*(\d+)/);
    const style = corps.match(/font-style:\s*(\w+)/);
    const plage = corps.match(/unicode-range:\s*([^;]+);/);
    if (!url || !famille || !graisse) continue;
    blocs.push({
      famille: famille[1],
      graisse: graisse[1],
      style: style ? style[1] : "normal",
      plage: plage ? plage[1].trim() : "",
      url: url[1],
      sousEnsemble,
    });
  }
  return blocs;
}

const reponse = await fetch(FEUILLE, { headers: { "user-agent": NAVIGATEUR } });
if (!reponse.ok) throw new Error(`Feuille refusée : ${reponse.status} ${reponse.statusText}`);
const css = await reponse.text();

const blocs = lireBlocs(css).filter((b) => SOUS_ENSEMBLES.has(b.sousEnsemble));
if (blocs.length === 0) throw new Error("Aucun bloc retenu — la forme de la feuille a changé.");

const noms = blocs.map((b) => nomFichier(b.famille, b.graisse, b.style, b.sousEnsemble));
if (new Set(noms).size !== noms.length) {
  throw new Error(
    "Deux faces visent le même fichier — les étiquettes de sous-ensemble sont décalées.\n" +
    "Relire lireBlocs avant de réenregistrer quoi que ce soit.",
  );
}

mkdirSync(DOSSIER, { recursive: true });
const regles = [];
for (const b of blocs) {
  const nom = nomFichier(b.famille, b.graisse, b.style, b.sousEnsemble);
  const fichier = await fetch(b.url, { headers: { "user-agent": NAVIGATEUR } });
  if (!fichier.ok) throw new Error(`${nom} : ${fichier.status}`);
  writeFileSync(path.join(DOSSIER, nom), Buffer.from(await fichier.arrayBuffer()));
  regles.push(
    [
      "@font-face {",
      `  font-family: "${b.famille}";`,
      `  font-style: ${b.style};`,
      `  font-weight: ${b.graisse};`,
      // `swap` et non `block` : le texte s'affiche tout de suite dans la police système
      // et bascule quand la vraie arrive. Un site qui reste blanc le temps d'une police
      // est un site en panne pour qui le regarde.
      "  font-display: swap;",
      `  src: url("${CHEMIN_PUBLIC}/${nom}") format("woff2");`,
      b.plage ? `  unicode-range: ${b.plage};` : "",
      "}",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  console.log(`${nom}`);
}

const entete = [
  "/* ARTEFACT — régénéré par `npm run site:polices`, ne pas éditer à la main.",
  " *",
  " * Les polices du site sont dans le dépôt et servies depuis le même domaine. Le site",
  " * ne demande donc rien à un tiers pour s'afficher, et aucune ouverture de page ne",
  " * signale une visite ailleurs.",
  " *",
  " * Graisses retenues : Barlow 400 / 500 / 600 et son italique 400, Barlow Condensed",
  " * 500 / 600 / 700. Sous-ensembles latin et latin-ext, woff2 seul.",
  " */",
  "",
].join("\n");

writeFileSync(FEUILLE_CSS, entete + regles.join("\n\n") + "\n");
console.log(`\n${blocs.length} fichiers, src/polices.css écrit.`);
