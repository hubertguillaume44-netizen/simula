/**
 * La syntaxe des chaînes du .mq5 généré, vérifiée sur chaque branche d'émission.
 *
 * MQL5 refuse deux choses que JavaScript laisse passer sans bruit :
 * - la juxtaposition de littéraux à la C (`"abc"` puis `"def"` à la ligne
 *   suivante) — corrigée deux fois déjà, revenue deux fois ;
 * - une chaîne coupée par une fin de ligne — c'est ce que produit un `\r\n`
 *   écrit sans doubler la barre dans le template du générateur.
 * Les deux donnent « closing quote expected » et la cascade qui suit. Un robot
 * qui ne compile pas est un produit mort : la règle se vérifie ici, sur le
 * fichier généré, pas dans MetaEditor à la main.
 *
 * Neuf variantes forcent chacune une branche d'émission différente, et chaque
 * variante PROUVE que sa branche est bien émise (un drapeau mal nommé serait
 * ignoré en silence, et le test passerait en couvrant moins). Les huit
 * références passent aussi, et une contre-épreuve vérifie que les deux règles
 * mordent sur un source volontairement cassé.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { genererMQ5 } from "../../robot-mt5.js";
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

/** Toutes les fautes de chaîne d'un source MQL5 — vide si le fichier compile. */
function fautes(source) {
  const out = [];
  const lignes = source.split("\n").map((l) => l.replace(/\r$/, ""));
  for (let i = 0; i < lignes.length; i++) {
    const a = i ? lignes[i - 1].trimEnd() : "";
    const b = lignes[i].trimStart();
    if (a.endsWith('"') && b.startsWith('"')) {
      out.push("littéraux juxtaposés : …" + a.slice(-30) + " / " + b.slice(0, 30) + "…");
    }
    if (litteralOuvert(lignes[i])) {
      out.push("chaîne non refermée : " + lignes[i].trim().slice(0, 60));
    }
  }
  return out;
}

const BASE = { sym: "AUDCAD", sens: "achat", entree: "croisement_prix", ligne: "ema",
  periode: 15, sl: 0.5, rr: 2, ut: "D1", n: 100, total: 30, rAn: 5, dd: 2 };
const CTX = { stamp: "260101_0000", magic: 7, paliers: [] };

// [nom, surcharge cfg, surcharge ctx, preuve que la branche est émise]
const VARIANTES = [
  ["base achat EMA", {}, {}, /M_EMA/],
  ["vente", { sens: "vente" }, {}, /VENTE/],
  ["médiane, croisement ou rebond", { ligne: "mediane", entree: "croisement_ou_rebond" }, {}, /M_MEDIANE/],
  ["SMA", { ligne: "ma" }, {}, /M_SMA/],
  ["tendance MTF", {}, { etat: { btMtf: true, utMtf: "D1", ligneMtf: "ema", periodeMtf: 9 } },
    /tendance D1 ema 9/],
  ["filtre RSI", {}, { etat: { fRsi: true, periodeRsi: 14, utRsi: "H1", fRsiSeuil: 50 } },
    /RSI H1 14 > 50/],
  ["filtre ADX", {}, { etat: { fAdx: true, periodeAdx: 14, utAdx: "H1", fAdxSeuil: 20 } },
    /ADX H1\(14\) > 20/],
  ["MM 200 + pente", {}, { etat: { fMa: true, periodeMa: 200, utMa: "D1",
    fPente: true, utPente: "H4", lignePente: "ema", periodeMtf: 9, fPenteRecul: 3 } },
    /au-dessus MM D1 200/],
  ["paliers + durée max + BE", {}, { etat: { btBE: true, typeSecu: "be_progressif", btDureeMax: 48 },
    paliers: [[25, 0], [50, 25], [75, 50]] }, /DUREE_MAX\s+48/],
];

test("neuf variantes d'émission : chaque branche émise, aucune chaîne cassée", () => {
  assert.equal(VARIANTES.length, 9);
  for (const [nom, sur, ctxSur, preuve] of VARIANTES) {
    const src = genererMQ5({ ...BASE, ...sur }, { ...CTX, ...ctxSur });
    assert.match(src, preuve,
      nom + " : la branche attendue n'est pas émise — drapeau mal nommé ?");
    const f = fautes(src);
    assert.deepEqual(f, [], nom + " : " + (f[0] || ""));
  }
});

test("les huit robots de référence aussi", () => {
  for (const ref of REFERENCES) {
    const { nom, source } = genererRobot(ref, "260101_0000");
    const f = fautes(source);
    assert.deepEqual(f, [], nom + " : " + (f[0] || ""));
  }
});

test("contre-épreuve : un source cassé est refusé par la bonne règle", () => {
  const juxta = fautes('Print("repli sur "\n      "l\'agrégat H1");');
  assert.equal(juxta.length, 1);
  assert.match(juxta[0], /juxtaposés/);
  // une chaîne coupée déclenche les deux règles : la ligne s'arrête en pleine
  // chaîne, ET la suivante commence par le guillemet orphelin
  const coupee = fautes('FileWriteString(f, ligne + "\n");');
  assert.ok(coupee.some((f) => /non refermée/.test(f)), coupee.join(" · "));
  // et les jonctions légales ne déclenchent rien : virgule, +, commentaire avec guillemet
  assert.deepEqual(fautes('Print("a",\n      "b" +\n      "c"); // dit "ok"\ns = "x\\"y";'), []);
});
