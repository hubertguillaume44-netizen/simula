/**
 * Les huit configurations de référence, lues dans l'en-tête des robots .mq5 exportés.
 *
 * Elles ne se devinent pas : le nom du robot ne porte ni le type d'entrée ni les
 * filtres. Trois des huit utilisent « croisement_prix » là où le réglage par défaut
 * est « croisement_ou_rebond », et cinq portent un filtre. Toute comparaison faite
 * sans ces valeurs mesure autre chose que ce que le robot exécute.
 *
 * Le filtre de pente du robot s'écrit `LigneAgr(86400, MODE, 5, 1)` contre
 * `LigneAgr(86400, MODE, 5, 1 + recul)` : unité D1, période 5, et le recul en
 * décalage de bougies. `periode` vient de `periodeMtf`, pas de la période du signal.
 *
 * `nSivula` / `rSivula` sont les chiffres que Sivula affichait AU MOMENT DE L'EXPORT
 * (en-tête « Mesuré »), avant les corrections de suivi H1. Ils servent de repère
 * historique, pas de cible.
 */
export const PALIERS_REFERENCE = [
  [25, 0],
  [50, 25],
  [75, 50],
];

export const REFERENCES = [
  {
    sym: "AUDCAD",
    entree: "croisement_prix",
    ligne: "mediane",
    periode: 15,
    sl: 0.5,
    rr: 2,
    filtres: [{ type: "pente", ut: "D1", ligne: "ma", periode: 5, recul: 20, sens: "hausse" }],
    magic: 20232580382,
    spreadReleve: 0.0753,
    filtresAttendus: "pente D1 recul 20",
    mt5Eur: -2862.73,
    nMt5: 66,
    nSivula: 46,
    rSivula: 14.16,
  },
  {
    sym: "GOLD",
    variante: "ema_5_SL0p6_RR3",
    entree: "croisement_ou_rebond",
    ligne: "ema",
    periode: 5,
    sl: 0.6,
    rr: 3,
    filtres: [{ type: "tendance_mtf", ut: "D1", ligne: "mediane", periode: 5 }],
    magic: 20557409899,
    spreadReleve: 0.0219,
    filtresAttendus: "tendance D1 mediane 5",
    mt5Eur: 4519.12,
    nMt5: 489,
    nSivula: 396,
    rSivula: 124.78,
  },
  {
    sym: "GOLD",
    variante: "ma_7_SL0p5_RR1p5",
    entree: "croisement_ou_rebond",
    ligne: "ma",
    periode: 7,
    sl: 0.5,
    rr: 1.5,
    filtres: [],
    magic: 20254055770,
    spreadReleve: 0.0219,
    filtresAttendus: "aucun",
    mt5Eur: 8315.44,
    nMt5: 434,
    nSivula: 396,
    rSivula: 44.57,
  },
  {
    sym: "Germany40",
    entree: "croisement_ou_rebond",
    ligne: "ema",
    periode: 26,
    sl: 1,
    rr: 1.5,
    filtres: [{ type: "pente", ut: "D1", ligne: "ma", periode: 5, recul: 8, sens: "hausse" }],
    magic: 20441607771,
    spreadReleve: 0.0228,
    filtresAttendus: "pente D1 recul 8",
    mt5Eur: 2496.82,
    nMt5: 115,
    nSivula: 99,
    rSivula: 23.6,
  },
  {
    sym: "Japan225",
    entree: "croisement_prix",
    ligne: "mediane",
    periode: 10,
    sl: 2,
    rr: 1.5,
    filtres: [{ type: "pente", ut: "D1", ligne: "ema", periode: 5, recul: 3, sens: "hausse" }],
    magic: 20562978049,
    spreadReleve: 0.0363,
    filtresAttendus: "pente D1 recul 3",
    mt5Eur: 1389.21,
    nMt5: 89,
    nSivula: 66,
    rSivula: 18.68,
  },
  {
    sym: "NZDCAD",
    entree: "croisement_prix",
    ligne: "ema",
    periode: 26,
    sl: 0.7,
    rr: 2,
    filtres: [{ type: "pente", ut: "D1", ligne: "mediane", periode: 5, recul: 15, sens: "hausse" }],
    magic: 20352539978,
    spreadReleve: 0.1272,
    filtresAttendus: "pente D1 recul 15",
    mt5Eur: -1134.75,
    nMt5: 46,
    nSivula: 44,
    rSivula: 10.58,
  },
  {
    sym: "BITCOIN",
    entree: "croisement_ou_rebond",
    ligne: "mediane",
    periode: 5,
    sl: 1,
    rr: 2,
    filtres: [],
    magic: 20783258791,
    spreadReleve: 0.06,
    filtresAttendus: "aucun",
    mt5Eur: -6776.31,
    nMt5: 466,
    nSivula: 618,
    rSivula: 277.1,
  },
  {
    sym: "HongKong50",
    entree: "croisement_prix",
    ligne: "mediane",
    periode: 6,
    sl: 0.8,
    rr: 1.5,
    filtres: [{ type: "pente", ut: "D1", ligne: "ema", periode: 5, recul: 20, sens: "hausse" }],
    magic: 20345541699,
    spreadReleve: 0.144,
    filtresAttendus: "pente D1 recul 20",
    mt5Eur: 241.48,
    nMt5: 83,
    nSivula: 67,
    rSivula: 16.14,
  },
];

/** Toutes tournent en achat, décision D1, 20 000 € à 1 % de risque — soit 200 € par R. */
export const CADRE = {
  sens: "achat",
  ut: "D1",
  capital: 20000,
  risquePct: 1,
  eurParR: 200,
  debut: Date.UTC(2020, 0, 1),
};
