/**
 * LE MOMENT D'EXÉCUTION (cfg.moment), côté moteur.
 *
 * Le signal se lit sur la bougie de décision ; le moment choisit la bougie H1 du seau
 * où l'ordre part. Quatre règles verrouillées ici :
 *
 *   1. « ouverture » est STRICTEMENT le comportement historique : le même résultat
 *      que sans cfg.moment, au trade près — sinon chaque mesure existante changerait.
 *   2. « heure » n'entre jamais avant l'heure demandée, « spread » jamais au-dessus de
 *      la médiane — la grandeur que medianesSpread() publie, pas un recalcul local.
 *   3. PAS DE REPLI : un seau sans bougie qui satisfait le moment perd son signal.
 *      Le robot ne peut pas entrer rétroactivement sur une bougie déjà passée — un
 *      repli sur l'ouverture ferait entrer Véna là où le robot n'entrera jamais.
 *   4. Le moment voyage : construireConfig le transmet tel quel, et le robot généré
 *      embarque MOMENT_TYPE / MOMENT_HEURE / MOMENT_MED_SPREAD.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig } from "./config.mjs";
import { genererMQ5 } from "../../robot-mt5.js";

const M = await chargerMoteur();

/**
 * Série H1 déterministe : jours ouvrés, spread de rollover à 00:00 (trois fois la
 * normale), et un jour sur sept TRONQUÉ à six bougies — c'est lui qui rend le
 * non-repli observable : son signal est perdu pour « heure 8 », pas déplacé.
 */
function serie(nJours = 900, depart = Date.UTC(2021, 0, 4)) {
  let a = 123456789;
  const rnd = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [];
  let px = 100;
  let ms = depart;
  let ouvres = 0;
  for (let j = 0; j < nJours; j++, ms += 86400000) {
    const jour = new Date(ms).getUTCDay();
    if (jour === 0 || jour === 6) continue;
    ouvres++;
    const nH = ouvres % 7 === 3 ? 6 : 24;
    for (let k = 0; k < nH; k++) {
      const ouv = px;
      const clo = Math.max(1, ouv * (1 + (rnd() - 0.5) * 0.008 + 0.00002));
      t.push(ms + k * 3600000);
      o.push(ouv);
      h.push(Math.max(ouv, clo) * (1 + rnd() * 0.002));
      l.push(Math.min(ouv, clo) * (1 - rnd() * 0.002));
      c.push(clo);
      v.push(100);
      sp.push(k === 0 ? 60 : 20);
      px = clo;
    }
  }
  return M.nettoyer({ t, o, h, l, c, v, sp, n: t.length });
}

const DF = serie();
const BASE = { entree: "croisement_ou_rebond", ligne: "mediane", periode: 15, sl: 0.5, rr: 2, paliers: [] };
const mesurer = (moment) => M.backtesterSuivi(DF,
  { ...construireConfig(BASE), ...(moment ? { moment } : {}) }, "D1");
const heureDe = (tr) => new Date(tr.entree_t).getUTCHours();

test("« ouverture » est le comportement historique, au trade près", () => {
  const sans = mesurer(null);
  const avec = mesurer({ type: "ouverture" });
  assert.ok(sans.length > 30, `trop peu de trades de référence (${sans.length})`);
  assert.equal(avec.length, sans.length, "cfg.moment « ouverture » change le nombre de trades");
  for (let i = 0; i < sans.length; i++) {
    assert.equal(avec[i].entree_t, sans[i].entree_t, "« ouverture » déplace une entrée");
    assert.equal(avec[i].sortie_t, sans[i].sortie_t, "« ouverture » déplace une sortie");
  }
});

test("« heure » n'entre jamais avant l'heure demandée — et change réellement la mesure", () => {
  const ref = mesurer(null);
  const trades = mesurer({ type: "heure", heure: 8 });
  assert.ok(trades.length > 10, `trop peu de trades (${trades.length})`);
  for (const tr of trades) {
    assert.ok(heureDe(tr) >= 8, `entrée à ${heureDe(tr)} h avec un moment « heure 8 »`);
  }
  // le même df sert aux deux mesures : si le memo du moteur confondait les moments
  // (cleForce), la seconde resservirait la première à l'identique
  assert.ok(trades.some((tr) => heureDe(tr) !== 0) || trades.length !== ref.length,
    "le moment « heure » ne change rien : mémo partagé entre moments ?");
});

