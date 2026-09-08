/**
 * MQL5 n'accepte pas la juxtaposition de littéraux à la C : `"abc"` suivi de
 * `"def"` à la ligne suivante ne compile pas (« closing quote expected », puis
 * la cascade). Le bug a déjà été corrigé une fois — l'empreinte de build, voir
 * le commentaire dans robot-mt5.js — puis il est revenu deux fois ailleurs.
 * Un robot qui ne compile pas est un produit mort : la règle se vérifie ici,
 * sur le .mq5 généré, pas dans MetaEditor à la main.
 *
 * Deux règles :
 * 1. aucune ligne terminée par un guillemet fermant ne doit être suivie d'une
 *    ligne commençant par un guillemet. Les jonctions légales finissent par
 *    `",` ou `" +`, ou ouvrent la ligne suivante par `+ "` — elles ne
 *    déclenchent donc pas le motif ;
 * 2. aucune ligne ne laisse un littéral ouvert : un `\r\n` écrit sans doubler
 *    la barre dans le générateur devient un VRAI saut de ligne au milieu d'une
 *    chaîne du .mq5 — même erreur du compilateur, autre chemin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { REFERENCES } from "./references.mjs";
import { genererRobot } from "./etat-depuis-reference.mjs";

/** Vrai si la ligne se termine à l'intérieur d'une chaîne (hors commentaire). */
function litteralOuvert(l) {
  let dedans = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (dedans && c === "\\") { i++; continue; }
    if (c === '"') dedans = !dedans;
    else if (!dedans && c === "/" && l[i + 1] === "/") break;
  }
  return dedans;
}

test("aucun littéral juxtaposé ni coupé dans les .mq5 générés", () => {
  for (const ref of REFERENCES) {
    const { nom, source } = genererRobot(ref, "260101_0000");
    const lignes = source.split("\n");
    for (let i = 0; i < lignes.length; i++) {
      const a = i ? lignes[i - 1].trimEnd() : "", b = lignes[i].trimStart();
      assert.ok(!(a.endsWith('"') && b.startsWith('"')),
        `${nom} : littéraux juxtaposés — MQL5 ne compilera pas :\n${lignes[i - 1]}\n${lignes[i]}`);
      assert.ok(!litteralOuvert(lignes[i].replace(/\r$/, "")),
        `${nom} : chaîne non refermée en fin de ligne — MQL5 ne compilera pas :\n${lignes[i]}`);
    }
  }
});
