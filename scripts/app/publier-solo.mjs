#!/usr/bin/env node
/**
 * Publie l'APPLICATION dans la sortie de construction du site, sous `/app`.
 *
 * Le site (`src/`) et l'application (`Vena.dc.html`) sont deux choses. Le site se
 * construit avec Vite ; l'application est un fichier unique fabriqué par
 * `scripts/app/solo.mjs`. Sans ce pont, `venapp.fr` sert la vitrine et l'application
 * n'est servie par aucune route — un client qui paie ne peut pas l'ouvrir.
 *
 * IL RÉGÉNÈRE AVANT DE PUBLIER, et c'est le point important. Copier le
 * `Vena.solo.html` présent dans le dépôt publierait ce que le dernier
 * `npm run app:solo` a laissé — c'est-à-dire, un jour ou l'autre, une version figée qui
 * diverge silencieusement de `Vena.dc.html`. La même panne que le préréglage de
 * déploiement, une strate plus haut : une configuration qui décrit un état passé.
 *
 * Il refuse de publier si la version affichée par l'artefact ne correspond pas à celle
 * de la source : mieux vaut une construction qui échoue qu'un site qui sert autre chose
 * que ce que le dépôt contient.
 *
 *   node scripts/app/publier-solo.mjs
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(new URL("../../", import.meta.url).pathname);
const SOURCE = path.join(RACINE, "Vena.dc.html");
const SOLO = path.join(RACINE, "Vena.solo.html");
const SORTIE = path.join(RACINE, "dist", "app", "index.html");

/** La version que l'application affiche dans son pied — la seule qui se lise à l'écran. */
function versionDe(fichier, quoi) {
  const m = readFileSync(fichier, "utf8").match(/VERSION_APP = '([^']+)'/);
  if (!m) throw new Error(`${quoi} ne porte pas de VERSION_APP — impossible de vérifier ce qui est publié`);
  return m[1];
}

// 1. REFAIRE l'artefact. Il n'est jamais publié tel qu'il traîne dans le dépôt.
execFileSync(process.execPath, [path.join(RACINE, "scripts/app/solo.mjs")], {
  cwd: RACINE, stdio: "inherit",
});

// 2. La version publiée doit être celle de la source.
const vSource = versionDe(SOURCE, "Vena.dc.html");
const vSolo = versionDe(SOLO, "Vena.solo.html");
if (vSource !== vSolo) {
  console.error(`[publier-solo] ARRÊT : la source annonce ${vSource}, l'artefact ${vSolo}.`);
  process.exit(1);
}

// 3. Publier. Sans `dist/`, c'est que la construction du site n'a pas eu lieu :
//    publier quand même laisserait un dossier orphelin que rien ne sert.
const distDir = path.join(RACINE, "dist");
if (!existsSync(distDir)) {
  console.error("[publier-solo] ARRÊT : dist/ est absent — lancez la construction du site d'abord.");
  process.exit(1);
}
mkdirSync(path.dirname(SORTIE), { recursive: true });
copyFileSync(SOLO, SORTIE);

// 4. LE HABILLAGE. L'application charge sa feuille de style et son paquet depuis
//    `_ds/…/`, qui ne sont PAS dans le dépôt. Sans eux la page se charge, mais la mise
//    en page s'effondre : textes superposés, dialogue par-dessus l'accroche. Ce n'est
//    pas « seulement l'habillage », et une panne visuelle ne doit pas être silencieuse.
//    Déposés dans `public/_ds/…`, Vite les recopie dans `dist/` tout seul.
const ds = (readFileSync(SOLO, "utf8").match(/(?:src|href)="(_ds\/[^"]+)"/g) || [])
  .map((x) => x.replace(/^(?:src|href)="|"$/g, ""));
const absents = [...new Set(ds)].filter((rel) => !existsSync(path.join(RACINE, "dist", rel)));
if (absents.length) {
  console.warn("[publier-solo] ATTENTION : l'application sera servie SANS habillage.");
  for (const a of absents) console.warn("               absent de dist/ : " + a);
  console.warn("               Déposez ces fichiers dans public/ (public/_ds/…) : Vite les publiera.");
}

const mo = (statSync(SORTIE).size / 1048576).toFixed(2);
console.log(`[publier-solo] dist/app/index.html — ${mo} Mo, version ${vSource}, servi tel quel sous /app.`);
