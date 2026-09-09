// ————— L'ÉCHAPPEMENT HTML DU CHROME PWA —————
// Les entités de `escapeHtml` avaient été DÉCODÉES dans le source : « &amp; » y était
// devenu « & », et « &quot; » un guillemet droit — trois guillemets à la suite, module
// inanalysable, vite.config.ts qui ne se charge pas, construction Netlify arrêtée.
//
// Deux défauts pour le prix d'un : tant que le module ne s'analysait pas, personne ne
// voyait que trois des cinq remplacements étaient devenus des opérations nulles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHtml } from "./grok-pwa-shared.mjs";

test("le module de chrome PWA s’analyse et s’importe", async () => {
  // s'il ne s'importe pas, cette ligne a déjà jeté — mais on le dit explicitement
  const mod = await import("./grok-pwa-shared.mjs");
  assert.equal(typeof mod.escapeHtml, "function");
  assert.equal(typeof mod.injectGrokPwaHead, "function");
});

test("escapeHtml échappe vraiment, il ne recopie pas", () => {
  // le cas qui a coûté la construction : chaque remplacement doit CHANGER l'entrée
  const cas = [
    ["Véna & Cie", "Véna &amp; Cie"],
    ["<script>", "&lt;script&gt;"],
    ['dit "bonjour"', "dit &quot;bonjour&quot;"],
    ["l'année", "l&#39;année"],
    // « & » passe en premier : sinon l'entité qu'on vient d'écrire serait réécrite
    ["a&amp;b", "a&amp;amp;b"],
  ];
  for (const [entree, attendu] of cas) {
    assert.equal(escapeHtml(entree), attendu, JSON.stringify(entree) + " mal échappé");
  }
});

test("aucun remplacement n’est une opération nulle", () => {
  const src = readFileSync(new URL("./grok-pwa-shared.mjs", import.meta.url), "utf8");
  // `.replaceAll("X", "X")` : la signature exacte de la corruption
  const nuls = [...src.matchAll(/\.replaceAll\((["'])(.*?)\1,\s*(["'])(.*?)\3\)/g)]
    .filter((m) => m[2] === m[4])
    .map((m) => m[0]);
  assert.deepEqual(nuls, [], "des remplacements ne changent rien");
});

test("la sortie ne peut pas refermer un attribut HTML", () => {
  // c'est à cela que sert la fonction : elle est interpolée dans content="..."
  const injecte = escapeHtml('" onload="alert(1)');
  const balise = `<meta content="${injecte}">`;
  assert.ok(!/content="[^"]*"\s+onload/.test(balise), "l’attribut se referme trop tôt");
  assert.ok(!injecte.includes('"'), "un guillemet droit subsiste dans la sortie");
});

test("escapeHtml et unescapeHtml font l’aller-retour", async () => {
  // `unescapeHtml` n'est pas exporté : on le vérifie par `titleFromDocument`, son appelant
  const { titleFromDocument } = await import("./grok-pwa-shared.mjs");
  for (const brut of ['Véna & "les autres" <ici>', "l'année 2026", "a & b & c"]) {
    const page = `<html><head><title>${escapeHtml(brut)}</title></head></html>`;
    assert.equal(titleFromDocument(page), brut, "aller-retour perdu sur " + JSON.stringify(brut));
  }
});
