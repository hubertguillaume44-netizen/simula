// ————— LA PROTECTION TEMPORAIRE DU SITE —————
// Une authentification de base sur tout le site, le temps du chantier. Elle est
// TEMPORAIRE : ces tests décrivent aussi comment elle s'enlève, pour qu'on ne la
// découvre pas le jour où un client ne peut pas entrer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = new URL("../", import.meta.url).pathname;
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8");
const FONCTION = path.join(RACINE, "netlify/edge-functions/protection.js");
const VARIABLE = "VENA_ACCES";

/** La fonction, exécutée hors de Netlify : on lui fournit son global et un témoin. */
async function appeler({ variable, entete, chemin = "/" }) {
  globalThis.Netlify = { env: { get: (k) => (k === VARIABLE ? variable : undefined) } };
  const mod = await import(FONCTION + "?v=" + Math.random());
  let passe = false;
  const ctx = { next: () => { passe = true; return new Response("PAGE", { status: 200 }); } };
  const req = new Request("https://venapp.fr" + chemin,
    { headers: entete ? { authorization: entete } : {} });
  const r = await mod.default(req, ctx);
  return { statut: r.status, passe, defi: r.headers.get("www-authenticate") };
}
const basic = (s) => "Basic " + Buffer.from(s, "utf8").toString("base64");
const BON = "essai:mot-de-passe-de-chantier";

test("sans la variable, la protection FERME — elle ne s’ouvre pas", async () => {
  // une protection qui disparaît avec sa configuration ne protège rien : le jour où
  // quelqu’un renomme la variable, le site serait public sans que rien ne le signale
  for (const v of [undefined, "", "motdepasse-sans-identifiant"]) {
    const r = await appeler({ variable: v, entete: null });
    assert.equal(r.statut, 503, "variable " + JSON.stringify(v) + " : doit fermer");
    assert.equal(r.passe, false, "rien ne doit passer");
  }
});

test("le bon couple entre, les autres non", async () => {
  const ok = await appeler({ variable: BON, entete: basic(BON) });
  assert.equal(ok.statut, 200);
  assert.equal(ok.passe, true, "le bon couple doit atteindre la page");
  for (const mauvais of [null, basic("essai:faux"), basic("autre:mot-de-passe-de-chantier"),
                         basic("essai:mot-de-passe"), "Bearer un-jeton", "Basic %%pas-du-base64%%"]) {
    const r = await appeler({ variable: BON, entete: mauvais });
    assert.equal(r.statut, 401, "doit refuser : " + String(mauvais).slice(0, 24));
    assert.equal(r.passe, false);
  }
});

test("le défi est un en-tête HTTP valide — pas d’accent", async () => {
  // un en-tête ne transporte que du Latin-1. « Véna — site » y jette, et CHAQUE 401
  // devenait un 500 : le refus lui-même tombait en panne.
  const r = await appeler({ variable: BON, entete: null });
  assert.match(r.defi, /^Basic realm="[\x20-\xFF]+"/, "le défi doit être présent et transportable");
  for (const c of r.defi) {
    assert.ok(c.codePointAt(0) < 256, "caractère hors Latin-1 dans le défi : " + c);
  }
});

test("tout est couvert : la racine, /app, et les deux fonctions", async () => {
  for (const c of ["/", "/app", "/app/index.html", "/simuler", "/api/licence", "/api/usage",
                   "/assets/index.js", "/_ds/industry-x/styles.css"]) {
    const r = await appeler({ variable: BON, entete: null, chemin: c });
    assert.equal(r.statut, 401, c + " doit être protégé");
  }
});

test("le mécanisme d’exclusion fonctionne, pour le jour où il servira", async () => {
  // aujourd’hui la liste est vide ; une page de confirmation de paiement devra y entrer.
  // On éprouve le mécanisme sur une copie, pour qu’il ne soit pas du code mort.
  const src = lire("netlify/edge-functions/protection.js").replace("const OUVERTS = [];",
    'const OUVERTS = ["/merci"];');
  const url = "data:text/javascript;base64," + Buffer.from(src, "utf8").toString("base64");
  globalThis.Netlify = { env: { get: () => BON } };
  const mod = await import(url);
  for (const [chemin, attendu] of [["/merci", 200], ["/merci/detail", 200], ["/mercix", 401], ["/", 401]]) {
    let passe = false;
    const ctx = { next: () => { passe = true; return new Response("PAGE", { status: 200 }); } };
    const r = await mod.default(new Request("https://venapp.fr" + chemin), ctx);
    assert.equal(r.status, attendu, chemin + " : attendu " + attendu);
  }
});

test("elle est déclarée à UN SEUL endroit, et son retrait tient en un bloc", async () => {
  const toml = lire("netlify.toml");
  assert.match(toml, /\[\[edge_functions\]\]\n\s*function = "protection"\n\s*path = "\/\*"/,
    "la protection doit être déclarée dans netlify.toml");
  // une seconde déclaration dans le fichier survivrait à la suppression du bloc, et la
  // consigne de retrait écrite en tête du fichier serait fausse
  const fn = lire("netlify/edge-functions/protection.js");
  assert.ok(!/export const config/.test(fn),
    "une déclaration interne rendrait le retrait par netlify.toml sans effet");
  // le mot de passe n’est nulle part dans le dépôt
  assert.ok(!/VENA_ACCES\s*=\s*["'][^"']+["']/.test(toml + fn),
    "aucune valeur de VENA_ACCES ne doit être versionnée");
  assert.match(fn, /Netlify\.env\.get\(VARIABLE\)/, "le mot de passe doit venir de l’environnement");
});
