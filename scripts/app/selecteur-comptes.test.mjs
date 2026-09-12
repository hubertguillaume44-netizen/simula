// ————— LE SÉLECTEUR DE COMPTES —————
//
// Observé chez un utilisateur, en vue intégrée : le menu de l'en-tête ne portait qu'une
// option VIDE — ni valeur ni libellé — plus « + Ajouter un compte… ». Un `<select>` dont
// la valeur ne correspond à aucune option retombe à "", si bien que l'en-tête
// n'annonçait plus aucun compte alors que le reste de l'écran nommait le compte partout.
//
// La forme a été identifiée par élimination, en forçant chaque valeur dégénérée dans le
// fichier livré : `undefined`, `[]` et `null` ne rendent QUE « + Ajouter un compte… » ;
// seul un tableau d'UN élément sans `cle` ni `nom` reproduit le relevé.
//
// La cause reste inconnue — le code ne peut pas produire cette forme, et `COURTIERS`
// n'est jamais muté. Ces tests ne la cherchent pas : ils garantissent qu'aucune entrée
// sans clé n'atteint le menu, quelle que soit la dégradation en amont. Une panne
// silencieuse devient alors une panne visible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

/** Le producteur réel des comptes, monté sur un faux composant. */
function comptes(COURTIERS, { conf = {}, compteActif = "fxpro", noms = {} } = {}) {
  const i = SOURCE.indexOf("        const conf = this.comptesConfigures();");
  assert.ok(i > 0, "le producteur des comptes ne se délimite plus");
  // UN SEUL bloc doit commencer ainsi. Un second producteur ouvrant sur la même ligne a
  // déjà été inséré au-dessus : `indexOf` avait attrapé le sien, et le test échouait sur
  // une variable manquante — un message qui ne désignait pas la vraie cause.
  assert.equal(SOURCE.indexOf("        const conf = this.comptesConfigures();", i + 1), -1,
    "deux blocs ouvrent sur cette ligne : la délimitation attrape le premier venu");
  const j = SOURCE.indexOf("\n        };\n      })(),", i);
  assert.ok(j > i, "la fin du producteur ne se délimite plus");
  const corps = SOURCE.slice(i, j + "\n        };".length);
  const ctx = { Array, Object, String, Number, JSON, console };
  vm.createContext(ctx);
  vm.runInContext(
    "var faux = {\n"
    + "  COURTIERS: " + JSON.stringify(COURTIERS) + ",\n"
    + "  compteActif: " + JSON.stringify(compteActif) + ",\n"
    + "  _noms: " + JSON.stringify(noms) + ",\n"
    + "  comptesConfigures() { return " + JSON.stringify(conf) + "; },\n"
    + "  nomCourtier(cle) {\n"
    + "    if (this._noms[cle]) return this._noms[cle];\n"
    + "    var c = (Array.isArray(this.COURTIERS) ? this.COURTIERS : []).find(function (l) { return Array.isArray(l) && l[0] === cle; });\n"
    + "    return c ? c[1] : 'vos comptes';\n"
    + "  },\n"
    + "  changerCompte() {},\n"
    + "  produire(s) {\n" + corps + "\n  },\n"
    + "};", ctx);
  return vm.runInContext("faux.produire({ menuComptes: false })", ctx);
}

// Le libellé du nº 1 est ARBITRAIRE ici, et distinct du défaut de l'application : ce que
// ces tests vérifient, c'est que le producteur restitue le libellé qu'on lui donne — pas
// qu'il en connaisse un en particulier.
const NORMAL = [["fxpro", "Mon courtier", null], ["compte2", "Compte nº 2", null],
  ["demo", "Compte démo — données fictives", null]];

test("au premier rendu, le menu porte le compte actif nommé", () => {
  const r = comptes(NORMAL, { conf: { demo: true } });
  assert.equal(r.compteChoisi, "fxpro");
  const cles = r.comptesTete.map((x) => x.cle);
  assert.ok(cles.includes("fxpro"), `le compte actif manque : ${JSON.stringify(cles)}`);
  const f = r.comptesTete.find((x) => x.cle === "fxpro");
  assert.match(f.nom, /Mon courtier/);
});

