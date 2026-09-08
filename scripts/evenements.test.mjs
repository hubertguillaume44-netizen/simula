/**
 * ÉVÉNEMENTS MACRO — ce qui doit rester vrai côté moteur.
 *
 *   1. L'impact est MESURÉ : une série fabriquée dont la bougie de publication est
 *      trois fois plus ample que les autres rend rapport ≈ 3, jamais un chiffre écrit.
 *   2. Une place fermée à l'heure de publication ne rend PAS de mesure (n = 0) :
 *      le symbole n'est pas exposé, il est écarté avec sa raison.
 *   3. Le décalage série ↔ UTC n'est pas une constante : il est retrouvé dans les
 *      données, comme le fait le comparateur MT5.
 *   4. `sauter_evenements` sans événement dans la plage rend une liste de trades
 *      identique au bit près ; avec des événements, aucune entrée dans la fenêtre.
 *   5. `marquerEvenements` marque exactement les rendez-vous entre entrée et sortie.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur } from "./mt5/charger-moteur.mjs";
import { construireConfig } from "./mt5/config.mjs";

const M = await chargerMoteur();

/**
 * Série H1 déterministe, jours ouvrés seulement, 24 bougies par jour de 06:00 à 05:00 ?
 * Non — plus simple : bougies de 00:00 à 23:00, prix autour de 100, amplitude ~0,2 %.
 * Le premier vendredi de chaque mois, la bougie de `heurePub` porte une amplitude
 * TRIPLE : c'est notre publication plantée dans la donnée.
 */
function serieAvecEvenement({ nJours = 720, heurePub = 14, facteur = 3, depart = Date.UTC(2023, 0, 2) } = {}) {
  let a = 987654321;
  const rnd = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [];
  const pubs = [];
  let px = 100;
  for (let j = 0, ms = depart; j < nJours; j++, ms += 86400000) {
    const d = new Date(ms);
    const jour = d.getUTCDay();
    if (jour === 0 || jour === 6) continue;
    const premierVendredi = jour === 5 && d.getUTCDate() <= 7;
    for (let k = 0; k < 24; k++) {
      const ouv = px;
      const clo = Math.max(1, ouv * (1 + (rnd() - 0.5) * 0.001));
      const largeur = ouv * 0.001 * (premierVendredi && k === heurePub ? facteur : 1);
      t.push(ms + k * 3600000);
      o.push(ouv);
      h.push(Math.max(ouv, clo) + largeur);
      l.push(Math.min(ouv, clo) - largeur);
      c.push(clo);
      v.push(100);
      sp.push(20);
      if (premierVendredi && k === heurePub) pubs.push(ms + k * 3600000 + 1800000);
      px = clo;
    }
  }
  return { df: M.nettoyer({ t, o, h, l, c, v, sp, n: t.length }), pubs };
}

test("rapport ≈ 3 quand la bougie de publication est trois fois plus ample", () => {
  const { df, pubs } = serieAvecEvenement();
  assert.ok(pubs.length >= 12, "moins de 12 occurrences fabriquées (" + pubs.length + ")");
  const r = M.impactEvenement(df, pubs, { dec: 0, stopPct: 1 });
  assert.equal(r.n, pubs.length, "des occurrences perdues : " + r.n + " / " + pubs.length);
  assert.ok(r.rapport > 2.4 && r.rapport < 3.6,
    "rapport attendu ≈ 3, mesuré " + r.rapport.toFixed(2));
  assert.ok(r.ampli > 0, "amplitude absente");
  assert.ok(Number.isFinite(r.efface4h), "efface4h absent");
});

test("place fermée à l'heure de publication : aucune mesure, symbole non exposé", () => {
  const { df } = serieAvecEvenement();
  // instants plantés le samedi : aucune bougie ne les couvre
  const samedis = [];
  for (let ms = df.t[0]; ms < df.t[df.n - 1] && samedis.length < 20; ms += 86400000) {
    if (new Date(ms).getUTCDay() === 6) samedis.push(ms + 14 * 3600000);
  }
  const r = M.impactEvenement(df, samedis, { dec: 0, stopPct: 1 });
  assert.equal(r.n, 0, "une mesure sur une place fermée");
  assert.equal(r.fermees, samedis.length, "les occurrences fermées ne sont pas comptées");
});

