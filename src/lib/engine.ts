import {
  backtester,
  courbe,
  decouper,
  resampler,
  resume,
  segments,
  texteVersDf,
} from "@/lib/moteur";
import { ENTREES_TXT, LIGNES_TXT, hhmm } from "@/lib/format";
import type {
  Config,
  Controle,
  CourbePoint,
  DataFrame,
  Exemple,
  Filtre,
  Juge,
  MesuresSup,
  Resume,
  ScanFiche,
  ScanRow,
  Segments,
  Settings,
  Trade,
} from "@/lib/types";

export const DEBUT = Date.UTC(2020, 0, 1);

export const DEFAULT_SETTINGS: Settings = {
  symbol: "DEMO-TECH",
  ut: "H1",
  entree: "croisement_ou_rebond",
  ligne: "ema",
  periode: 26,
  sl: 2.0,
  rr: 2.5,
  mtf: true,
  utMtf: "D1",
  ligneMtf: "mediane",
  periodeMtf: 9,
  horaire: false,
  hDebut: 840,
  hFin: 1260,
  be: true,
  typeSecu: "be_progressif",
  beSeuil1: 50,
  beNiveau1: 0,
  beSeuil2: 75,
  beNiveau2: 50,
  trailingPct: 1.5,
  frais: true,
  spreadSaisi: 0.02,
  swapSaisi: 0,
  delai: 0,
  fRsi: false,
  utRsi: "H1",
  periodeRsi: 14,
  fRsiSeuil: 50,
  fAdx: false,
  utAdx: "H1",
  periodeAdx: 14,
  fAdxSeuil: 20,
  fNuage: false,
  utNuage: "D1",
  fPente: false,
  utPente: "H4",
  lignePente: "mediane",
  fPenteRecul: 3,
  fPivot: false,
  utPivot: "D1",
  fResist: false,
  utResist: "D1",
  resistLookback: 20,
  resistMarge: 1,
  fZone: false,
  utZone: "D1",
  zoneTouches: 3,
  zoneTol: 0.5,
  zoneMarge: 1,
  zoneMemoire: 250,
  capital: 25000,
  risquePct: 1,
};

export function buildConfig(
  s: Settings,
  overrides?: { periode?: number; sl?: number; rr?: number },
): Config {
  const filtres: Filtre[] = [];
  if (s.mtf) {
    filtres.push({
      type: "tendance_mtf",
      ut: s.utMtf,
      ligne: s.ligneMtf,
      periode: s.periodeMtf,
    });
  }
  if (s.horaire) filtres.push({ type: "horaire", debut: hhmm(s.hDebut), fin: hhmm(s.hFin) });
  if (s.fRsi) {
    filtres.push({
      type: "rsi",
      ut: s.utRsi,
      periode: s.periodeRsi,
      seuil: s.fRsiSeuil,
      sens: "au_dessus",
    });
  }
  if (s.fAdx) {
    filtres.push({
      type: "adx",
      ut: s.utAdx,
      periode: s.periodeAdx,
      seuil: s.fAdxSeuil,
      sens: "au_dessus",
    });
  }
  if (s.fNuage) filtres.push({ type: "nuage", ut: s.utNuage, sens: "au_dessus" });
  if (s.fPente) {
    filtres.push({
      type: "pente",
      ut: s.utPente,
      ligne: s.lignePente,
      periode: s.periodeMtf,
      recul: s.fPenteRecul,
      sens: "hausse",
    });
  }
  if (s.fPivot) filtres.push({ type: "pivot", ut: s.utPivot, sens: "au_dessus" });
  if (s.fResist) {
    filtres.push({
      type: "sous_resistance",
      ut: s.utResist,
      lookback: s.resistLookback,
      marge_pct: s.resistMarge,
    });
  }
  if (s.fZone) {
    filtres.push({
      type: "zone_resistance",
      ut: s.utZone,
      touches: s.zoneTouches,
      tolerance_pct: s.zoneTol,
      marge_pct: s.zoneMarge,
      ecart: 3,
      memoire: s.zoneMemoire,
    });
  }
  if (s.delai > 0) filtres.push({ type: "delai_bougies", n: s.delai });

  return {
    entree: {
      type: s.entree,
      ligne: s.ligne,
      periode: overrides?.periode ?? s.periode,
    },
    filtres,
    sortie: {
      sl: { type: "pct", valeur: overrides?.sl ?? s.sl },
      tp: { valeur: overrides?.rr ?? s.rr },
      securisation: !s.be
        ? { type: "aucun" }
        : s.typeSecu === "trailing"
          ? { type: "trailing", distance_pct: s.trailingPct }
          : {
              type: "be_progressif",
              etapes: [
                [s.beSeuil1, s.beNiveau1],
                [s.beSeuil2, s.beNiveau2],
              ],
            },
    },
    frais: s.frais
      ? {
          spread_pct: s.spreadSaisi || 0,
          swap_annuel_pct: s.swapSaisi || 0,
          commission_pct: 0,
        }
      : { spread_pct: 0, swap_annuel_pct: 0, commission_pct: 0 },
    debut: DEBUT,
  };
}

