#!/usr/bin/env node
/**
 * Fabrique les trois icônes PNG du site à partir de la marque Véna.
 *
 * LA RÈGLE QUE CE SCRIPT EXISTE POUR TENIR : le signe existe en trois DESSINS, pas en
 * trois tailles. Le rapport de graisses du grand palier — 6 pour le jambage fin, 17 pour
 * le plein — ne tient qu'au-dessus de 40 px. En dessous, le fin passe sous le pixel :
 * l'écart s'écrase, il ne reste qu'un V ordinaire, c'est-à-dire plus de marque du tout.
 * Les paliers intermédiaires réépaississent le fin (11 à `md`, 13 à `sm`) pour que le
 * contraste survive à la réduction.
 *
 * Conséquence : chaque fichier est RENDU DEPUIS SON PALIER. Réduire l'icône de 180 px
 * pour en tirer celle de 16 px produirait un fichier qui a l'air correct dans un dossier
 * et qui, dans l'onglet du navigateur, n'est plus la marque. C'est l'endroit le plus vu
 * du site, et le seul où l'erreur ne se voit pas au moment où on la commet.
 *
 * Les tracés sont LUS dans le composant, jamais recopiés ici : une copie qui dérive
 * serait une seconde marque. `src/components/vena-mark.tsx` fait foi.
 *
 * Le rendu passe par le Chromium de Playwright, déjà présent en dépendance de
 * développement — plutôt qu'un `sharp` ou un `resvg-js` ajoutés pour trois fichiers.
 * Le script ne tourne PAS à la construction : les PNG sont versionnés, et une
 * construction ne doit pas dépendre d'un navigateur pour réussir.
 *
 *   npm run site:icones
 *   node scripts/icones-vena.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RACINE = path.resolve(new URL("../", import.meta.url).pathname);
const COMPOSANT = "src/components/vena-mark.tsx";

// Les couleurs du produit, lues dans src/styles.css. Aucune autre valeur dans les icônes.
const ENCRE = "#1c1e20"; // --color-ink
const CLAIR = "#f4f3ef"; // --color-panel

const CIBLES = [
  { fichier: "public/favicon-16.png", px: 16, palier: "sm", pourquoi: "onglet du navigateur" },
  { fichier: "public/favicon-32.png", px: 32, palier: "md", pourquoi: "onglet en écran dense" },
  { fichier: "public/apple-touch-icon.png", px: 180, palier: "lg", pourquoi: "écran d'accueil iOS" },
];

/** Chromium fourni par l'environnement, quand la version de Playwright ne colle pas. */
function binaire() {
  for (const p of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Les trois tracés, extraits du composant. Il est la source unique. */
function graisses() {
  const src = readFileSync(path.join(RACINE, COMPOSANT), "utf8");
  const trouves = {};
  for (const m of src.matchAll(/^ {2}(lg|md|sm): "([^"]+)",$/gm)) trouves[m[1]] = m[2];
  for (const palier of ["lg", "md", "sm"]) {
    if (!trouves[palier]) {
      throw new Error(
        `Palier « ${palier} » introuvable dans ${COMPOSANT}.\n` +
        "Le script lit la table GRAISSES ; si sa forme a changé, corriger la lecture ici " +
        "plutôt que de recopier les tracés.",
      );
    }
  }
  if (new Set(Object.values(trouves)).size !== 3) {
    throw new Error(
      "Deux paliers portent le même tracé. Trois dessins identiques ne sont plus trois " +
      "dessins : le contraste de graisses ne survivrait pas à la réduction.",
    );
  }
  return trouves;
}

async function fabriquer() {
  const traces = graisses();
  const nav = await chromium.launch({ executablePath: binaire() });
  try {
    for (const cible of CIBLES) {
      // une page par cible, à la taille exacte du fichier : le rendu part du tracé,
      // jamais d'une image déjà réduite
      const page = await nav.newPage({
        viewport: { width: cible.px, height: cible.px },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        "<style>html,body{margin:0;padding:0}svg{display:block}</style>" +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${cible.px}" height="${cible.px}">` +
        `<rect width="100" height="100" fill="${ENCRE}"/>` +
        `<path fill="${CLAIR}" d="${traces[cible.palier]}"/>` +
        "</svg>",
      );
      await page.screenshot({ path: path.join(RACINE, cible.fichier) });
      await page.close();
      console.log(
        `${cible.fichier} — ${cible.px}x${cible.px}, palier ${cible.palier} (${cible.pourquoi})`,
      );
    }
  } finally {
    await nav.close();
  }
  console.log("Trois dessins, trois fichiers. Aucun n'est la réduction d'un autre.");
}

await fabriquer();
