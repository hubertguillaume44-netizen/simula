export type Timeframe = "H1" | "H4" | "D1";
export type EntreeType =
  | "croisement_ou_rebond"
  | "croisement_prix"
  | "rebond"
  | "croisement_lignes"
  | "cassure";
export type LigneType = "ema" | "ma" | "mediane";
export type SecuType = "aucun" | "be_progressif" | "trailing";
export type DataFrame = {
  t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; n: number;
  ecartees?: number; heuresSession?: number[];
};
export type Trade = {
  entree_t: number; entree: number; sortie_t: number; sortie: number; motif: string;
  sl_initial: number; bougies: number; be_max: number; R: number; R_net?: number;
};
export type Resume = {
  n: number; total: number; winRate: number; pf: number; dd: number; moyenne: number;
  rAn: number; annees: number; tp?: number; sl?: number; be?: number; gap?: number;
};
export type Segments = {
  positifs: number; total: number; detail: Array<number | null>;
  periodes: Array<{ from: number; to: number } | null>;
};
export type CourbePoint = { t: number; eq: number };
export type Frais = { spread_pct: number; swap_annuel_pct: number; commission_pct: number };
export type Filtre =
  | { type: "tendance_mtf"; ut: Timeframe; ligne: LigneType; periode: number }
  | { type: "horaire"; debut: string; fin: string }
  | { type: "rsi"; ut: Timeframe; periode: number; seuil: number; sens: "au_dessus" }
  | { type: "adx"; ut: Timeframe; periode: number; seuil: number; sens: "au_dessus" }
  | { type: "nuage"; ut: Timeframe; sens: "au_dessus" }
  | { type: "pente"; ut: Timeframe; ligne: LigneType; periode: number; recul: number; sens: "hausse" }
  | { type: "pivot"; ut: Timeframe; sens: "au_dessus" }
  | { type: "sous_resistance"; ut: Timeframe; lookback: number; marge_pct: number }
  | { type: "zone_resistance"; ut: Timeframe; touches: number; tolerance_pct: number; marge_pct: number; ecart: number; memoire: number }
  | { type: "delai_bougies"; n: number };
export type Config = {
  entree: { type: EntreeType; ligne: LigneType; periode: number };
  filtres: Filtre[];
  sortie: {
    sl: { type: "pct"; valeur: number };
    tp: { valeur: number };
    securisation:
      | { type: "aucun" }
      | { type: "trailing"; distance_pct: number }
      | { type: "be_progressif"; etapes: Array<[number, number]> };
  };
  frais: Frais;
  debut: number;
};
export type Settings = {
  symbol: string; ut: Timeframe; entree: EntreeType; ligne: LigneType; periode: number;
  sl: number; rr: number; mtf: boolean; utMtf: Timeframe; ligneMtf: LigneType; periodeMtf: number;
  horaire: boolean; hDebut: number; hFin: number; be: boolean; typeSecu: SecuType;
  beSeuil1: number; beNiveau1: number; beSeuil2: number; beNiveau2: number; trailingPct: number;
  frais: boolean; spreadSaisi: number; swapSaisi: number; delai: number;
  fRsi: boolean; utRsi: Timeframe; periodeRsi: number; fRsiSeuil: number;
  fAdx: boolean; utAdx: Timeframe; periodeAdx: number; fAdxSeuil: number;
  fNuage: boolean; utNuage: Timeframe; fPente: boolean; utPente: Timeframe;
  lignePente: LigneType; fPenteRecul: number; fPivot: boolean; utPivot: Timeframe;
  fResist: boolean; utResist: Timeframe; resistLookback: number; resistMarge: number;
  fZone: boolean; utZone: Timeframe; zoneTouches: number; zoneTol: number; zoneMarge: number; zoneMemoire: number;
  capital: number; risquePct: number;
};
export type ScanRow = {
  sym: string; periode: number; sl: number; rr: number; n: number; total: number; rAn: number;
  dd: number; positifs: number; segTotal: number; pf: number; winRate: number; esp: number;
  oos: number; tenue: number; calmar: number; etat: string; ok: number;
};
export type ScanFiche = {
  symboles: string; instruments: number; entree: string; ligne: string; ut: string; grille: string; seuils: string;
};
export type Run =
  | { id: number; type: "backtest"; date: string; settings: Settings; n: number; total: number; rAn: number; winRate: number; pf: number; dd: number; positifs: number | null; segTotal: number | null }
  | { id: number; type: "scan"; date: string; fiche: ScanFiche; testees: number; retenues: number; top: ScanRow[] };
export type Vue = "backtest" | "scan" | "journal";
export type Exemple = {
  kind: "rejete" | "valide"; titre: string;
  settings: Pick<Settings, "symbol" | "periode" | "sl" | "rr">;
  n: number; total: number; dd: number; positifs: number; segTotal: number; ok: number; etat: string;
};
export type Instrument = { id: string; label: string; kind: "demo" | "upload"; hint: string };
export type MesuresSup = {
  brut: number; frais: number; esp: number; calmar: number; oos: number; oosN: number;
  isAn: number; tenue: number; serie: number; coupe: number; annees: number;
};
export type Controle = { nom: string; ok: boolean | null; valeur: string; attendu: string; pourquoi: string };
export type Juge = { controles: Controle[]; ok: number; inconnus: number; label: string };
export type RobustCase = { p: number; rr: number; centre: boolean; total: number | null; n: number; positifs: number };
export type Robustesse = { cases: Array<RobustCase | null>; positifs: number; testes: number; med: number; centre: number };
export type AilleursRow = { sym: string; total: number | null; n: number; dd: number; positifs: number; segTotal: number };