export function baseOf(df: DataFrame, ut: Settings["ut"]): DataFrame {
  return ut === "H1" ? df : (resampler(df, ut) as DataFrame);
}

export function runBacktest(
  df: DataFrame,
  settings: Settings,
  overrides?: { periode?: number; sl?: number; rr?: number },
): {
  trades: Trade[];
  resume: Resume;
  segs: Segments;
  courbe: CourbePoint[];
  erreur: string | null;
} {
  const base = baseOf(df, settings.ut);
  if (!base || base.n < 300) {
    return {
      trades: [],
      resume: { n: 0, total: 0, winRate: 0, pf: 0, dd: 0, moyenne: 0, rAn: 0, annees: 0 },
      segs: { positifs: 0, total: 5, detail: [], periodes: [] },
      courbe: [],
      erreur: `Données insuffisantes pour ${settings.symbol} à cette unité de temps.`,
    };
  }
  const cfg = buildConfig(settings, overrides);
  const trades = backtester(base, cfg) as Trade[];
  return {
    trades,
    resume: resume(trades) as Resume,
    segs: withPeriodes(trades, segments(trades, 5) as Segments),
    courbe: courbe(trades) as CourbePoint[],
    erreur: null,
  };
}

function withPeriodes(trades: Trade[], segs: Segments): Segments {
  const k = Math.max(segs.detail.length, 1);
  const taille = Math.ceil(trades.length / k) || 1;
  const periodes = segs.detail.map((_, s) => {
    const part = trades.slice(s * taille, (s + 1) * taille);
    if (!part.length) return null;
    return { from: part[0]!.entree_t, to: part[part.length - 1]!.sortie_t };
  });
  return { ...segs, periodes };
}

const EXEMPLE_GRILLE: Array<{ periode: number; sl: number; rr: number }> = [
  { periode: 9, sl: 1, rr: 2.5 },
  { periode: 9, sl: 2.5, rr: 2.5 },
  { periode: 26, sl: 1, rr: 2.5 },
  { periode: 26, sl: 2, rr: 2.5 },
  { periode: 26, sl: 2.5, rr: 2.5 },
  { periode: 50, sl: 2, rr: 2.5 },
  { periode: 20, sl: 1.5, rr: 3 },
];

