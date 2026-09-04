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
 * `stopMini` est la distance minimale de stop du courtier, en unités de PRIX
 * (StopsLevel × Point), relevée par Export_Symboles_Sivula.mq5. Elle ne mord que sur
 * BITCOIN — 200,00, soit 1,00 % du cours de 2022 contre 0,25 % de celui d'aujourd'hui.
 * Le testeur y a refusé 928 ordres « invalid stops » sur 2022-2023 et aucun ensuite ;
 * en la respectant, le moteur passe de 420 à 352 trades contre 355 au testeur, et de
 * 66 trades en trop à zéro. Ailleurs elle vaut 20,00 ou moins, très en dessous des
 * stops mesurés, et ne change rien.
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

// `portage` : taille du contrat et MONTANT de swap par lot et par nuit, relevés dans
// Symboles_Sivula.csv (FxPro, 3 septembre 2026). Les paires forex y sont déclarées en
// POINTS (SwapMode 1) et converties ici — points × Point × ContractSize — ce qui donne
// 1 pour 1 sur une paire à cinq décimales et 100 000 de contrat. Les métaux et indices
// sont déclarés en montant (SwapMode 2) et repris tels quels. BITCOIN est en intérêt
// annuel (SwapMode 5) : le taux reste le modèle, faute de montant.
//
// `commission_par_lot` : le tarif ALLER-RETOUR par lot, dans la devise du symbole.
// Mesuré sur le journal GOLD du 5 septembre 2026, qui somme les frais sur les DEUX
// jambes de la position : 6,95 par lot. La preuve qu'il s'agit bien d'un tarif par lot
// et non d'un pourcentage du notionnel tient dans l'ajustement — R² 0,93 par lot contre
// -1,63 en pourcentage, c'est-à-dire pire que la moyenne.
//
// Le montant relevé est dans la devise du COMPTE (EUR) ; converti par le cours implicite
// que donne le swap, il devient constant sur sept ans : 6,94 · 6,95 · 6,91 · 7,01 · 7,00
// · 6,85 · 6,98 de 2020 à 2026. Et ce cours implicite reproduit l'EUR/USD réel — 0,848
// en 2021 (1,18), 0,951 en 2022 (1,05), 0,922 en 2023 (1,08). Deux grandeurs
// indépendantes, une seule histoire de devise : c'est ce qui valide le modèle.
//
// Le signe est celui du courtier : un swap positif est un CRÉDIT réel — GOLD paie
// -67,90 à l'achat et crédite +27,00 à la vente. Le modèle validé sur le journal GOLD
// du 4 septembre 2026 rend 1,0000 fois le portage facturé (p10 0,9965, p90 1,0038).
export const REFERENCES = [
  {
    sym: "AUDCAD",
    portage: { contrat: 100000, swap_long: 0.30, swap_short: -7.35 },
    entree: "croisement_prix",
    ligne: "mediane",
    periode: 15,
    sl: 0.5,
    rr: 2,
    filtres: [{ type: "pente", ut: "D1", ligne: "ma", periode: 5, recul: 20, sens: "hausse" }],
    stopMini: 0,
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
    portage: { contrat: 100, swap_long: -67.90, swap_short: 27.00, commission_par_lot: 6.95 },
    variante: "ema_5_SL0p6_RR3",
    entree: "croisement_ou_rebond",
    ligne: "ema",
    periode: 5,
    sl: 0.6,
    rr: 3,
    filtres: [{ type: "tendance_mtf", ut: "D1", ligne: "mediane", periode: 5 }],
    stopMini: 0,
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
    portage: { contrat: 100, swap_long: -67.90, swap_short: 27.00, commission_par_lot: 6.95 },
    variante: "ma_7_SL0p5_RR1p5",
    entree: "croisement_ou_rebond",
    ligne: "ma",
    periode: 7,
    sl: 0.5,
    rr: 1.5,
    filtres: [],
    stopMini: 0,
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
    portage: { contrat: 1, swap_long: -3.5057, swap_short: -0.2504 },
    entree: "croisement_ou_rebond",
    ligne: "ema",
    periode: 26,
    sl: 1,
    rr: 1.5,
    filtres: [{ type: "pente", ut: "D1", ligne: "ma", periode: 5, recul: 8, sens: "hausse" }],
    stopMini: 1.0,
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
    portage: { contrat: 1, swap_long: -6.5306, swap_short: -3.0551 },
    entree: "croisement_prix",
    ligne: "mediane",
    periode: 10,
    sl: 2,
    rr: 1.5,
    filtres: [{ type: "pente", ut: "D1", ligne: "ema", periode: 5, recul: 3, sens: "hausse" }],
    stopMini: 0.1,
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
    portage: { contrat: 100000, swap_long: -2.58, swap_short: -5.56 },
    entree: "croisement_prix",
    ligne: "ema",
    periode: 26,
    sl: 0.7,
    rr: 2,
    filtres: [{ type: "pente", ut: "D1", ligne: "mediane", periode: 5, recul: 15, sens: "hausse" }],
    stopMini: 0,
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
    portage: { contrat: 1, swap_annuel_pct: -30 },
    entree: "croisement_ou_rebond",
    ligne: "mediane",
    periode: 5,
    sl: 1,
    rr: 2,
    filtres: [],
    stopMini: 200.0,
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
    portage: { contrat: 1, swap_long: -3.3590, swap_short: -0.4306 },
    entree: "croisement_prix",
    ligne: "mediane",
    periode: 6,
    sl: 0.8,
    rr: 1.5,
    filtres: [{ type: "pente", ut: "D1", ligne: "ema", periode: 5, recul: 20, sens: "hausse" }],
    stopMini: 20.0,
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
