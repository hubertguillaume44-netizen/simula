/**
 * Comparaison trade à trade entre la liste produite par le moteur Simula
 * et celle lue dans un rapport du testeur MT5.
 *
 * Trois volets indépendants, volontairement séparés :
 *   1. ENTRÉES  — qui déclenche quand, au même prix ?
 *   2. SORTIES  — sur les entrées communes, on sort quand, où, pour quel motif ?
 *   3. FRAIS    — ce que Simula modélise contre ce que MT5 facture réellement.
 *
 * Aucun réglage du moteur n'est modifié ici : le module lit, aligne et chiffre.
 */

const MIN = 60000;

const somme = (xs) => xs.reduce((a, b) => a + b, 0);
const moyenne = (xs) => (xs.length ? somme(xs) / xs.length : NaN);

export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const v = [...xs].sort((a, b) => a - b);
  const i = (v.length - 1) * q;
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo);
}

export function stats(xs) {
  const v = xs.filter(Number.isFinite);
  return {
    n: v.length,
    med: quantile(v, 0.5),
    moy: moyenne(v),
    p10: quantile(v, 0.1),
    p90: quantile(v, 0.9),
    min: v.length ? Math.min(...v) : NaN,
    max: v.length ? Math.max(...v) : NaN,
  };
}

/**
 * Décalage horaire le plus probable entre les deux séries d'entrées.
 * On histogramme tous les écarts à la minute près et on garde les modes.
 * Sert à distinguer « heure serveur différente » de « signal différent ».
 */
export function decalages(sim, mt5, fenetreH = 26) {
  const seau = new Map();
  const fenetre = fenetreH * 3600000;
  for (const a of sim) {
    for (const b of mt5) {
      const d = b.entree_t - a.entree_t;
      if (Math.abs(d) > fenetre) continue;
      const k = Math.round(d / MIN);
      seau.set(k, (seau.get(k) || 0) + 1);
    }
  }
  return [...seau.entries()]
    .map(([minutes, n]) => ({ minutes, ms: minutes * MIN, n }))
    .sort((a, b) => b.n - a.n || Math.abs(a.minutes) - Math.abs(b.minutes))
    .slice(0, 8);
}

