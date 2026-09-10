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
  const cascade = extraire("inventaire: inv.map((p) => ({", "\n          })),");
  const ctx = { Number, String, Math, JSON, Object, Array, Date, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    "var faux = {",
    "  state: " + JSON.stringify({ libSuppr: null, ...etat }) + ",",
    "  taille(o) { return Math.round((o || 0) / 1024) + ' Ko'; },",
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

test("le conflit s’annonce comme un conflit, avec ses deux poids et ses deux choix", () => {
  const c = rendreInventaire(POSTES).find((iv) => iv.aChoix);
  assert.ok(c, "aucun poste n’offre de choix : le conflit n’est plus arbitrable");
  assert.match(c.nom, /DEUX EXEMPLAIRES QUI DIFFÈRENT/);
  // les deux poids sont dits : c'est sur eux que l'utilisateur tranche
  assert.match(c.detail, /9 Ko/);
  assert.match(c.detail, /14 Ko/);
  assert.equal(typeof c.choix, "function");
  assert.ok(c.aSupprimable, "le second choix a disparu");
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
