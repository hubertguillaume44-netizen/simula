// ————— LA ROUTE /app SERT L'APPLICATION, PAS LA VITRINE —————
// Le site et l'application sont deux choses : `src/` se construit avec Vite,
// l'application est le fichier unique de `scripts/app/solo.mjs`. Sans ce pont, venapp.fr
// servait la démonstration et l'application n'était servie par aucune route — un client
// qui paie ne pouvait pas l'ouvrir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

test("la démonstration vit dans l’application, et nulle part ailleurs", () => {
  // ————— IL Y EN AVAIT DEUX —————
  // Le site portait sa propre démonstration en React, sur quatre séries, à côté de
  // celle que l'application porte déjà avec le moteur entier. Deux démonstrations, ce
  // sont deux moteurs à tenir d'accord — et le jour où ils divergent, c'est la vitrine
  // qui ment sur le produit. Ce test tenait la SÉPARATION des deux ; il tient
  // maintenant qu'il n'y en a plus qu'une.
  const entete = lire("src/components/site-header.tsx");
  assert.ok(!/to: "\/simuler"/.test(entete),
    "le bandeau ne doit plus proposer une démonstration qui n’existe pas");

  // aucune page ne doit pointer vers la route disparue : un lien mort dans la vitrine
  for (const f of readdirSync(new URL("../../src/routes/", import.meta.url))
    .filter((n) => n.endsWith(".tsx"))
    .map((n) => "src/routes/" + n)) {
    const txt = lire(f);
    // `visiteurs.tsx` garde le CHEMIN dans sa table de libellés : des visites y sont
    // enregistrées, et l'effacer les afficherait en brut. Ce n'est pas un lien.
    for (const m of txt.matchAll(/<Link to="([^"]+)"/g)) {
      assert.notEqual(m[1], "/simuler", f + " : lien vers une route supprimée");
    }
  }

  // et le fichier de route lui-même n’est plus là
  assert.throws(() => lire("src/routes/simuler.tsx"),
    "src/routes/simuler.tsx doit avoir disparu avec la démonstration");
});

test("le bandeau tient trois entrées, et l’accent cède à la page", () => {
  const entete = lire("src/components/site-header.tsx");
  const labels = [...entete.matchAll(/\{ to: "([^"]+)", label: "([^"]+)" \}/g)].map((m) => m[2]);
  assert.deepEqual(labels, ["Accueil", "Méthode", "Tarifs"],
    "trois entrées, dans cet ordre — voir le commentaire de LINKS");
  // la règle : l'accent va à l'action principale de la page ; dans le bandeau il est le
  // défaut, et il cède quand la page en a une plus forte
  assert.match(entete, /accentEntree = true/, "l’entrée porte l’accent par défaut");
  const tarifs = lire("src/routes/tarifs.tsx");
  assert.match(tarifs, /<SiteHeader accentEntree=\{false\} \/>/,
    "les Tarifs ont leur propre action pleine : l’entrée doit céder l’accent");
});
