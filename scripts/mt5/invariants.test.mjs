/**
 * Les cinq invariants du moteur, figés.
 *
 * Ils viennent du moteur Python d'origine et ne doivent jamais être contournés :
 *   1. données de base H1 uniquement, H4/D1 par agrégation
 *   2. bougie confirmée uniquement — aucune décision ne lit la bougie en cours
 *   3. multi-UT = dernière bougie supérieure CLÔTURÉE
 *   4. un bloc rend un booléen, le moteur combine
 *   5. signal sur clôture de N → entrée à l'ouverture de N+1
 *
 * Les tests 2, 3 et 5 sont des tests de FUITE : on modifie l'avenir et on vérifie que
 * le passé ne bouge pas. C'est la seule façon de prouver l'absence de regard en avant —
 * relire le code ne le prouve pas, et c'est ce qui a déjà laissé passer des régressions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig } from "./config.mjs";

const M = await chargerMoteur();
const DEBUT = Date.UTC(2021, 0, 1);

/** Série H1 déterministe : jours ouvrés, 24 h, marche aléatoire reproductible. */
function serie(nJours = 700) {
  let a = 12345;
  const rnd = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [];
  let px = 100;
  let ms = Date.UTC(2020, 0, 1);
  for (let j = 0; j < nJours; j++, ms += 86400000) {
    const jour = new Date(ms).getUTCDay();
    if (jour === 0 || jour === 6) continue;
    for (let k = 0; k < 24; k++) {
      const ouv = px;
      const clo = Math.max(1, ouv * (1 + (rnd() - 0.5) * 0.006));
      t.push(ms + k * 3600000);
      o.push(ouv);
      h.push(Math.max(ouv, clo) * (1 + rnd() * 0.002));
      l.push(Math.min(ouv, clo) * (1 - rnd() * 0.002));
      c.push(clo);
      v.push(100);
      // le rollover coûte plus cher : 3 fois le spread de séance à 00:00
      sp.push(k === 0 ? 60 : 20);
      px = clo;
    }
  }
  return M.nettoyer({ t, o, h, l, c, v, sp, n: t.length });
}

const tronquer = (df, n) => ({
  ...df, t: df.t.slice(0, n), o: df.o.slice(0, n), h: df.h.slice(0, n),
  l: df.l.slice(0, n), c: df.c.slice(0, n), v: df.v.slice(0, n),
  sp: df.sp ? df.sp.slice(0, n) : undefined,
  spreadPct: df.spreadPct ? df.spreadPct.slice(0, n) : null, n,
});

const CFG = { entree: "croisement_ou_rebond", ligne: "mediane", periode: 15, sl: 0.5, rr: 2, paliers: [], debut: DEBUT };
const DF = serie();

test("invariant 1 — H4 et D1 sont des agrégations exactes du H1, jamais une autre série", () => {
  for (const ut of ["H4", "D1"]) {
    const sup = M.resampler(DF, ut);
    const pas = ut === "D1" ? 86400000 : 4 * 3600000;
    assert.ok(sup.n > 100, `${ut} : trop peu de bougies`);
    for (let k = 0; k < sup.n; k++) {
      const membres = [];
      for (let i = 0; i < DF.n; i++) if (Math.floor(DF.t[i] / pas) * pas === sup.t[k]) membres.push(i);
      assert.ok(membres.length, `${ut} bougie ${k} sans bougie H1 source`);
      assert.equal(sup.o[k], DF.o[membres[0]], `${ut} : ouverture ≠ 1re H1`);
      assert.equal(sup.c[k], DF.c[membres.at(-1)], `${ut} : clôture ≠ dernière H1`);
      assert.equal(sup.h[k], Math.max(...membres.map((i) => DF.h[i])), `${ut} : haut ≠ max des H1`);
      assert.equal(sup.l[k], Math.min(...membres.map((i) => DF.l[i])), `${ut} : bas ≠ min des H1`);
    }
  }
});

test("invariant 2 — aucune décision ne lit l'avenir (test de troncature)", () => {
  const complet = M.signalDe(DF, construireConfig(CFG));
  for (const coupe of [3000, 5000, 8000]) {
    const court = M.signalDe(tronquer(DF, coupe), construireConfig(CFG));
    for (let i = 0; i < coupe; i++) {
      assert.equal(court[i], complet[i], `signal[${i}] change quand on tronque à ${coupe} : fuite d'information future`);
    }
  }
});

