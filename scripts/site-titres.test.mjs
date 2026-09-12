// ————— CHAQUE PAGE DU SITE PORTE SON PROPRE TITRE —————
//
// La racine déclarait un titre et une description, et aucune route ne les remplaçait :
// les cinq pages du site portaient la même chose. Trois conséquences, toutes invisibles
// depuis le fauteuil de celui qui écrit le site :
//
//   · quatre onglets ouverts que le lecteur ne distingue plus ;
//   · quatre résultats identiques dans un moteur de recherche — qui RÉÉCRIT les titres
//     dupliqués, si bien que c'est sa formulation qui s'affiche, plus la nôtre ;
//   · un lien partagé qui annonce la même chose quelle que soit la page envoyée.
//
// CE QUE CE TEST TIENT : que chaque route en déclare un, et qu'aucun ne se répète. Il ne
// juge pas les mots — ils appartiennent à l'auteur du site, et changeront.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DOSSIER = new URL("../src/routes/", import.meta.url);
const lire = (f) => readFileSync(new URL(f, DOSSIER), "utf8");

/** Les routes du site, la racine mise à part : elle ne pose que les valeurs par défaut. */
const ROUTES = readdirSync(DOSSIER)
  .filter((f) => f.endsWith(".tsx") && f !== "__root.tsx")
  .sort();

/**
 * Le titre déclaré par un fichier de route. Une valeur littérale est rendue telle quelle ;
 * un identifiant est résolu dans le même fichier — la racine écrit `{ title: APP_NAME }`,
 * et lire « APP_NAME » au lieu de sa valeur ferait passer le test sur un faux unique.
 */
function meta(source, clef) {
  const re = clef === "title"
    ? /\{\s*title:\s*(?:"((?:[^"\\]|\\.)*)"|([A-Z_][A-Z0-9_]*))\s*\}/
    : /\{\s*name:\s*"description",\s*content:\s*\n?\s*"((?:[^"\\]|\\.)*)"/;
  const m = re.exec(source);
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  const d = new RegExp('const ' + m[2] + ' = "((?:[^"\\\\]|\\\\.)*)"').exec(source);
  return d ? d[1] : null;
}

// L'ACCUEIL EST LA SEULE EXCEPTION, et elle est de plein droit : le titre de la racine
// décrit le site, donc il décrit « / ». Lui en écrire un second, identique, créerait une
// deuxième vérité à tenir à jour. Toute autre page, elle, doit parler d'elle-même.
const ACCUEIL = "index.tsx";

test("chaque page déclare son titre — sauf l’accueil, qui est celui de la racine", () => {
  const sans = ROUTES.filter((f) => f !== ACCUEIL && !meta(lire(f), "title"));
  assert.deepEqual(sans, [],
    `ces pages n’ont pas de titre à elles : ${sans.join(", ")}. Elles héritent de celui `
    + "de la racine, et deviennent indiscernables des autres.");
  assert.ok(meta(lire("__root.tsx"), "title"),
    "la racine n’a plus de titre : l’accueil n’en aurait alors aucun");
});

test("aucun titre ne se répète d’une page à l’autre", () => {
  const vus = new Map();
  for (const f of [...ROUTES, "__root.tsx"]) {
    const t = meta(lire(f), "title");
    if (!t) continue;
    // index.tsx peut légitimement porter le titre de la racine : c'est la même page
    if (f === ACCUEIL && t === meta(lire("__root.tsx"), "title")) continue;
    if (vus.has(t)) {
      assert.fail(`« ${t} » est le titre de ${vus.get(t)} ET de ${f} — deux pages, un seul nom`);
    }
    vus.set(t, f);
  }
  assert.ok(vus.size >= 4, `${vus.size} titres distincts, quatre attendus au moins`);
});

test("aucune description ne se répète non plus", () => {
  // c'est le texte qui s'affiche sous le titre dans un résultat de recherche : deux pages
  // qui le partagent se font concurrence à elles-mêmes
  const vus = new Map();
  for (const f of ROUTES) {
    const d = meta(lire(f), "description");
    if (!d) continue;
    if (vus.has(d)) assert.fail(`la description de ${vus.get(d)} est aussi celle de ${f}`);
    vus.set(d, f);
  }
  assert.ok(vus.size >= 3, `${vus.size} descriptions propres, trois attendues au moins`);
});

test("un titre nomme la page ET la marque", () => {
  for (const f of ROUTES) {
    const t = meta(lire(f), "title");
    if (!t) continue;
    assert.ok(/Véna/.test(t), `« ${t} » (${f}) ne nomme pas la marque`);
    assert.ok(t.length <= 70,
      `« ${t} » fait ${t.length} caractères : un moteur de recherche coupe vers 60-70`);
    // l'accent de Véna est obligatoire partout où un humain lit — convention du dépôt
    assert.ok(!/\bVena\b/.test(t), `« ${t} » écrit la marque sans accent`);
  }
});
