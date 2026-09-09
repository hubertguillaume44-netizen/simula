// ————— LA CONFIGURATION DE DÉPLOIEMENT, TENUE PAR DES TESTS —————
// Elle vivait dans l'interface Netlify : « dist/client » et « netlify/functions » face
// à un dépôt qui construisait pour Vercel. Aucune des deux sorties n'existait, et la
// panne ne se voyait qu'au déploiement. Ces tests lient les trois réglages entre eux —
// le préréglage, le répertoire publié, et le routage des deux fonctions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const RACINE = new URL("../", import.meta.url).pathname;
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8");

/** Un lecteur TOML minimal : juste ce que ce fichier contient. Une dépendance de plus
 *  pour lire vingt lignes de configuration serait payer cher un test. */
function lireToml(txt) {
  const out = {};
  let section = out;
  for (const brut of txt.split("\n")) {
    const l = brut.replace(/(^|\s)#.*$/, "").trim();
    if (!l) continue;
    let m = l.match(/^\[\[([^\]]+)\]\]$/);
    if (m) {
      const cle = m[1];
      out[cle] = out[cle] || [];
      section = {};
      out[cle].push(section);
      continue;
    }
    m = l.match(/^\[([^\]]+)\]$/);
    if (m) {
      section = m[1].split(".").reduce((o, k) => (o[k] = o[k] || {}), out);
      continue;
    }
    m = l.match(/^([A-Za-z_][\w-]*)\s*=\s*(.+)$/);
    if (!m) continue;
    const v = m[2].trim();
    section[m[1]] = v === "true" ? true : v === "false" ? false
      : /^\d+$/.test(v) ? Number(v) : v.replace(/^["']|["']$/g, "");
  }
  return out;
}

const toml = lireToml(lire("netlify.toml"));

test("le préréglage nitro est celui de la plateforme de déploiement", () => {
  const vite = lire("vite.config.ts");
  assert.match(vite, /nitro\(\{ preset: "netlify"/,
    "le dépôt est déployé sur Netlify : le préréglage doit l’être aussi");
  assert.ok(!/preset: "vercel"/.test(vite), "aucun préréglage Vercel ne doit subsister");
});

test("le répertoire publié est celui que la construction produit", () => {
  // « dist/client » n’est produit par AUCUN préréglage : c’était le réglage de l’interface
  assert.equal(toml.build.publish, "dist");
  assert.notEqual(toml.build.publish, "dist/client");
  assert.equal(toml.build.command, "npm run build",
    "la commande doit être celle qu’on lance en local, sans variante");
});

test("les deux fonctions écrites à la main sont dans le répertoire déclaré", () => {
  assert.equal(toml.functions.directory, "netlify/functions");
  for (const f of ["licence.mjs", "usage.mjs"]) {
    assert.ok(existsSync(path.join(RACINE, "netlify/functions", f)),
      "fonction absente du répertoire déclaré : " + f);
  }
});

test("chaque fonction a une redirection forcée vers son point d’entrée", () => {
  // le serveur SSR déclare `path: "/*"` et n’exclut que `/.netlify/*` : « /api/licence »
  // lui correspond aussi. On n’en laisse pas décider une préséance non documentée.
  const routes = toml.redirects || [];
  for (const nom of ["licence", "usage"]) {
    const declare = lire("netlify/functions/" + nom + ".mjs")
      .match(/export const config = \{ path: "([^"]+)" \}/);
    assert.ok(declare, nom + " doit déclarer son chemin");
    const r = routes.find((x) => x.from === declare[1]);
    assert.ok(r, "aucune redirection pour " + declare[1] + " — le SSR l’avalerait");
    assert.equal(r.to, "/.netlify/functions/" + nom,
      "la cible doit être le point d’entrée canonique, hors du fourre-tout SSR");
    assert.equal(r.status, 200, "une redirection 200 sert la fonction, elle ne renvoie pas ailleurs");
    assert.equal(r.force, true, "sans `force`, une autre règle correspondante peut gagner");
  }
});

test("la cible des redirections est hors de portée du fourre-tout SSR", () => {
  // c’est ce qui rend la règle sûre : `/.netlify/*` est dans l’excludedPath du serveur
  for (const r of toml.redirects || []) {
    assert.match(r.to, /^\/\.netlify\/functions\//,
      "une cible hors de /.netlify/ pourrait revenir au SSR : " + r.to);
  }
});
