// ————— L'ÉCRAN QUI AFFICHE LE STOCKAGE —————
//
// Onze tests mesuraient le stockage — le déplacement, le quota, les poids rendus — et
// pas un ne rendait l'écran qui les affiche. Un poste `conflit` ne porte pas de `n` : la
// branche par défaut de la cascade s'exécutait quand même, `p.n.toLocaleString` jetait,
// et tout `renderVals()` tombait sur un écran rouge, sur des données réelles.
//
// Le `...this.posteLocal(p)` de la fin remplace bien le nom et le détail de ces postes,
// mais l'objet littéral est ÉVALUÉ AVANT : un écrasement ne protège pas de ce qu'il
// écrase. Chaque lecture de `p` doit donc tenir pour TOUS les types.
//
// Ce test fait tourner la CASCADE RÉELLE, extraite du fichier, sur un poste de chaque
// type. Il ne monte pas React — `renderVals()` tient dans un composant DC que node ne
// sait pas instancier — mais il exécute la seule partie qui pouvait jeter, et il aurait
// attrapé celui-ci. Le démarrage complet reste vérifié à la main, en navigateur.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

function extraire(debut, fin) {
  const i = SOURCE.indexOf(debut);
  const j = SOURCE.indexOf(fin, i);
  assert.ok(i > 0 && j > i, `bloc introuvable : ${debut.slice(0, 40)}`);
  return SOURCE.slice(i, j);
}

/** La cascade de l'inventaire et `posteLocal`, montées sur un faux composant. */
function rendreInventaire(inv, etat = {}) {
  const posteLocal = extraire("  posteLocal(p) {", "  CLE_MENAGE =");
  // `poidsExact` est la vraie méthode : c'est elle qui décide de l'arrondi, et
  // l'arrondi est justement ce que ce test surveille. La stuber le viderait de sens.
  const poidsExact = extraire("  poidsExact(o) {", "  // ————— LES POSTES DU localStorage");
  const cascade = extraire("inventaire: inv.map((p) => ({", "\n          })),");
  const ctx = { Number, String, Math, JSON, Object, Array, Date, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    "var faux = {",
    "  state: " + JSON.stringify({ libSuppr: null, ...etat }) + ",",
    "  taille(o) { return Math.round((o || 0) / 1024) + ' Ko'; },",
    poidsExact + ",",
    "  nomCourtier(c) { return 'Courtier ' + c; },",
    "  setState() {}, adopterHorsIndex() {}, libererPoste() {}, libererLocal() {},",
    posteLocal + ",",
    "  rendre(inv, s) { return { " + cascade + "\n})) }; },",
    "};",
  ].join("\n"), ctx);
  return vm.runInContext(`faux.rendre(${JSON.stringify(inv)}, ${JSON.stringify({ libEnCours: null, libFait: 0, libTotal: 0, ...etat })})`, ctx).inventaire;
}

// un poste de CHAQUE type, tels que `inventaireStockage` les produit
const POSTES = [
  { type: "series", compte: "fxpro", prefixe: "vena.series.v1.client.fxpro", n: 12, octets: 900_000 },
  { type: "m1", compte: "fxpro", prefixe: "vena.m1.v1.client.fxpro", n: 3, octets: 400_000 },
  { type: "hasard", compte: "fxpro", prefixe: "vena.hasard.v1.client.fxpro", n: 1200, octets: 80_000 },
  { type: "scan", compte: "fxpro", prefixe: "vena.scan.v1.client.fxpro", n: 45_000, octets: 3_200_000 },
  { type: "horsIndex", compte: "fxpro", prefixe: "vena.series.v1.client.fxpro", cles: ["a", "b"], n: 2, octets: 20_000 },
  { type: "orphelines", compte: null, prefixe: "vena.series.v1.client.ancien", n: 5, octets: 50_000 },
  // les trois du localStorage : aucun ne porte `n`, sauf `reglages`
  { type: "local", x: "scan.v1.client.fxpro", famille: "scan", espace: "client", compte: "fxpro",
    prefixe: "vena.scan.v1.client.fxpro", octets: 3_200_050, ancienSeul: true, doublon: false },
  // le cas réel : l'exemplaire actuel est une LISTE VIDE, l'ancien porte 58 symboles
  { type: "conflit", x: "series.v1.client.fxpro", famille: "series", espace: "client",
    compte: "fxpro", prefixe: "vena.series.v1.client.fxpro", octets: 561 * 2,
    octetsNeuf: 4, octetsAncien: 1118,
    faceNeuve: { vide: true, octets: 4, quoi: "une liste vide" },
    faceAncienne: { vide: false, octets: 1118, n: 58, quoi: "58 entrées" } },
  // et un conflit ordinaire, sans côté vide
  { type: "conflit", x: "impactEvts.v1.client.fxpro", famille: "impactEvts", espace: "client",
    compte: "fxpro", prefixe: "vena.impactEvts.v1.client.fxpro", octets: 24_128,
    octetsNeuf: 9_662, octetsAncien: 14_466 },
  { type: "reglages", prefixe: "vena.reglages", octets: 276, n: 9 },
];