test("le compte actif est là même sans relevé et sans nom personnalisé", () => {
  // le cas de l'utilisateur : ni `noms.comptes`, ni relevé, ni `ongCourtier` en session
  const r = comptes(NORMAL, { conf: {} });
  const f = r.comptesTete.find((x) => x.cle === "fxpro");
  assert.ok(f, "le compte actif doit figurer même sans relevé");
  assert.match(f.nom, /aucun relevé/);
});

// COURTIERS dégradé de toutes les façons plausibles : le producteur déstructure
// `map(([cle], i) => …)`, et une ligne qui n'est pas un tableau y rend `cle: undefined`
const DEGRADES = [
  ["une ligne vide", [[], ["fxpro", "Mon courtier", null], ["demo", "Démo", null]]],
  ["une ligne non-tableau", [null, ["fxpro", "Mon courtier", null], ["demo", "Démo", null]]],
  ["un objet à la place d’une ligne", [{}, ["fxpro", "Mon courtier", null], ["demo", "Démo", null]]],
  ["une ligne sans nom", [["fxpro"], ["demo", "Démo", null]]],
  ["la table entière vide", []],
  ["la table qui n’est pas un tableau", null],
];

for (const [quoi, table] of DEGRADES) {
  test(`aucune option fantôme avec ${quoi}`, () => {
    const r = comptes(table, { conf: { demo: true } });
    assert.equal(typeof r.comptesTete.length, "number", "comptesTete doit rester un tableau");
    for (const e of r.comptesTete) {
      assert.ok(e.cle, `option sans valeur : ${JSON.stringify(e)}`);
      assert.ok(e.nom, `option sans libellé : ${JSON.stringify(e)}`);
      assert.equal(typeof e.cle, "string");
      assert.equal(typeof e.nom, "string");
    }
    // et la même exigence sur la liste des onglets, qui vient du même `ouverts`
    for (const e of r.comptesOuverts) assert.ok(e.cle, `onglet sans clé : ${JSON.stringify(e)}`);
    // le menu est en <div> : chaque entrée porte son geste, il n'y a plus de valeur à
    // retrouver dans une liste d'options
    for (const e of r.comptesTete) assert.equal(typeof e.choisir, "function", "entrée sans geste");
  });
}

test("une table entièrement dégradée laisse une option UTILISABLE, jamais une vide", () => {
  // c'est la panne visible qu'on veut. Aucune ligne de COURTIERS n'est lisible, donc
  // aucun compte ne peut en sortir — un littéral prend alors le relais et reste
  // sélectionnable. Un menu qui ne propose qu'un compte se remarque ; une option vide
  // qui ne sélectionne rien ne se remarque pas.
  //
  // CE FILET A ÉTÉ PERDU UNE FOIS, sans que personne ne le vise : il était porté par
  // l'entrée du compte de démonstration, ajoutée d'office au menu. En retirant ce
  // compte, on a retiré le filet — ce test l'a dit le jour même. Il est depuis écrit
  // pour lui-même, et non comme l'effet de bord d'autre chose.
  const r = comptes([[], null, {}], { conf: {} });
  assert.ok(r.comptesTete.length > 0, "un menu entièrement vide serait une autre panne");
  for (const e of r.comptesTete) {
    assert.ok(e.cle && e.nom, `option fantôme : ${JSON.stringify(e)}`);
  }
  assert.equal(r.comptesTete.map((x) => x.cle).join(","), "fxpro");
});

test("le producteur ne jette pas sur une table dégradée", () => {
  for (const [, table] of DEGRADES) assert.doesNotThrow(() => comptes(table, { conf: {} }));
});

test("le libellé du bouton nomme un compte que le menu offre vraiment", () => {
  // le <select> tombait à "" quand sa valeur ne correspondait à aucune option, sans
  // rien dire. Un bouton, lui, affiche un texte : il ne doit jamais nommer un compte
  // absent du menu.
  for (const [, table] of [["normal", NORMAL], ...DEGRADES]) {
    const r = comptes(table, { conf: { demo: true } });
    if (!r.comptesTete.length) continue;
    const noms = r.comptesTete.map((x) => x.nom);
    const tete = r.compteTeteTxt;
    assert.ok(tete, "le bouton n’a pas de libellé");
    assert.ok(noms.some((n) => n.startsWith(tete)) || tete === "vos comptes",
      `le bouton annonce « ${tete} », absent du menu ${JSON.stringify(noms)}`);
  }
});
