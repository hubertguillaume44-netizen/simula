/**
 * Le format du journal de conformité est un contrat entre le robot MQL5 et ce harnais.
 * Les champs sont positionnels : en déplacer un casse la comparaison SANS erreur — le
 * lecteur rendrait des nombres plausibles mais faux. Ces tests figent l'ordre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { lireConformite } from "./conformite.mjs";
import { genererMQ5 } from "../../robot-mt5.js";
import { REFERENCES } from "./references.mjs";
import { etatDepuisReference } from "./etat-depuis-reference.mjs";
import { contexteRapport, lireRapportMt5 } from "./parse-mt5.mjs";

const JOURNAL = [
  "bruit du testeur avant",
  "XX 0 12:00:00 Core 1 CONF|D|2020.05.19 00:00|1|0.90914|0.90447|0.90779|0.90748|0.91077|0.90427|",
  "XX 0 12:00:00 Core 1 CONF|D|2020.05.20 00:00|0|0.90800|0.90914|0.90790|0.90779|0.91000|0.90700|pas de croisement",
  "XX 0 12:00:00 Core 1 CONF|T|2020.05.19 00:00|0.051697|0.034204|0|premiere|spread",
  "XX 0 12:00:00 Core 1 CONF|T|2020.05.19 01:00|0.034122|0.034204|1|reprise|",
  "XX 0 12:00:00 Core 1 CONF|E|2020.05.19 01:00|2020.05.19 01:00|0.90961|0.90506|0.91871|0.66",
  "XX 0 12:00:00 Core 1 CONF|P|2020.05.19 03:00|52.10|0.90506|0.90961|0.91200",
].join("\n");

test("le journal se lit malgré le bruit du testeur autour", () => {
  const c = lireConformite(JOURNAL);
  assert.equal(c.D.size, 2);
  assert.equal(c.E.size, 1);
  assert.equal(c.P.length, 1);
});

test("les champs de la ligne D gardent leur ordre", () => {
  const j = Math.floor(Date.UTC(2020, 4, 19) / 86400000);
  const d = lireConformite(JOURNAL).D.get(j);
  assert.equal(d.signal, true);
  assert.equal(d.c1, 0.90914);   // c1 avant c2 : les inverser retournerait le croisement
  assert.equal(d.c2, 0.90447);
  assert.equal(d.l1, 0.90779);
  assert.equal(d.l2, 0.90748);
  assert.equal(d.haut1, 0.91077);
  assert.equal(d.bas1, 0.90427);
  const refus = lireConformite(JOURNAL).D.get(j + 1);
  assert.equal(refus.signal, false);
  assert.equal(refus.raison, "pas de croisement");
});

test("les tentatives sont groupées par jour, dans l'ordre, avec leur verdict", () => {
  const j = Math.floor(Date.UTC(2020, 4, 19) / 86400000);
  const t = lireConformite(JOURNAL).T.get(j);
  assert.equal(t.length, 2);
  assert.equal(t[0].accepte, false);
  assert.equal(t[0].raison, "spread");
  assert.equal(t[0].sp, 0.051697);
  assert.equal(t[0].plafond, 0.034204);
  assert.equal(t[1].accepte, true);
  assert.equal(t[1].quand, "reprise");
  assert.ok(t[1].t > t[0].t, "les tentatives ne sont pas dans l'ordre chronologique");
});

test("l'entrée distingue la bougie visée de l'instant réel du fill", () => {
  // Sur HongKong50 la séance ouvre à 03:31 : le robot entre à 03:31 sur la bougie de
  // 03:00. Confondre les deux ferait conclure à un écart d'entrée inexistant.
  const c = lireConformite(
    "CONF|E|2020.01.03 03:00|2020.01.03 03:31|25123.50|24922.50|25425.75|0.87",
  );
  const e = [...c.E.values()][0];
  assert.equal(new Date(e.t).getUTCHours(), 3);
  assert.equal(new Date(e.t).getUTCMinutes(), 0);
  assert.equal(new Date(e.reel).getUTCMinutes(), 31);
});

test("le palier porte le parcours atteint et les deux stops", () => {
  const p = lireConformite(JOURNAL).P[0];
  assert.equal(p.parcours, 52.10);
  assert.equal(p.avant, 0.90506);
  assert.equal(p.apres, 0.90961);
  assert.ok(p.apres > p.avant, "un palier ne peut que resserrer le stop");
});

test("le robot généré émet les quatre types de ligne", () => {
  const ref = REFERENCES.find((r) => r.sym === "AUDCAD");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260101_0000", magic: 1, paliers: [[25, 0]],
      spreadFacteur: 1.5 },
  );
  assert.match(src, /input bool {3}InpConformite/);
  for (const type of ["D", "T", "E", "P"]) {
    assert.ok(src.includes(`Conf(StringFormat("${type}|`),
      `le robot n'émet aucune ligne de type ${type}`);
  }
  // le journal ne doit rien coûter quand il est éteint
  assert.match(src, /void Conf\(string ligne\)\s*\{\s*if\(!InpConformite\) return;/);
});

test("un rapport joué sur le mauvais symbole est signalé, pas exploité", () => {
  // MT5 exécute l'expert sur le symbole DU GRAPHIQUE. Un robot HongKong50 déposé sur un
  // graphique Germany40 rend un rapport d'apparence normale : 94 trades au lieu de 67,
  // dix journées communes sur 94, et la conclusion — à tort — qu'une correction récente
  // avait tout cassé. Une heure perdue, et une accusation portée contre du code sain.
  const faux = contexteRapport(
    "Expert: Sivula_HongKong50_Achat_mediane_6_SL0p8_RR1p5_260904_0930\nSymbole: #Germany40\n",
  );
  assert.equal(faux.attendu, "HongKong50");
  assert.equal(faux.symbole, "#Germany40");
  assert.equal(faux.concorde, false);

  // le « # » du courtier et la casse ne doivent pas déclencher de faux positif
  const bon = contexteRapport(
    "Expert: Sivula_Japan225_Achat_mediane_10_SL2_RR1p5_260904_0930\nSymbole: #Japan225\n",
  );
  assert.equal(bon.concorde, true);
});

test("l'avertissement remonte au lecteur de rapport", () => {
  const r = lireRapportMt5(
    "Expert: Sivula_HongKong50_Achat_mediane_6_SL0p8_RR1p5_260904_0930\nSymbole: #Germany40\n",
  );
  assert.ok(r.avertissements.some((a) => /symbole DU GRAPHIQUE/.test(a)),
    "aucun avertissement sur le symbole");
  assert.equal(r.contexte.concorde, false);
});

test("le journal de conformité part dans son propre fichier, pas dans celui du testeur", () => {
  // Passé par Print(), il se noyait dans le journal général : 473 Mo pour une journée de
  // tests, toutes exécutions mélangées, et le fichier récupéré s'est révélé être celui
  // d'une exécution ANTÉRIEURE — sans que rien ne le signale. Un fichier par symbole et
  // par build, dans le dossier commun du terminal, supprime la question.
  const ref = REFERENCES.find((r) => r.sym === "HongKong50");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260904_TEST", magic: 1, paliers: [], spreadFacteur: 1.5 },
  );
  assert.match(src, /_conformite_260904_TEST\.csv/);
  assert.match(src, /FILE_COMMON/, "le fichier n'irait pas dans le dossier commun : "
    + "chaque agent de test a son propre bac à sable, introuvable");
  assert.match(src, /StringReplace\(nom, "#", ""\)/, "le # de #HongKong50 n'est pas retiré du nom");
  assert.match(src, /int OnInit\(\)\s*\{\s*ConfOuvrir\(\);/);
  assert.match(src, /OnDeinit\(const int reason\) \{ ConfFermer\(\);/);
  // les fins de ligne doivent rester des ÉCHAPPEMENTS dans le MQL5, pas de vrais sauts
  assert.ok(src.includes('"CONF|" + ligne + "\\r\\n"'),
    "les \\r\\n ont été interprétés à la génération : le fichier sortirait sur une seule ligne");
  // et il ne coûte rien quand il est éteint
  assert.match(src, /void Conf\(string ligne\)\s*\{\s*if\(!InpConformite\) return;/);
});