test("l’écran d’inventaire rend les neuf types de postes sans lever", () => {
  // un par un : si l'un jette, le message dit LEQUEL — c'est ce qui manquait
  for (const p of POSTES) {
    assert.doesNotThrow(() => rendreInventaire([p]), `le poste « ${p.type} » fait tomber renderVals()`);
  }
  // et tous ensemble, comme l'écran les reçoit
  const rendus = rendreInventaire(POSTES);
  assert.equal(rendus.length, POSTES.length);
});

test("chaque poste rendu porte de quoi s’afficher, sans « undefined »", () => {
  for (const iv of rendreInventaire(POSTES)) {
    for (const champ of ["nom", "detail", "poids"]) {
      assert.equal(typeof iv[champ], "string", `${champ} n’est pas une chaîne`);
      assert.ok(iv[champ].length > 0, `${champ} est vide`);
      // « undefined » concaténé ne jette pas, mais s'affiche à l'écran
      assert.ok(!iv[champ].includes("undefined"),
        `« undefined » dans ${champ} : ${iv[champ].slice(0, 80)}`);
      assert.ok(!iv[champ].includes("NaN"), `« NaN » dans ${champ}`);
    }
    assert.equal(typeof iv.liberer, "function");
  }
});

test("le conflit s’annonce comme un conflit, avec ses deux choix", () => {
  const c = rendreInventaire(POSTES).filter((iv) => iv.aChoix);
  assert.equal(c.length, 2, "les conflits ne sont plus arbitrables");
  for (const iv of c) {
    assert.match(iv.nom, /DEUX EXEMPLAIRES QUI DIFFÈRENT/);
    assert.equal(typeof iv.choix, "function");
    assert.ok(iv.aSupprimable, "le second choix a disparu");
  }
});

test("un conflit dont un côté est vide le dit, et ne propose pas le vide en principal", () => {
  // le cas réel : « [] » (2 octets) contre 58 symboles (559 octets), et l'écran
  // affichait « 1 Ko » contre « 1 Ko » avec « Garder l'actuel » en bouton principal
  const c = rendreInventaire(POSTES).find((iv) => /Liste des séries/.test(iv.nom));
  assert.ok(c, "le conflit des séries a disparu");
  // en toutes lettres
  assert.match(c.detail, /une liste vide/);
  assert.match(c.detail, /58 entrées/);
  assert.match(c.detail, /le garder revient à jeter l’ancien/);
  // les poids se lisent séparément et SANS arrondi trompeur
  // le poids de la VALEUR (« [] » = 2 caractères = 4 octets), pas celui de la clé
  assert.match(c.detail, /une liste vide · 4 o/, "le poids du côté vide doit être en octets");
  assert.match(c.detail, /58 entrées · 1 Ko/);
  assert.ok(!/1 Ko.*1 Ko/.test(c.detail), "deux poids arrondis au même chiffre");
  // et le bouton plein est celui qui garde la donnée
  assert.equal(c.choixCls, "btn btn-primary", "garder l’ancien doit être le choix principal");
  assert.match(c.choixTxt, /58 entrées/);
});

test("un conflit ordinaire garde « l’actuel » en choix principal", () => {
  const c = rendreInventaire(POSTES).find((iv) => /Impact des événements/.test(iv.nom));
  assert.ok(c, "le conflit ordinaire a disparu");
  assert.equal(c.choixCls, "btn btn-secondary");
  // sans description, le repli est le poids du poste
  assert.match(c.detail, /9 Ko/);
  assert.match(c.detail, /14 Ko/);
});

test("les réglages comptent dans le total mais n’offrent pas de bouton", () => {
  const r = rendreInventaire(POSTES).find((iv) => iv.nom === "Réglages et repères");
  assert.ok(r, "le poste des réglages a disparu");
  assert.equal(r.aSupprimable, false, "les réglages ne doivent pas être supprimables un par un");
  assert.equal(r.aChoix, false);
});

