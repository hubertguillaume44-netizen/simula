// L'index d'aide est un ARTEFACT : il est extrait de la page, pas rédigé à côté d'elle.
// Ces tests le vérifient — sinon une infobulle réécrite laisserait dans le panneau une
// explication qui ne correspond plus à rien de ce qui est affiché.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(new URL("../../", import.meta.url).pathname);
const index = JSON.parse(readFileSync(path.join(RACINE, "aide-index.json"), "utf8"));
const page = readFileSync(path.join(RACINE, "Sivula.dc.html"), "utf8");

test("l'index d'aide porte des explications", () => {
  assert.ok(Array.isArray(index.entrees));
  assert.ok(index.entrees.length > 50, `seulement ${index.entrees.length} explications`);
});

test("chaque entrée a un terme, un texte et au moins une page", () => {
  for (const e of index.entrees) {
    assert.ok(e.terme && e.terme.length <= 60, `terme douteux : ${JSON.stringify(e.terme)}`);
    assert.ok(e.texte && e.texte.length >= 25, `texte trop court pour ${e.terme}`);
    assert.ok(Array.isArray(e.vues) && e.vues.length >= 1, `aucune page pour ${e.terme}`);
  }
});

test("aucun terme ne contient de gabarit", () => {
  for (const e of index.entrees) {
    assert.ok(!/[{}<>=]|\{\{/.test(e.terme), `gabarit dans le terme : ${e.terme}`);
  }
});

test("chaque explication existe encore dans la page", () => {
  // l'index est refait par scripts/app/aide.mjs ; s'il a vieilli, ce test tombe
  const nu = page.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  for (const e of index.entrees) {
    const debut = e.texte.slice(0, 40).replace(/"/g, "&quot;");
    assert.ok(nu.includes(debut), `explication absente de la page : « ${debut} »`);
  }
});

test("les pages nommées sont celles de l'application", () => {
  const connues = new Set(["Mes instruments", "Marché", "Portefeuille", "Nouveau scan",
    "Historique", "Backtest", "Journal", "Toutes les pages"]);
  for (const e of index.entrees) {
    for (const v of e.vues) assert.ok(connues.has(v), `page inconnue : ${v}`);
  }
});
