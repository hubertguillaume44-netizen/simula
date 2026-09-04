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
  // l'entrée tombe sur la première bougie H1 EXÉCUTABLE de la journée : l'ouverture qui
  // suit la clôture du signal, sauf quand le robot refuserait l'ordre (début de semaine)
  const executable = (ms) => {
    const d = new Date(ms);
    return d.getUTCDay() !== 0 && !(d.getUTCDay() === 1 && d.getUTCHours() < 2);
  };
  for (const tr of h1) {
    const j = Math.floor(tr.entree_t / 86400000) * 86400000;
    let premiere = Infinity;
    for (let i = 0; i < DF.n; i++) {
      if (Math.floor(DF.t[i] / 86400000) * 86400000 !== j) continue;
      if (!executable(DF.t[i])) continue;
      premiere = DF.t[i];
      break;
    }
    assert.equal(tr.entree_t, premiere, "l'entrée n'est pas sur la première bougie H1 exécutable du jour");
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

test("règle de début de semaine — aucune entrée le dimanche ni le lundi avant 02:00", () => {
  const cfg = construireConfig({ ...CFG, paliers: [[25, 0], [50, 25], [75, 50]] });
  const avec = M.backtesterSuivi(DF, cfg, "D1");
  assert.ok(avec.length > 20, "trop peu de trades");
  for (const tr of avec) {
    const d = new Date(tr.entree_t);
    assert.notEqual(d.getUTCDay(), 0, `entrée un dimanche : ${d.toISOString()}`);
    if (d.getUTCDay() === 1) {
      assert.ok(d.getUTCHours() >= 2, `entrée un lundi à ${d.getUTCHours()} h : le robot refuserait l'ordre`);
    }
  }
  // la règle décale l'entrée, elle ne supprime pas le signal
  const sans = M.backtesterSuivi(DF, { ...cfg, pas_debut_semaine: false }, "D1");
  const lundis = sans.filter((t) => new Date(t.entree_t).getUTCDay() === 1).length;
  assert.ok(lundis > 0, "le gabarit ne contient aucun signal du lundi : test sans portée");
  assert.equal(avec.length, sans.length, "la règle a perdu des trades au lieu de les décaler");
});

test("les paliers ne s'arment plus depuis le haut d'une bougie qu'on teste ensuite par le bas", () => {
  const cfg = construireConfig({ ...CFG, paliers: [[25, 0], [50, 25], [75, 50]] });
  const base = M.resampler(DF, "D1");
  // en suivi D1 le pis-aller reste actif : c'est la seule façon d'y voir des points morts
  const avecArmement = M.resume(M.backtester(base, cfg));
  const sansArmement = M.resume(M.backtester(base, { ...cfg, sortie: { ...cfg.sortie, armer_avant: false } }));
  assert.ok(
    sansArmement.be <= avecArmement.be,
    `sans pré-armement il y a PLUS de points morts (${sansArmement.be} vs ${avecArmement.be})`,
  );
  // et le suivi H1 tourne bien sans le pis-aller
  const h1 = M.resume(M.backtesterSuivi(DF, cfg, "D1"));
  assert.ok(h1.n > 0);
});

test("une bougie qui arme un palier ET le touche est comptée ambiguë", () => {
  // Une bougie peut monter assez pour armer un palier PUIS redescendre le toucher : la
  // H1 ne dit pas dans quel ordre. Le moteur ne le voyait pas — il testait la sortie avec
  // l'ANCIEN stop, encaissait l'objectif, et n'armait qu'ensuite. Mesuré sur BITCOIN le
  // 23 avril 2025 : haut 94 036 (objectif 92 920 atteint) et bas 90 954 (point mort
  // 91 098 touché) dans la même heure. Le moteur inscrivait +2,00 R, le testeur 0,00 R.
  const t = [], o = [], h = [], l = [], c = [];
  const poser = (i, O, H, L, C) => { t[i] = Date.UTC(2021, 0, 4) + i * 3600000;
    o[i] = O; h[i] = H; l[i] = L; c[i] = C; };
  // bougies plates, puis un croisement, puis la bougie ambiguë. Le signal est décalé
  // d'une bougie (invariant 5) : croisement clôturé en 39, entrée à l'ouverture de 40.
  for (let i = 0; i < 42; i++) poser(i, 100, 100.1, 99.9, 100);
  poser(39, 100, 103, 99.9, 103);          // croisement à la hausse
  // bougie d'entrée : ouvre à 103, monte à 112 (objectif atteint), redescend à 102,9
  poser(40, 103, 112, 102.9, 104);
  poser(41, 104, 104.1, 103.9, 104);
  const df = { n: 42, t, o, h, l, c, sp: t.map(() => 0), grain: { decimales: 2 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 1, rr: 3, paliers: [[25, 0]] });
  const tr = M.backtester(df, { ...cfg, sortie: { ...cfg.sortie, armer_avant: false } });
  const bougie = tr.find((x) => x.entree_t === t[40]);
  assert.ok(bougie, "aucun trade sur la bougie visée : gabarit sans portée");
  assert.equal(bougie.ambigu, true,
    "la bougie arme le palier ET le touche, et n'est pas comptée ambiguë");

  // en lecture BASSE le stop testé est celui que la bougie a armé : on tranche contre soi
  const basse = M.backtester(df, { ...cfg, sortie: { ...cfg.sortie, armer_avant: false, prudent: true } });
  const b2 = basse.find((x) => x.entree_t === t[40]);
  assert.ok(b2.R < bougie.R,
    `la lecture basse doit rendre moins que la haute (${b2.R} vs ${bougie.R})`);
  assert.ok(b2.motif.startsWith("be"), `sortie au palier attendue, obtenu « ${b2.motif} »`);
});

test("un stop plus court que le minimum du courtier ne donne pas de trade", () => {
  // Le minimum est une distance de PRIX (StopsLevel × Point), pas un pourcentage. Sur
  // BITCOIN il vaut 200,00 : 0,25 % à 81 000, mais 1,00 % à 20 000. Un stop de 1 % était
  // donc pile à la limite pendant tout 2022 — le testeur a refusé 928 ordres « invalid
  // stops » sur 2022-2023 et aucun ensuite, quand le moteur les comptait tous.
  const n = 24 * 300;
  const t = [], o = [], h = [], l = [], c = [];
  let px = 1000, a = 777;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.01;
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.002); l.push(Math.min(ouv, px) * 0.998);
  }
  const df = { n, t, o, h, l, c, v: t.map(() => 100), sp: t.map(() => 0), grain: { decimales: 2 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 1, rr: 2, paliers: [] });
  const sans = M.backtesterSuivi(df, cfg, "D1");
  assert.ok(sans.length > 10, "gabarit sans trades : test sans portée");
  // le cours tourne autour de 1000, donc un stop de 1 % vaut environ 10 : un minimum de
  // 20 doit tout refuser, un minimum de 1 ne doit rien changer
  assert.equal(M.backtesterSuivi(df, { ...cfg, stop_mini: 20 }, "D1").length, 0,
    "un minimum au-dessus de tous les stops laisse encore passer des trades");
  assert.equal(M.backtesterSuivi(df, { ...cfg, stop_mini: 1 }, "D1").length, sans.length,
    "un minimum sous tous les stops a supprimé des trades");

  // la distance est mesurée depuis le cours SANS le spread : le courtier compare au bid
  const avecSpread = { ...df, sp: t.map(() => 500) };   // 5 points de spread
  const q = M.nettoyer(avecSpread);
  const ref = M.backtesterSuivi(q, cfg, "D1");
  const borne = M.backtesterSuivi(q, { ...cfg, stop_mini: 1 }, "D1");
  assert.equal(borne.length, ref.length,
    "le spread a été compté dans la distance : le minimum mordrait trop tôt");
});