export function pickExemples(series: Record<string, DataFrame>): {
  rejete: Exemple;
  valide: Exemple;
} | null {
  const rows: Exemple[] = [];
  for (const symbol of Object.keys(series)) {
    const df = series[symbol];
    if (!df) continue;
    for (const g of EXEMPLE_GRILLE) {
      const out = runBacktest(df, { ...DEFAULT_SETTINGS, symbol }, g);
      if (out.resume.n < 30) continue;
      const m = mesuresSup(out.trades, out.resume);
      const j = juger({
        n: out.resume.n,
        dd: out.resume.dd,
        positifs: out.segs.positifs,
        segTotal: out.segs.total,
        esp: m.esp,
        oos: m.oos,
        tenue: m.tenue,
        calmar: m.calmar,
      });
      rows.push({
        kind: j.ok >= 4 ? "valide" : "rejete",
        titre: "",
        settings: { symbol, periode: g.periode, sl: g.sl, rr: g.rr },
        n: out.resume.n,
        total: out.resume.total,
        dd: out.resume.dd,
        positifs: out.segs.positifs,
        segTotal: out.segs.total,
        ok: j.ok,
        etat: j.label,
      });
    }
  }
  if (!rows.length) return null;
  const same = (a: Exemple, b: Exemple) =>
    a.settings.symbol === b.settings.symbol &&
    a.settings.periode === b.settings.periode &&
    a.settings.sl === b.settings.sl &&
    a.settings.rr === b.settings.rr;
  const rejete =
    [...rows].filter((r) => r.ok < 4).sort((a, b) => b.total - a.total)[0] ??
    [...rows].sort((a, b) => a.ok - b.ok || b.total - a.total)[0]!;
  const valide =
    [...rows]
      .filter((r) => r.ok >= 4 && !same(r, rejete))
      .sort((a, b) => b.ok - a.ok || b.positifs - a.positifs || a.dd - b.dd)[0] ??
    [...rows]
      .filter((r) => !same(r, rejete))
      .sort((a, b) => b.ok - a.ok || b.positifs - a.positifs)[0];
  if (!valide) return null;
  return {
    rejete: {
      ...rejete,
      kind: "rejete",
      titre: "Cette règle a l’air belle",
    },
    valide: {
      ...valide,
      kind: "valide",
      titre: "Celle-ci survit",
    },
  };
}