test("une suppression en cours s’affiche sur un poste sans compte de blocs", () => {
  // `s.libTotal || p.n` valait `undefined` pour un poste du localStorage : le bouton
  // affichait « Suppression… 0/undefined »
  const [iv] = rendreInventaire([POSTES.find((p) => p.type === "local")],
    { libEnCours: "vena.scan.v1.client.fxpro|local", libFait: 1 });
  assert.ok(!String(iv.bouton).includes("undefined"), `bouton : ${iv.bouton}`);
});

// ————— NE PARLER DE PERTE QUE SI ON PEUT LA PROUVER —————
//
// « Le stockage de cette adresse est entièrement vide : le navigateur l'a effacé » s'est
// affiché EN TÊTE D'UN INVENTAIRE QUI LISTAIT 6,2 Mo de scans. C'est le pire message
// possible : il annonce à quelqu'un qui vient de croire avoir tout perdu que tout est
// bien perdu, alors que ses données sont énumérées dans le même écran.

/** Le verdict du diagnostic, calculé par le vrai producteur. */
function verdict(stockDiag, etat = {}) {
  const cascade = extraire("stockVerdict: (s.inventaire", "\n          stockLignes:");
  const ctx = { Number, String, Object };
  vm.createContext(ctx);
  const expr = cascade.replace(/^stockVerdict:\s*/, "").replace(/,\s*$/, "");
  vm.runInContext("var f = function (s, d) { return (" + expr + "); };", ctx);
  return vm.runInContext("f", ctx)({ inventaire: null, inventaireEnCours: false, ...etat }, stockDiag);
}

test("aucune phrase de perte tant que l’inventaire n’est pas vide", () => {
  // le cas réel : le diagnostic croit tout vide — le compte de clés valait toujours zéro
  // — mais l'inventaire, lui, porte des postes
  const v = verdict({ blocs: 0, cles: 0 }, { inventaire: [{ type: "local", octets: 6_200_000 }] });
  assert.ok(!/effacé|perdu|Rien n’est enregistré/.test(v),
    `phrase de perte au-dessus d’un inventaire plein : ${v}`);
});

test("ni pendant la mesure : annoncer le vide avant d’avoir compté est le même défaut", () => {
  const v = verdict({ blocs: 0, cles: 0 }, { inventaire: null, inventaireEnCours: true });
  assert.ok(!/effacé|Rien n’est enregistré/.test(v), v);
});

test("un stockage réellement vide le dit — sans affirmer une perte qu’on ne prouve pas", () => {
  const v = verdict({ blocs: 0, cles: 0 }, { inventaire: [], inventaireEnCours: false });
  assert.match(v, /Rien n’est enregistré/);
  // les DEUX explications, parce qu'on ne sait pas laquelle est vraie
  assert.match(v, /rien n’a encore été déposé/);
  assert.match(v, /le navigateur a vidé/);
});

test("« aucune bougie » n’est pas « tout est perdu »", () => {
  const v = verdict({ blocs: 0, cles: 23 }, { inventaire: [], inventaireEnCours: false });
  assert.match(v, /Aucune bougie ni aucun scan/);
  assert.match(v, /23 clés de réglages sont bien là/);
  assert.match(v, /Ce n’est pas une perte/);
  assert.ok(!/effacé/.test(v));
});

/** La source sans ses commentaires de ligne : un garde-fou doit lire le CODE. */
function sansCommentaires(txt) {
  return txt.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
}

test("le diagnostic compte les clés par length/key, pas par Object.keys", () => {
  // l’énumération d’un Storage est une propriété exotique du navigateur : un objet
  // ordinaire ne l’a pas, et rend ses propres méthodes à la place. Le compte de clés
  // valait donc toujours zéro, et c’est ce zéro qui déclenchait la phrase de perte.
  const corps = sansCommentaires(extraire("async diagnosticStockage() {", "  async inventaireStockage("));
  assert.ok(!/Object\.keys\(localStorage\)/.test(corps),
    "la façade n’a pas l’énumération d’un Storage");
  assert.match(corps, /STOCK_BRUT\.key\(i\)/);
});

test("nulle part ailleurs on n’énumère le stockage de cette façon", () => {
  // le commentaire qui explique le défaut a le droit de le nommer ; le code, non
  assert.ok(!/Object\.keys\(localStorage\)/.test(sansCommentaires(SOURCE)),
    "une énumération de ce genre rendrait les méthodes de la façade, jamais les clés");
});
