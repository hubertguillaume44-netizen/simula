// ————— AUCUN CHIFFRE PERSONNEL DANS L'ÉTAT INITIAL —————
//
// Le capital de départ est un réglage persisté. Son littéral dans l'état initial ne sert
// donc QU'aux navigateurs vierges — c'est-à-dire à tous les visiteurs, et à eux seuls.
// C'est le pire endroit possible pour un chiffre personnel : celui qui l'a écrit a réglé
// le sien depuis longtemps et ne le rencontre plus jamais ; seuls les inconnus le voient.
// Un capital réel s'y est tenu jusqu'à ce soir, annoncé en en-tête à chaque première
// visite.
//
// LA RÈGLE, ET POURQUOI ELLE EST FORMULÉE AINSI. Ce test ne connaît pas le chiffre qu'il
// empêche de revenir, et ne doit pas le connaître : l'écrire ici le republierait dans le
// dépôt en croyant l'en retirer — le fichier de test est versionné comme les autres.
// D'où une règle de FORME, qui l'attrape sans le nommer : dans l'objet d'état initial,
// aucun littéral numérique >= 1000 n'est admis. Un montant doit passer par une constante
// nommée, déclarée hors de l'objet, où il est lisible, commenté et unique.
//
// Le seuil de 1000 n'est pas arbitraire : sous mille, l'état ne porte que des périodes,
// des seuils et des pourcentages — le plus grand est une mémoire de zone à 250. Au-delà,
// on est dans les montants, et un montant est soit un exemple assumé, soit une fuite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RACINE = new URL("../../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, RACINE), "utf8");

const SEUIL = 1000;

/** L'objet d'état initial, délimité par accolades appariées — jamais par une heuristique. */
function objetEtat(src) {
  const deb = src.indexOf("\n  state = {");
  assert.ok(deb > 0, "l’objet d’état initial est introuvable : la forme « state = { » a changé");
  const ouvre = src.indexOf("{", deb);
  let prof = 0;
  for (let j = ouvre; j < src.length; j++) {
    if (src[j] === "{") prof++;
    else if (src[j] === "}") { prof--; if (!prof) return { texte: src.slice(ouvre, j + 1), ouvre, ligne: src.slice(0, ouvre).split("\n").length }; }
  }
  assert.fail("accolade non refermée : l’état initial n’a pas pu être délimité");
}

/**
 * Les littéraux numériques de l'objet, commentaires et chaînes ôtés.
 * Les chaînes DOIVENT partir avant le comptage : les dates de fenêtre ('2020-01-01') et
 * les grilles ('5 6 7 8 …') sont du texte, pas des nombres, et les compter ferait crier
 * le test sur des valeurs parfaitement légitimes.
 */
function nombres(objet) {
  const net = objet
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
  // (?<![\w.$]) : le 2 de « compte2 » ou de « _grilleV2 » fait partie du nom, pas un nombre
  return [...net.matchAll(/(?<![\w.$])\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?/g)]
    .map((m) => Number(m[0].replace(/_/g, "")));
}

for (const fichier of ["Vena.dc.html", "Vena.solo.html"]) {
  test(`${fichier} : aucun montant en dur dans l’état initial`, () => {
    const { texte } = objetEtat(lire(fichier));
    const gros = [...new Set(nombres(texte).filter((n) => n >= SEUIL))].sort((a, b) => a - b);
    assert.deepEqual(gros, [],
      `${gros.length} montant(s) écrit(s) en dur dans l’état initial : posez-les dans une `
      + `constante nommée déclarée hors de l’objet. Un chiffre d’utilisateur ne doit pas `
      + `être la valeur que voit un visiteur.`);
  });
}

test("le capital de départ lit une constante, déclarée hors de l’objet", () => {
  const src = lire("Vena.dc.html");
  const { texte, ouvre } = objetEtat(src);

  // l'état lit un NOM, pas un nombre — c'est ce qui rend la valeur trouvable et unique
  const m = texte.match(/\bcapital:\s*([A-Za-z_$][\w$]*)\b/);
  assert.ok(m, "« capital » ne lit pas une constante : un nombre y est écrit à la main");

  // et la déclaration est AVANT l'objet : dedans, elle ne serait qu'un littéral déguisé
  const decl = new RegExp(`const ${m[1]} = (\\d+);`);
  const d = src.match(decl);
  assert.ok(d, `${m[1]} n’est déclarée nulle part : l’état lit une valeur qui n’existe pas`);
  assert.ok(src.indexOf(d[0]) < ouvre,
    `${m[1]} est déclarée à l’intérieur de l’état : elle doit vivre hors de l’objet`);

  // ROND, donc manifestement un exemple. Un capital réel tombe juste par accident : ce
  // qui distingue l'exemple du solde, c'est justement de ne pas avoir de reste.
  const v = Number(d[1]);
  assert.ok(v >= SEUIL, `${v} n’est pas un capital plausible pour un exemple`);
  assert.equal(v % SEUIL, 0,
    `${v} n’est pas un chiffre rond : un visiteur y lirait une mesure, donc un réglage `
    + `déjà fait, au lieu d’un exemple à remplacer par le sien`);
});

test("le seuil garde une marge : l’état n’effleure pas 1000 par ailleurs", () => {
  // si un jour un réglage légitime approche le seuil, ce test le dira AVANT que le
  // suivant ne devienne un faux positif à désamorcer dans l'urgence
  const { texte } = objetEtat(lire("Vena.dc.html"));
  const max = Math.max(...nombres(texte));
  assert.ok(max < SEUIL / 2,
    `un réglage vaut ${max}, trop proche du seuil de ${SEUIL} : révisez la règle plutôt `
    + `que de l’assouplir au premier accroc`);
});