test("un signal empêché par la position en cours est repris plus tard dans la journée, une seule fois", () => {
  // Le robot garde le seau en attente et réessaie à CHAQUE bougie H1 du même jour tant
  // que l'ordre ne passe pas — y compris quand ce qui l'empêche est sa propre position
  // encore ouverte. Le moteur ne marquait qu'une bougie par journée : si sa position se
  // fermait après elle, la journée était perdue. Mesuré sur le journal GOLD du
  // 4 septembre 2026 : 1 393 des 3 167 tentatives du robot sont refusées pour « position
  // déjà ouverte » puis reprises plus tard le même jour, et le moteur en perdait 79 —
  // 462 trades contre 538. Après reprise : 529 contre 538.
  //
  // Le pendant est tout aussi nécessaire : UNE entrée par signal. Marquer toutes les
  // bougies sans ce garde-fou faisait rentrer le moteur à chaque sortie, 1 130 trades.
  const n = 24 * 300;
  const t = [], o = [], h = [], l = [], c = [], sp = [];
  let px = 100, a = 20260904;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.01;
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.002); l.push(Math.min(ouv, px) * 0.998);
    sp.push(10);
  }
  const df = { n, t, o, h, l, c, sp, grain: { decimales: 4 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 1, rr: 3, paliers: [] });
  const trades = M.backtesterSuivi(df, cfg, "D1");
  assert.ok(trades.length > 20, "gabarit sans trades : le test ne prouve rien");

  const jour = (ms) => Math.floor(ms / 86400000);
  // jamais deux entrées le même jour : un signal ne se joue qu'une fois
  const jours = trades.map((x) => jour(x.entree_t));
  assert.equal(new Set(jours).size, jours.length,
    "deux entrées la même journée : le signal a été rejoué après une sortie");
  // et jamais d'entrée sur la bougie même d'une sortie précédente
  const sorties = new Set(trades.map((x) => x.sortie_t));
  for (const x of trades) {
    assert.ok(!sorties.has(x.entree_t),
      "entrée sur la bougie même d'une sortie : la reprise doit suivre d'une bougie");
  }
  // au moins une entrée qui n'est PAS la première bougie exécutable du jour : sinon
  // la reprise n'est pas exercée et le test ne couvre rien
  const reprises = trades.filter((x) => new Date(x.entree_t).getUTCHours() > 1);
  assert.ok(reprises.length > 0, "aucune reprise en cours de journée : règle non exercée");
});

