// ————— LE SITE NE DEMANDE RIEN À UN TIERS POUR S'AFFICHER —————
// L'application tenait déjà cette promesse (scripts/app/autonomie.test.mjs). Le site,
// lui, partait encore deux fois au chargement : une feuille de polices chez Google, et
// un script de l'outillage d'origine sur un domaine extérieur. Les deux coûtaient la
// même chose — une page sans typographie derrière un réseau qui filtre, et une visite
// signalée à chaque ouverture, sur un outil qui touche à des données financières.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { injectGrokPwaHead, renderWebManifest } from "./grok-pwa-shared.mjs";

const lire = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// une page minimale, telle que le routeur en produit une
const PAGE = [
  "<!doctype html><html><head>",
  '<meta name="theme-color" content="#ebeae6">',
  '<link rel="manifest" href="/__grok/manifest.webmanifest">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
  "<title>Véna</title>",
  "</head><body></body></html>",
].join("");

test("l’injection du <head> ne charge aucun script extérieur", () => {
  const html = injectGrokPwaHead(PAGE, { host: "venapp.fr", projectId: "abc", site: {} });
  const sources = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  const dehors = sources.filter((u) => /^https?:\/\//i.test(u));
  assert.deepEqual(dehors, [], `scripts extérieurs injectés : ${dehors.join(", ")}`);
});

test("l’icône iOS de la page n’est pas doublée par celle de l’outillage", () => {
  const html = injectGrokPwaHead(PAGE, { host: "venapp.fr", site: {} });
  const icones = [...html.matchAll(/<link[^>]*rel=["']apple-touch-icon["'][^>]*>/gi)];
  assert.equal(icones.length, 1, `${icones.length} icônes iOS déclarées`);
  assert.match(icones[0][0], /href=["']\/apple-touch-icon\.png["']/);
});

test("le theme-color de la page survit à l’injection", () => {
  // le papier du site, et non le noir de l'outillage
  const html = injectGrokPwaHead(PAGE, { host: "venapp.fr", site: {} });
  const couleurs = [...html.matchAll(/<meta[^>]*name=["']theme-color["'][^>]*>/gi)];
  assert.equal(couleurs.length, 1);
  assert.match(couleurs[0][0], /#ebeae6/i);
});

test("la feuille du site n’importe aucune police distante", () => {
  const css = lire("src/styles.css");
  const distants = [...css.matchAll(/@import\s+url\(\s*["']?(https?:[^"')]+)/gi)].map((m) => m[1]);
  assert.deepEqual(distants, [], `importations distantes : ${distants.join(", ")}`);
  assert.match(css, /@import\s+"\.\/polices\.css";/);
});

test("les sept graisses du site sont dans le dépôt, en woff2 seul", () => {
  const fichiers = readdirSync(new URL("../public/fonts", import.meta.url));
  const autres = fichiers.filter((f) => !f.endsWith(".woff2"));
  assert.deepEqual(autres, [], `formats en trop : ${autres.join(", ")}`);
  // sept faces × deux sous-ensembles : le site est en français, latin et latin-ext suffisent
  for (const face of [
    "Barlow-400", "Barlow-500", "Barlow-600", "Barlow-400italic",
    "BarlowCondensed-500", "BarlowCondensed-600", "BarlowCondensed-700",
  ]) {
    for (const sous of ["latin", "latin-ext"]) {
      assert.ok(fichiers.includes(`${face}-${sous}.woff2`), `${face}-${sous}.woff2 manquant`);
    }
  }
  assert.equal(fichiers.length, 14, "un fichier de police en trop ou en moins");
});

test("chaque @font-face vise un fichier du dépôt et n’attend pas pour s’afficher", () => {
  const css = lire("src/polices.css");
  const blocs = css.split("@font-face").slice(1);
  assert.equal(blocs.length, 14);
  for (const bloc of blocs) {
    const src = bloc.match(/src:\s*url\("([^"]+)"\)/);
    assert.ok(src, "un bloc sans source");
    assert.match(src[1], /^\/fonts\//, `source hors du dépôt : ${src[1]}`);
    // `swap` : le texte s'affiche tout de suite, la police prend le relais en arrivant
    assert.match(bloc, /font-display:\s*swap;/);
  }
});

// ————— LE MANIFESTE —————
// Il est GÉNÉRÉ, pas versionné : renderWebManifest le fabrique, le greffon Vite et le
// middleware SSR le servent tous deux sur /__grok/manifest.webmanifest. Il déclarait une
// icône absente — une installation sur écran d'accueil n'en avait donc aucune — et deux
// couleurs noires qui ne sont nulle part dans le produit.

test("chaque icône du manifeste est un fichier du dépôt", () => {
  const manifeste = JSON.parse(renderWebManifest());
  assert.ok(manifeste.icons.length >= 3, "moins de trois icônes déclarées");
  for (const icone of manifeste.icons) {
    assert.match(icone.src, /^\//, `chemin relatif : ${icone.src}`);
    const chemin = new URL(`../public${icone.src}`, import.meta.url);
    assert.ok(existsSync(chemin), `${icone.src} n’existe pas — l’icône rendra 404`);
    // le fichier fait bien la taille annoncée : un PNG dit sa largeur aux octets 16 à 20
    const octets = readFileSync(chemin);
    const largeur = octets.readUInt32BE(16);
    const attendue = Number(icone.sizes.split("x")[0]);
    assert.equal(largeur, attendue, `${icone.src} annonce ${icone.sizes} et fait ${largeur}px`);
  }
});

test("le manifeste ne déclare aucune icône maskable", () => {
  // un système qui rogne une maskable ampute les deux départs du signe : il faudrait un
  // tracé réduit, comme pour l'avatar rond
  const manifeste = JSON.parse(renderWebManifest());
  const masquables = manifeste.icons.filter((i) => String(i.purpose ?? "").includes("maskable"));
  assert.deepEqual(masquables, []);
});

test("le manifeste et le site disent la même couleur", () => {
  const manifeste = JSON.parse(renderWebManifest());
  const racine = lire("src/routes/__root.tsx");
  const meta = racine.match(/name:\s*"theme-color",\s*content:\s*"(#[0-9a-f]{6})"/i);
  assert.ok(meta, "le meta theme-color du site est introuvable");
  assert.equal(manifeste.theme_color.toLowerCase(), meta[1].toLowerCase());
  // le fond de démarrage doit être celui que la page affiche, sinon l'ouverture flashe
  assert.equal(manifeste.background_color.toLowerCase(), meta[1].toLowerCase());
});

test("le manifeste porte le nom du produit, pas celui de l’outillage", () => {
  const manifeste = JSON.parse(renderWebManifest());
  // les deux champs sont vérifiés en toutes lettres plutôt que par une liste de noms
  // interdits : nommer l'ancienne marque ici ferait échouer nom-vena.test.mjs, qui a
  // raison de compter cette occurrence comme une survivance
  assert.equal(manifeste.short_name, "Véna");
  assert.equal(manifeste.name, "Véna — simulateur de stratégies trading");
  assert.doesNotMatch(manifeste.name + manifeste.short_name, /grok/i);
});