/** Appariement glouton par proximité d'heure d'entrée, après application du décalage. */
export function apparier(sim, mt5, decalageMs, toleranceMs) {
  const pris = new Array(mt5.length).fill(false);
  const paires = [];
  const simSeule = [];
  for (const a of sim) {
    const cible = a.entree_t + decalageMs;
    let best = -1,
      bestD = Infinity;
    for (let j = 0; j < mt5.length; j++) {
      if (pris[j]) continue;
      const d = Math.abs(mt5[j].entree_t - cible);
      if (d <= toleranceMs && d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) {
      simSeule.push(a);
      continue;
    }
    pris[best] = true;
    paires.push({ sim: a, mt5: mt5[best], ecartEntreeMs: mt5[best].entree_t - cible });
  }
  const mt5Seule = mt5.filter((_, j) => !pris[j]);
  paires.sort((x, y) => x.sim.entree_t - y.sim.entree_t);
  return { paires, simSeule, mt5Seule };
}

/** Motif Simula ramené au vocabulaire MT5 (be/be2 sont des sorties au stop déplacé). */
export function motifSimula(t) {
  if (t.motif === "tp") return "tp";
  if (t.motif === "be" || t.motif === "be2") return "be";
  if (t.motif === "sl_gap") return "sl_gap";
  return t.motif;
}

/**
 * €/R : facteur d'échelle entre le R de Simula et l'euro de MT5.
 * On l'estime sur le P&L de prix seul (colonne « Profit »), commission et swap exclus :
 * sinon les frais se retrouveraient dans le facteur de conversion au lieu du poste frais.
 */
export function euroParR(paires, { impose, capital, risquePct }) {
  const nominal = (capital * risquePct) / 100;
  // a) valeur monétaire d'un stop plein encaissé côté MT5
  const stops = paires
    .filter((p) => Math.abs(rNet(p.sim) + 1) < 0.05 && p.mt5.profit < 0)
    .map((p) => Math.abs(p.mt5.profit));
  const parStop = stops.length >= 3 ? quantile(stops, 0.5) : NaN;
  // b) pente d'une régression sans constante du profit MT5 sur le R net Simula
  const den = somme(paires.map((p) => rNet(p.sim) ** 2));
  const pente = den > 0 ? somme(paires.map((p) => rNet(p.sim) * p.mt5.profit)) / den : NaN;
  // c) la même sur le net (frais compris) : l'écart avec b) chiffre la traînée des frais
  const penteNet = den > 0 ? somme(paires.map((p) => rNet(p.sim) * p.mt5.net)) / den : NaN;
  const retenu = Number.isFinite(impose)
    ? impose
    : Number.isFinite(parStop)
      ? parStop
      : Number.isFinite(pente) && pente > 0
        ? pente
        : nominal;
  const source = Number.isFinite(impose)
    ? "imposé (--eur-par-r)"
    : Number.isFinite(parStop)
      ? `médiane du profit des stops pleins MT5 (${stops.length} trades)`
      : Number.isFinite(pente) && pente > 0
        ? "régression profit € / R net"
        : "capital × risque des réglages Simula";
  return { retenu, source, parStop, pente, penteNet, nominal, nStops: stops.length };
}

export const rNet = (t) => (t.R_net !== undefined ? t.R_net : t.R);

/** Coût modélisé par Simula, recalculé avec la formule exacte du moteur (moteur.ts). */
export function coutSimula(t, frais) {
  const slP = ((t.entree - t.sl_initial) / t.entree) * 100;
  const spread = (frais.spread_pct || 0) / slP;
  const comm = ((frais.commission_pct || 0) * 2) / slP;
  const nuits = (t.sortie_t - t.entree_t) / 86400000;
  const swap = -((frais.swap_annuel_pct || 0) / 360) * (nuits / slP);
  return { spread, comm, swap, total: spread + comm + swap, slP, nuits };
}

export function comparer(sim, mt5, opts) {
  const { toleranceMs, capital, risquePct, frais, eurImpose } = opts;
  const modes = decalages(sim, mt5);
  const decalageMs = Number.isFinite(opts.decalageMs) ? opts.decalageMs : (modes[0]?.ms ?? 0);
  const { paires, simSeule, mt5Seule } = apparier(sim, mt5, decalageMs, toleranceMs);

  // ---- 1. ENTRÉES ----
  const ecartsPrix = paires.map((p) => p.mt5.entree - p.sim.entree);
  const ecartsPrixR = paires.map(
    (p) => (p.mt5.entree - p.sim.entree) / (p.sim.entree - p.sim.sl_initial),
  );
  const ecartsPrixPct = paires.map((p) => ((p.mt5.entree - p.sim.entree) / p.sim.entree) * 100);
  const entrees = {
    nSim: sim.length,
    nMt5: mt5.length,
    apparies: paires.length,
    simSeule,
    mt5Seule,
    decalageMs,
    decalageAuto: !Number.isFinite(opts.decalageMs),
    modes,
    ecartHeure: stats(paires.map((p) => p.ecartEntreeMs / MIN)),
    ecartPrix: stats(ecartsPrix),
    ecartPrixPct: stats(ecartsPrixPct),
    ecartPrixR: stats(ecartsPrixR),
  };

  // ---- 2. SORTIES (sur les seules entrées communes) ----
  const matrice = new Map();
  for (const p of paires) {
    const k = `${motifSimula(p.sim)} → ${p.mt5.motif || "?"}`;
    matrice.set(k, (matrice.get(k) || 0) + 1);
  }
  const memeMotif = paires.filter((p) => motifSimula(p.sim) === p.mt5.motif);
  const signeOppose = paires.filter(
    (p) => Math.sign(rNet(p.sim)) !== 0 && Math.sign(rNet(p.sim)) !== Math.sign(p.mt5.net),
  );
  const sorties = {
    ecartHeure: stats(paires.map((p) => (p.mt5.sortie_t - (p.sim.sortie_t + decalageMs)) / MIN)),
    memeHeure: paires.filter(
      (p) => Math.abs(p.mt5.sortie_t - (p.sim.sortie_t + decalageMs)) <= toleranceMs,
    ).length,
    ecartPrix: stats(paires.map((p) => p.mt5.sortie - p.sim.sortie)),
    ecartPrixR: stats(
      paires.map((p) => (p.mt5.sortie - p.sim.sortie) / (p.sim.entree - p.sim.sl_initial)),
    ),
    matrice: [...matrice.entries()].sort((a, b) => b[1] - a[1]),
    memeMotif: memeMotif.length,
    signeOppose,
    dureeSim: stats(paires.map((p) => (p.sim.sortie_t - p.sim.entree_t) / 3600000)),
    dureeMt5: stats(paires.map((p) => (p.mt5.sortie_t - p.mt5.entree_t) / 3600000)),
  };

  // ---- 3. FRAIS ----
  const eur = euroParR(paires, { impose: eurImpose, capital, risquePct });
  const k = eur.retenu;
  const coutsSim = paires.map((p) => coutSimula(p.sim, frais));
  const fraisBloc = {
    eur,
    simSpreadR: stats(coutsSim.map((c) => c.spread)),
    simSwapR: stats(coutsSim.map((c) => c.swap)),
    simCommR: stats(coutsSim.map((c) => c.comm)),
    simCoutTotalR: somme(coutsSim.map((c) => c.total)),
    mt5Commission: somme(mt5.map((t) => t.commission)),
    mt5Swap: somme(mt5.map((t) => t.swap)),
    mt5Profit: somme(mt5.map((t) => t.profit)),
    mt5Net: somme(mt5.map((t) => t.net)),
    // Le prix d'entrée MT5 est à l'ask : l'écart avec l'open du CSV est le spread payé.
    spreadImpliqueR: stats(ecartsPrixR),
    spreadImpliquePrix: stats(ecartsPrix),
    // Le swap MT5 rapporté à l'échelle R, pour être comparable au modèle Simula.
    mt5SwapR: stats(paires.map((p) => -p.mt5.swap / k)),
    mt5CommissionR: stats(paires.map((p) => -p.mt5.commission / k)),
  };

  // ---- Décomposition de l'écart en euros ----
  const totalSimR = somme(sim.map(rNet));
  const totalSimEur = totalSimR * k;
  const totalMt5Eur = fraisBloc.mt5Net;
  const bucket = {
    simSeule: somme(simSeule.map((t) => rNet(t) * k)),
    mt5Seule: somme(mt5Seule.map((t) => t.net)),
    sortieDifferente: somme(
      paires
        .filter((p) => motifSimula(p.sim) !== p.mt5.motif)
        .map((p) => p.mt5.net - rNet(p.sim) * k),
    ),
    memeSortie: somme(
      paires
        .filter((p) => motifSimula(p.sim) === p.mt5.motif)
        .map((p) => p.mt5.net - rNet(p.sim) * k),
    ),
  };
  // Sur les trades identiques (même entrée, même sortie), l'écart attendu est exactement
  // ce que le courtier prélève : commission + swap + spread payé à l'entrée.
  const memes = paires.filter((p) => motifSimula(p.sim) === p.mt5.motif);
  const fraisAttendus =
    somme(memes.map((p) => p.mt5.commission + p.mt5.swap)) -
    somme(
      memes.map((p) => ((p.mt5.entree - p.sim.entree) / (p.sim.entree - p.sim.sl_initial)) * k),
    );

  const ecart = {
    totalSimR,
    totalSimEur,
    totalMt5Eur,
    total: totalMt5Eur - totalSimEur,
    bucket,
    fraisAttendus,
    inexplique: bucket.memeSortie - fraisAttendus,
    // Contrôle : la somme des postes doit refaire l'écart total.
    controle: bucket.mt5Seule - bucket.simSeule + bucket.sortieDifferente + bucket.memeSortie,
  };

  return { entrees, sorties, frais: fraisBloc, ecart, paires, simSeule, mt5Seule };
}
