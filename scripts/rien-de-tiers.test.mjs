// ————— LE SITE NE DEMANDE RIEN À UN TIERS POUR S'AFFICHER —————
// L'application tenait déjà cette promesse (scripts/app/autonomie.test.mjs). Le site,
// lui, partait encore deux fois au chargement : une feuille de polices chez Google, et
// un script de l'outillage d'origine sur un domaine extérieur. Les deux coûtaient la
// même chose — une page sans typographie derrière un réseau qui filtre, et une visite
// signalée à chaque ouverture, sur un outil qui touche à des données financières.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { injectGrokPwaHead } from "./grok-pwa-shared.mjs";

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