test("« spread » n'entre que sous la médiane publiée par medianesSpread()", () => {
  const meds = M.medianesSpread(DF);
  assert.ok(meds && meds.serie > 0, "medianesSpread ne publie pas de médiane");
  assert.equal(meds.glissante.length, DF.n, "la médiane glissante ne couvre pas la série");
  const parT = new Map();
  for (let i = 0; i < DF.n; i++) parT.set(DF.t[i], i);
  const trades = mesurer({ type: "spread" });
  assert.ok(trades.length > 10, `trop peu de trades (${trades.length})`);
  for (const tr of trades) {
    const i = parT.get(tr.entree_t);
    assert.ok(i !== undefined, "une entrée sur une bougie inconnue de la série");
    assert.ok(meds.sp[i] > 0 && meds.sp[i] <= meds.serie,
      `entrée avec un spread ${meds.sp[i]} au-dessus de la médiane ${meds.serie}`);
    // le rollover de 00:00 vaut trois fois la normale : il ne doit jamais être choisi
    assert.ok(heureDe(tr) !== 0, "une entrée « spread » sur la bougie de rollover");
  }
});

test("pas de repli : un seau sans bougie au moment demandé perd son signal", () => {
  const ouverture = mesurer(null);
  const heure8 = mesurer({ type: "heure", heure: 8 });
  const jourDe = (ms) => Math.floor(ms / 86400000);
  // les jours tronqués s'arrêtent à 05:00 : leurs signaux d'ouverture existent, mais
  // aucune bougie n'atteint 08:00 — le moment « heure 8 » doit les PERDRE, pas les
  // replier sur l'ouverture
  const tronques = new Set();
  for (const tr of ouverture) {
    const fin = [...Array(24).keys()].filter((k) => {
      const i = DF.t.indexOf(jourDe(tr.entree_t) * 86400000 + k * 3600000);
      return i >= 0;
    });
    if (fin.length && fin[fin.length - 1] < 8) tronques.add(jourDe(tr.entree_t));
  }
  assert.ok(tronques.size > 0,
    "la série de test n'a produit aucun signal sur un jour tronqué : le non-repli n'est pas observable");
  for (const tr of heure8) {
    assert.ok(!tronques.has(jourDe(tr.entree_t)),
      "un signal d'un jour tronqué a été exécuté quand même : le moteur a replié sur l'ouverture");
  }
});

test("le moment voyage : construireConfig le transmet, le robot l'embarque", () => {
  const cfg = construireConfig({ ...BASE, moment: { type: "heure", heure: 10 } });
  assert.deepEqual(cfg.moment, { type: "heure", heure: 10 }, "construireConfig perd le moment");
  assert.equal(construireConfig(BASE).moment, undefined,
    "construireConfig invente un moment quand il n'y en a pas");

  const cfgRobot = { sym: "TEST", entree: "croisement", ligne: "mediane", periode: 15,
    sl: 0.5, rr: 2, n: 100, total: 10, heures_entree: { debut: 0, fin: 0 } };
  const avec = genererMQ5(cfgRobot, { ut: "D1", magic: 1,
    moment: { type: "spread", heure: 8, medSpread: 0.011542, medDate: "2026-09-07" } });
  assert.ok(avec.includes('#define MOMENT_TYPE       "spread"'), "MOMENT_TYPE absent du robot");
  assert.ok(avec.includes("#define MOMENT_MED_SPREAD 0.011542"), "la médiane figée manque");
  assert.ok(avec.includes("figée le 2026-09-07"), "la date de la médiane manque");
  assert.ok(avec.includes('StringCompare(MOMENT_TYPE, "heure")'), "la garde MomentOk manque");
  const sans = genererMQ5(cfgRobot, { ut: "D1", magic: 1 });
  assert.ok(sans.includes('#define MOMENT_TYPE       "ouverture"'),
    "sans moment, le robot doit porter « ouverture » explicitement");
});