test("les nuits de portage suivent le calendrier du courtier, mesuré et non supposé", () => {
  const j = (a, m, d, h) => Date.UTC(2026, m - 1, d, h);
  // mardi 10:00 → mercredi 08:00 : un seul minuit, ordinaire
  assert.equal(M.nuitsPortage(j(0, 9, 1, 10), j(0, 9, 2, 8)), 1);
  // mercredi 10:00 → jeudi 08:00 : le minuit du JEUDI porte trois nuits. Mesuré sur les
  // trades GOLD ne franchissant qu'un minuit : facteur 2,73 au jeudi contre 0,88 à 0,92
  // les autres jours, stable de 2020 à 2025.
  assert.equal(M.nuitsPortage(j(0, 9, 2, 10), j(0, 9, 3, 8)), 3);
  // vendredi 10:00 → lundi 08:00 : samedi et dimanche ne sont pas facturés, seul le
  // minuit du lundi compte. Les compter multipliait le coût par trois sur ces positions
  // — c'est ce qui faisait passer l'étalement du rapport mesuré/prédit de ×1,14 à ×3,14.
  assert.equal(M.nuitsPortage(j(0, 9, 4, 10), j(0, 9, 7, 8)), 1);
  // une position fermée le jour même ne paie rien
  assert.equal(M.nuitsPortage(j(0, 9, 1, 2), j(0, 9, 1, 22)), 0);
});

test("le swap se compte par lot et par nuit, pas en pourcentage annuel du notionnel", () => {
  // Le courtier facture un MONTANT par lot et par nuit (SYMBOL_SWAP_LONG). Mesuré sur
  // les 174 trades GOLD portant au moins une nuit, journal du 4 septembre 2026 : le coût
  // par lot et par nuit reste à -60 de 2020 à 2026 pendant que l'once passe de 1 800 à
  // 4 675, tandis que le taux annuel équivalent s'effondre de 11,8 % à 4,5 %. Le modèle
  // en pourcentage se trompait donc d'un facteur 2,5 sur la durée de la mesure.
  //
  //   swap_R = |swap par lot| × nuits / (taille du contrat × |entrée − stop|)
  //
  // Rapport mesuré / prédit sur GOLD : 1,0000 (p10 0,9965, p90 1,0038) sur 129 trades.
  const n = 24 * 200;
  const t = [], o = [], h = [], l = [], c = [];
  let px = 1800, a = 20260905;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 4) + i * 3600000);
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.006;
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.0008); l.push(Math.min(ouv, px) * 0.9992);
  }
  const df = { n, t, o, h, l, c, grain: { decimales: 2 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 0.6, rr: 3, paliers: [] });
  const frais = { contrat: 100, swap_long: -67.9, swap_short: 27.0 };
  const tr = M.backtesterSuivi(df, { ...cfg, frais }, "D1");
  assert.ok(tr.length > 0, "gabarit sans trades : le test ne prouve rien");
  for (const x of tr) {
    const nuits = M.nuitsPortage(x.entree_t, x.sortie_t);
    const attendu = x.R - 67.9 * nuits / (100 * Math.abs(x.entree - x.sl_initial));
    assert.ok(Math.abs(x.R_net - attendu) < 1e-9,
      `swap mal compté : R_net ${x.R_net} au lieu de ${attendu}`);
  }
  // le même trade, deux fois plus cher à porter, coûte deux fois plus
  const cher = M.backtesterSuivi(df, { ...cfg, frais: { ...frais, swap_long: -135.8 } }, "D1");
  const dette = (a) => a.reduce((s, x) => s + (x.R - x.R_net), 0);
  assert.ok(Math.abs(dette(cher) - 2 * dette(tr)) < 1e-9, "le coût n'est pas proportionnel au taux");

  // et le taux annuel ne s'applique QUE faute de montant par lot (modes 5 et 6 de MT5)
  const annuel = M.backtesterSuivi(df, { ...cfg, frais: { swap_annuel_pct: -30 } }, "D1");
  assert.ok(dette(annuel) > 0, "le repli en pourcentage annuel ne facture plus rien");

  // La commission est un tarif ALLER-RETOUR par lot, pas un pourcentage du notionnel.
  // Mesuré sur le journal GOLD du 5 septembre 2026, qui somme les deux jambes de la
  // position : ajustement R² 0,93 par lot contre -1,63 en pourcentage du notionnel,
  // c'est-à-dire pire que la moyenne. Converti par le cours implicite lu sur le swap,
  // le tarif est constant sur sept ans : 6,94 · 6,95 · 6,91 · 7,01 · 7,00 · 6,85 · 6,98.
  const avecComm = M.backtesterSuivi(df, { ...cfg, frais: { contrat: 100, commission_par_lot: 6.95 } }, "D1");
  for (const x of avecComm) {
    const attendu = x.R - 6.95 / (100 * Math.abs(x.entree - x.sl_initial));
    assert.ok(Math.abs(x.R_net - attendu) < 1e-9,
      `commission mal comptée : R_net ${x.R_net} au lieu de ${attendu}`);
  }
});