test("le décalage série ↔ UTC est retrouvé dans les données, pas posé en constante", () => {
  // la publication vit à 16 h à l'horloge de la série ; les ancres UTC disent 14 h :
  // le vrai décalage est +2, et c'est lui qui doit sortir
  const { df, pubs } = serieAvecEvenement({ heurePub: 16 });
  const ancres = pubs.map((ms) => ms - 2 * 3600000);
  const r = M.decalageSerie(df, ancres);
  assert.equal(r.dec, 2, "décalage attendu +2, trouvé " + r.dec + " (net " + r.net.toFixed(2) + ")");
});

const BASE = { entree: "croisement_ou_rebond", ligne: "mediane", periode: 15, sl: 0.5, rr: 2, paliers: [] };

test("sauter_evenements sans événement dans la plage : liste identique au bit près", () => {
  const { df } = serieAvecEvenement();
  const sans = M.backtesterSuivi(df, construireConfig(BASE), "D1");
  const avec = M.backtesterSuivi(df, { ...construireConfig(BASE),
    sauter_evenements: { heures: 2, instants: [df.t[0] - 30 * 86400000] } }, "D1");
  assert.ok(sans.length > 10, "trop peu de trades de référence (" + sans.length + ")");
  assert.equal(JSON.stringify(avec), JSON.stringify(sans),
    "un événement HORS plage a changé la mesure");
});

test("sauter_evenements bloque les entrées dans la fenêtre, et rien d'autre", () => {
  const { df, pubs } = serieAvecEvenement();
  const sans = M.backtesterSuivi(df, construireConfig(BASE), "D1");
  const avec = M.backtesterSuivi(df, { ...construireConfig(BASE),
    sauter_evenements: { heures: 2, instants: pubs } }, "D1");
  const demi = 2 * 3600000;
  for (const tr of avec) {
    for (const p of pubs) {
      assert.ok(Math.abs(p - tr.entree_t) > demi,
        "entrée à " + new Date(tr.entree_t).toISOString() + " dans la fenêtre d'un événement");
    }
  }
  // les entrées HORS fenêtre de la mesure de référence sont toutes conservées
  const entreesSans = new Set(sans.filter((tr) => pubs.every((p) => Math.abs(p - tr.entree_t) > demi))
    .map((tr) => tr.entree_t));
  const entreesAvec = new Set(avec.map((tr) => tr.entree_t));
  for (const e of entreesAvec) {
    assert.ok(pubs.every((p) => Math.abs(p - e) > demi), "entrée nouvelle dans la fenêtre");
  }
  // au moins les entrées communes existent : le filtre ne peut qu'en retirer autour
  // des fenêtres (une sortie déplacée peut décaler les suivantes, on ne compare pas 1:1)
  assert.ok(entreesAvec.size <= sans.length, "le filtre a créé des trades");
  assert.ok([...entreesSans].some((e) => entreesAvec.has(e)), "plus aucune entrée commune");
});

test("marquerEvenements : exactement les rendez-vous entre entrée et sortie", () => {
  const trades = [
    { entree_t: 1000, sortie_t: 5000 },
    { entree_t: 6000, sortie_t: 7000 },
  ];
  M.marquerEvenements(trades, [
    { cle: "nfp", ms: 2000 }, { cle: "cpi", ms: 4999 },
    { cle: "fomc", ms: 5500 }, { cle: "nfp", ms: 3000 },
  ]);
  assert.deepEqual(trades[0].evTraverses, ["nfp", "cpi"]);
  assert.equal(trades[1].evTraverses, undefined);
});

test("offsetParis : heure d'été et d'hiver", () => {
  assert.equal(M.offsetParis(Date.UTC(2026, 0, 15)), 1);
  assert.equal(M.offsetParis(Date.UTC(2026, 6, 15)), 2);
  // 14 h 30 à Paris un jour d'été = 12 h 30 UTC
  assert.equal(M.msParis(2026, 6, 3, 14, 30), Date.UTC(2026, 6, 3, 12, 30));
  assert.equal(M.msParis(2026, 0, 9, 14, 30), Date.UTC(2026, 0, 9, 13, 30));
});