test("invariant 2 bis — les indicateurs eux-mêmes ne lisent pas l'avenir", () => {
  const coupe = 6000;
  const court = tronquer(DF, coupe);
  const paires = [
    ["ema", () => M.ema(DF.c, 26), () => M.ema(court.c, 26)],
    ["sma", () => M.sma(DF.c, 50), () => M.sma(court.c, 50)],
    ["mediane", () => M.mediane(DF, 9), () => M.mediane(court, 9)],
    ["rsi", () => M.rsi(DF.c, 14), () => M.rsi(court.c, 14)],
    ["atr", () => M.atr(DF, 14), () => M.atr(court, 14)],
    ["adx", () => M.adx(DF, 14), () => M.adx(court, 14)],
  ];
  for (const [nom, longD, courtD] of paires) {
    M.memActiver(false); // sinon la mémoïsation rendrait la série longue
    const a = longD(), b = courtD();
    M.memActiver(true);
    for (let i = 0; i < coupe; i++) {
      if (Number.isNaN(a[i]) && Number.isNaN(b[i])) continue;
      assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `${nom}[${i}] : ${a[i]} ≠ ${b[i]} — dépend de bougies futures`);
    }
  }
});

test("invariant 3 — un filtre D1 lit la dernière bougie D1 CLÔTURÉE", () => {
  const f = { type: "tendance_mtf", ut: "D1", ligne: "mediane", periode: 9 };
  const avant = M.tendanceMtf(DF, f);
  // on gonfle la dernière journée : elle est « en formation » pour ses propres bougies
  const modifie = { ...DF, h: [...DF.h], l: [...DF.l], c: [...DF.c] };
  const dernierJour = Math.floor(DF.t[DF.n - 1] / 86400000) * 86400000;
  let premier = DF.n;
  for (let i = 0; i < DF.n; i++) if (DF.t[i] >= dernierJour) { premier = i; break; }
  for (let i = premier; i < DF.n; i++) { modifie.h[i] *= 1.5; modifie.c[i] *= 1.5; }
  M.memActiver(false);
  const apres = M.tendanceMtf(modifie, f);
  M.memActiver(true);
  for (let i = 0; i < DF.n; i++) {
    assert.equal(apres[i], avant[i], `le filtre D1 change en ${i} alors que seule la journée en cours a bougé`);
  }
});

test("invariant 4 — chaque filtre rend un tableau de booléens de la longueur de la série", () => {
  const filtres = [
    { type: "tendance_mtf", ut: "D1", ligne: "mediane", periode: 9 },
    { type: "horaire", debut: "08:00", fin: "18:00" },
    { type: "rsi", ut: "H1", periode: 14, seuil: 50, sens: "au_dessus" },
    { type: "adx", ut: "H1", periode: 14, seuil: 20, sens: "au_dessus" },
    { type: "nuage", ut: "D1", sens: "au_dessus" },
    { type: "pente", ut: "H4", ligne: "mediane", periode: 9, recul: 3, sens: "hausse" },
    { type: "pivot", ut: "D1", sens: "au_dessus" },
    { type: "sous_resistance", ut: "D1", lookback: 20, marge_pct: 1 },
    { type: "zone_resistance", ut: "D1", touches: 3, tolerance_pct: 0.5, marge_pct: 1, ecart: 3, memoire: 250 },
  ];
  const par = {
    tendance_mtf: M.tendanceMtf, horaire: M.filtreHoraire, rsi: M.filtreRsi, adx: M.filtreAdx,
    nuage: M.filtreNuage, pente: M.filtrePente, pivot: M.filtrePivot,
    sous_resistance: M.filtreSousResistance, zone_resistance: M.filtreZoneResistance,
  };
  for (const f of filtres) {
    const s = par[f.type](DF, f);
    assert.equal(s.length, DF.n, `${f.type} : longueur ${s.length} ≠ ${DF.n}`);
    assert.ok(s.every((x) => x === true || x === false), `${f.type} rend autre chose que des booléens`);
  }
});

test("invariant 5 — le signal de la clôture N ouvre à l'ouverture de N+1, jamais à sa clôture", () => {
  const base = M.resampler(DF, "D1");
  const cfg = construireConfig(CFG);
  const trades = M.backtester(base, cfg);
  assert.ok(trades.length > 20, "trop peu de trades pour conclure");
  const idx = new Map(base.t.map((t, i) => [t, i]));
  for (const tr of trades) {
    const i = idx.get(tr.entree_t);
    // l'entrée porte l'ouverture de sa bougie (au spread près), jamais la clôture
    assert.ok(tr.entree >= base.o[i] - 1e-9, `entrée ${tr.entree} sous l'ouverture ${base.o[i]}`);
    assert.ok(tr.entree <= base.o[i] * 1.01, `entrée ${tr.entree} trop loin de l'ouverture ${base.o[i]}`);
  }
});

