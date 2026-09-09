// ————— LA ROUTE /app SERT L'APPLICATION, PAS LA VITRINE —————
// Le site et l'application sont deux choses : `src/` se construit avec Vite,
// l'application est le fichier unique de `scripts/app/solo.mjs`. Sans ce pont, venapp.fr
// servait la démonstration et l'application n'était servie par aucune route — un client
// qui paie ne pouvait pas l'ouvrir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = new URL("../../", import.meta.url).pathname;
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8");

test("la construction REFAIT l'application, elle ne publie pas une copie", () => {
  // le point qui décide de tout : copier l'artefact du dépôt publierait, un jour, une
  // version figée qui diverge de Vena.dc.html — sans que rien ne le signale
  const pkg = JSON.parse(lire("package.json"));
  assert.match(pkg.scripts.build, /vite build.*publier-solo\.mjs/,
    "la publication de l’application doit faire partie de la construction");
  const pub = lire("scripts/app/publier-solo.mjs");
  assert.match(pub, /execFileSync\(process\.execPath, \[path\.join\(RACINE, "scripts\/app\/solo\.mjs"\)\]/,
    "le script doit régénérer l’artefact avant de le publier");
  assert.match(pub, /if \(vSource !== vSolo\)/,
    "il doit refuser de publier une version qui ne correspond pas à la source");
  assert.match(pub, /dist", "app", "index\.html"/, "la sortie doit être dist/app/index.html");
});

test("netlify sert /app en statique, hors du fourre-tout SSR", () => {
  const toml = lire("netlify.toml");
  assert.match(toml, /from = "\/app"\n\s*to = "\/app\/index\.html"\n\s*status = 200\n\s*force = true/,
    "la route /app doit être écrite, pas laissée aux URL propres");
});

test("le bouton d’entrée du site ouvre l’application", () => {
  const entete = lire("src/components/site-header.tsx");
  // `<a href>` et non `<Link>` : /app n’est pas une route du routeur, c’est un fichier
  assert.match(entete, /<a\s+href="\/app"/, "le bouton d’entrée doit pointer vers /app");
  assert.ok(!/<Link\s+to="\/app"/.test(entete),
    "un <Link> tenterait une navigation interne vers une route qui n’existe pas");
  const accueil = lire("src/routes/index.tsx");
  assert.match(accueil, /<Button asChild>\s*\n\s*<a href="\/app">/,
    "le bouton principal de l’accueil doit ouvrir l’application");
});

test("la démonstration reste distincte, et ne se donne pas pour le produit", () => {
  const entete = lire("src/components/site-header.tsx");
  // elle garde son entrée…
  assert.match(entete, /\{ to: "\/simuler", label: "Démonstration" \}/,
    "la démonstration doit garder une entrée, sous son nom");
  // …et deux entrées ne peuvent pas porter le même mot
  assert.ok(!/label: "La démonstration"/.test(entete),
    "deux entrées portant « démonstration » se confondraient");
  // aucun lien vers /simuler ne doit promettre le produit
  for (const f of ["src/routes/index.tsx", "src/routes/pourquoi.tsx", "src/routes/methode.tsx"]) {
    const txt = lire(f);
    for (const m of txt.matchAll(/<Link to="\/simuler"[^>]*>([^<]*)</g)) {
      const libelle = m[1].trim();
      if (!libelle) continue;
      assert.ok(/démo|démonstration/i.test(libelle),
        f + " : « " + libelle + " » mène à la démonstration mais promet le produit");
    }
  }
  // et la page de démonstration ne promet pas de lire vos fichiers
  const demo = lire("src/routes/simuler.tsx");
  assert.ok(!/glissez vos\s*\n?\s*CSV/i.test(demo),
    "la démonstration ne doit pas promettre ce que fait l’application");
  assert.match(demo, /href="\/app"/, "elle doit renvoyer vers l’application");
});