export function parseCsvFile(name: string, text: string): { id: string; df: DataFrame } | { error: string } {
  const id = name
    .replace(/\.csv$/i, "")
    .replace(/_(H1|H4|D1|M\d+)$/i, "")
    .replace(/^#/, "");
  const brut = texteVersDf(text) as DataFrame;
  if (!brut.n) return { error: `${name} : aucune bougie lisible` };
  const df = decouper(brut, DEBUT, undefined) as DataFrame;
  if (df.n < 300) return { error: `${name} : moins de 300 bougies après nettoyage` };
  return { id: id || name, df };
}

export function parseNumbers(txt: string, fallback: number[]): number[] {
  const v = String(txt || "")
    .split(/[;\s]+/)
    .map((x) => parseFloat(x.replace(",", ".")))
    .filter((x) => !Number.isNaN(x) && x > 0);
  return v.length ? v : fallback;
}

export function ficheFrom(
  settings: Settings,
  univers: string[],
  periodes: number[],
  sls: number[],
  rrs: number[],
  tradesMin: number,
  segMin: number,
): ScanFiche {
  const fmt = (vals: number[]) => vals.map((x) => String(x).replace(".", ",")).join(", ");
  return {
    symboles: univers.join(" · "),
    instruments: univers.length,
    entree: ENTREES_TXT[settings.entree] ?? settings.entree,
    ligne: LIGNES_TXT[settings.ligne] ?? settings.ligne,
    ut: settings.ut,
    grille: `période = ${fmt(periodes)} · SL = ${fmt(sls)} % · R/R = ${fmt(rrs)}`,
    seuils: `${tradesMin} / ${segMin}`,
  };
}

export function toScanRow(
  sym: string,
  periode: number,
  sl: number,
  rr: number,
  r: Resume,
  sg: Segments,
  trades: Trade[],
): ScanRow {
  const m = mesuresSup(trades, r);
  const j = juger({ ...r, ...m, positifs: sg.positifs, segTotal: sg.total });
  return {
    sym,
    periode,
    sl,
    rr,
    n: r.n,
    total: r.total,
    rAn: r.rAn,
    dd: r.dd,
    positifs: sg.positifs,
    segTotal: sg.total,
    pf: r.pf,
    winRate: r.winRate,
    esp: m.esp,
    oos: m.oos,
    tenue: m.tenue,
    calmar: m.calmar,
    etat: j.label,
    ok: j.ok,
  };
}

export function mesuresSup(trades: Trade[], r: Resume): MesuresSup {
  const R = (t: Trade) => (t.R_net !== undefined ? t.R_net : t.R);
  const k = Math.max(1, Math.floor(trades.length * 0.7));
  const app = resume(trades.slice(0, k)) as Resume;
  const ctl = resume(trades.slice(k)) as Resume;
  let cur = 0;
  let pire = 0;
  for (const t of trades) {
    if (R(t) <= 0) {
      cur += 1;
      if (cur > pire) pire = cur;
    } else cur = 0;
  }
  const brut = trades.reduce((a, t) => a + (t.R || 0), 0);
  return {
    brut,
    frais: brut - r.total,
    esp: r.n ? r.total / r.n : 0,
    calmar: r.dd !== 0 ? r.total / Math.abs(r.dd) : Infinity,
    oos: ctl.total,
    oosN: ctl.n,
    isAn: app.rAn,
    tenue: app.rAn > 0 ? (ctl.rAn / app.rAn) * 100 : ctl.rAn > 0 ? 100 : 0,
    serie: pire,
    coupe: k,
    annees: r.annees,
  };
}

export function controles(r: {
  n: number;
  esp?: number;
  positifs: number;
  segTotal: number;
  oos?: number;
  tenue?: number;
  calmar?: number;
  dd: number;
}): Controle[] {
  const q = (
    nom: string,
    ok: boolean | null,
    valeur: string,
    attendu: string,
    pourquoi: string,
  ): Controle => ({ nom, ok, valeur, attendu, pourquoi });
  return [
    q(
      "Assez de trades",
      r.n >= 40,
      `${r.n} trades`,
      "40 minimum",
      "Sous 40 trades, le résultat est du bruit : une seule bonne série suffit à tout expliquer.",
    ),
    q(
      "L’espérance couvre les frais",
      r.esp === undefined ? null : r.esp >= 0.1,
      r.esp === undefined
        ? "—"
        : `${r.esp >= 0 ? "+ " : "− "}${Math.abs(r.esp).toFixed(2).replace(".", ",")} R`,
      "0,10 R par trade",
      "Une espérance plus faible disparaît au premier élargissement de spread.",
    ),
    q(
      "Le walk-forward tient",
      r.positifs >= 4,
      `${r.positifs} / ${r.segTotal}`,
      "4 segments sur 5",
      "Une stratégie qui ne gagne que sur un cinquième de son historique n’a pas de régularité.",
    ),
    q(
      "Hors échantillon positif",
      r.oos === undefined ? null : r.oos > 0 && (r.tenue ?? 0) >= 50,
      r.oos === undefined
        ? "—"
        : `${r.oos >= 0 ? "+ " : "− "}${Math.abs(r.oos).toFixed(1).replace(".", ",")} R · tenue ${Math.round(r.tenue ?? 0)} %`,
      "positif, tenue ≥ 50 %",
      "La partie récente n’a pas servi à choisir la configuration : c’est la seule mesure non truquée.",
    ),
    q(
      "Creux supportable",
      r.calmar === undefined ? null : r.calmar >= 2,
      `${Math.round(Math.abs(r.dd))} stops encaissés · ${
        r.calmar === undefined ? "—" : r.calmar === Infinity ? "∞" : r.calmar.toFixed(2).replace(".", ",")
      } R gagné par R de creux`,
      "2 R gagnés par R de creux",
      "En dessous, il faut encaisser presque autant de douleur que de gain — personne ne tient.",
    ),
  ];
}

export function juger(r: {
  n: number;
  esp?: number;
  positifs: number;
  segTotal: number;
  oos?: number;
  tenue?: number;
  calmar?: number;
  dd: number;
}): Juge {
  const c = controles(r);
  const ok = c.filter((x) => x.ok === true).length;
  const inconnus = c.filter((x) => x.ok === null).length;
  return {
    controles: c,
    ok,
    inconnus,
    label: inconnus ? `${ok} / 5 mesurés` : ok === 5 ? "Validée" : ok === 4 ? "À revoir" : "Rejetée",
  };
}