test("invariant 5 bis — modifier la bougie d'entrée ne change pas la décision d'entrer", () => {
  const base = M.resampler(DF, "D1");
  const sig = M.signalDe(base, construireConfig(CFG));
  const k = sig.findIndex((x, i) => x && i > 200);
  assert.ok(k > 0, "aucun signal trouvé");
  // on retourne complètement la bougie d'entrée : le signal, lu sur la précédente, tient
  const modifie = { ...base, o: [...base.o], h: [...base.h], l: [...base.l], c: [...base.c] };
  modifie.c[k] = base.o[k] * 0.9;
  modifie.l[k] = base.o[k] * 0.85;
  M.memActiver(false);
  const sig2 = M.signalDe(modifie, construireConfig(CFG));
  M.memActiver(true);
  assert.equal(sig2[k], sig[k], "le signal d'entrée dépend de la bougie sur laquelle on entre");
});

test("le spread est payé DANS le prix d'entrée, et une seule fois", () => {
  const base = M.resampler(DF, "D1");
  const sansFrais = M.backtester(base, construireConfig(CFG));
  const avecSpread = M.backtester(base, construireConfig({ ...CFG, spread: 0.1 }));
  const i = new Map(sansFrais.map((t) => [t.entree_t, t]));
  let vus = 0;
  for (const t of avecSpread) {
    const s = i.get(t.entree_t);
    if (!s) continue;
    vus++;
    // entrée relevée de 0,1 %, et le stop suit — il n'est pas resté à sa place
    assert.ok(Math.abs(t.entree / s.entree - 1.001) < 1e-6, `entrée ${t.entree} vs ${s.entree}`);
    assert.ok(Math.abs(t.sl_initial / s.sl_initial - 1.001) < 1e-6, "le stop n'a pas suivi le prix d'entrée");
    // et le R n'est pas amputé une seconde fois après coup
    assert.equal(t.R_net, t.R, "le spread est déduit du R alors qu'il est déjà dans le prix");
  }
  assert.ok(vus > 10, "trop peu de trades comparables");
});

test("backtesterSuivi — le signal reste sur la bougie de décision, le suivi passe en H1", () => {
  const cfg = construireConfig({ ...CFG, paliers: [[25, 0], [50, 25], [75, 50]] });
  const base = M.resampler(DF, "D1");
  const d1 = M.backtester(base, cfg);
  const h1 = M.backtesterSuivi(DF, cfg, "D1");

  // même règle : chaque entrée H1 tombe le jour d'une entrée D1 possible
  const joursD1 = new Set(base.t.filter((_, k) => M.signalDe(base, cfg)[k]).map((t) => t));
  for (const tr of h1) {
    const j = Math.floor(tr.entree_t / 86400000) * 86400000;
    assert.ok(joursD1.has(j), `entrée H1 le ${new Date(tr.entree_t).toISOString()} sans signal D1 ce jour-là`);
  }
  // l'entrée tombe sur la PREMIÈRE bougie H1 de la journée : l'ouverture qui suit la clôture du signal
  for (const tr of h1) {
    const j = Math.floor(tr.entree_t / 86400000) * 86400000;
    let premiere = Infinity;
    for (let i = 0; i < DF.n; i++) if (Math.floor(DF.t[i] / 86400000) * 86400000 === j) { premiere = DF.t[i]; break; }
    assert.equal(tr.entree_t, premiere, "l'entrée n'est pas sur la première bougie H1 du jour");
  }
  // le suivi plus fin réduit la part indécidable
  const ambD1 = M.resume(d1).ambigus / d1.length;
  const ambH1 = M.resume(h1).ambigus / h1.length;
  assert.ok(ambH1 <= ambD1, `le suivi H1 laisse plus de bougies ambiguës (${ambH1}) que le D1 (${ambD1})`);
});

test("backtesterSuivi — en H1 il ne change rien", () => {
  const cfg = construireConfig(CFG);
  const a = M.backtester(DF, cfg);
  const b = M.backtesterSuivi(DF, cfg, "H1");
  assert.equal(b.length, a.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(b[i].entree_t, a[i].entree_t);
    assert.equal(b[i].R, a[i].R);
  }
});
