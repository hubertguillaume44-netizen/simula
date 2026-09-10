import { create } from "zustand";
import { DEMO_INSTRUMENTS, demoSeries } from "@/lib/demo";
import {
  DEFAULT_SETTINGS,
  ficheFrom,
  juger,
  mesuresSup,
  parseCsvFile,
  parseNumbers,
  pickExemples,
  runBacktest,
  toScanRow,
} from "@/lib/engine";
import { asInstrument, deleteUpload, loadUploads, saveUpload } from "@/lib/uploads";
import type {
  AilleursRow,
  CourbePoint,
  DataFrame,
  Exemple,
  Instrument,
  Juge,
  MesuresSup,
  Resume,
  Robustesse,
  Run,
  ScanFiche,
  ScanRow,
  Segments,
  Settings,
  Trade,
  Vue,
} from "@/lib/types";

const RUNS_KEY = "vena.runs.v1";
const ONB_KEY = "vena.onb.v1";

// ————— MIGRATION « simula. » → « vena. » —————
// Le site garde les runs et l'onboarding dans le stockage du navigateur. Renommer la
// clé sans recopier effacerait les runs de l'utilisateur au premier chargement, sans
// rien dire. La clé neuve fait foi ; l'ancienne est recopiée si la neuve n'existe pas,
// et RIEN n'est supprimé — l'ancien jeu reste au moins une version.
function migrerCle(neuve: string, ancienne: string) {
  try {
    if (localStorage.getItem(neuve) !== null) return;
    const v = localStorage.getItem(ancienne);
    if (v === null) return;
    localStorage.setItem(neuve, v);
    // DÉPLACER, PAS COPIER, et seulement après avoir relu. Une migration qui copie
    // exige deux fois la place et n'aboutit pas dans un stockage à moitié plein —
    // c'est ainsi qu'un scan de 3 Mo est resté dehors côté application. Tant que la
    // neuve ne porte pas exactement la valeur de la source, l'ancienne est le seul
    // exemplaire et ne bouge pas.
    if (localStorage.getItem(neuve) === v) localStorage.removeItem(ancienne);
    else localStorage.removeItem(neuve);
  } catch {
    /* stockage indisponible : on repartira de zéro, sans perdre l'ancien */
  }
}
migrerCle(RUNS_KEY, "simula.runs.v1");
migrerCle(ONB_KEY, "simula.onb.v1");

// LE REPLI DE LECTURE. La clé neuve fait toujours foi si elle existe, même vide ;
// l'ancienne n'est lue que lorsqu'elle est absente. Rien n'est écrit, rien n'est
// supprimé : ce qui n'a pas pu être déplacé reste au moins LISIBLE.
function lire(cle: string): string | null {
  try {
    const v = localStorage.getItem(cle);
    if (v !== null) return v;
    return localStorage.getItem(cle.replace(/^vena\./, "simula."));
  } catch {
    return null;
  }
}

// UN REFUS DE QUOTA DOIT SE VOIR. `catch { /* quota */ }` était une perte silencieuse :
// l'utilisateur croyait son journal enregistré. Un chemin unique, que tous les
// écrivains empruntent, retient le refus et le poids de ce qui n'est pas passé.
let refusStockage: { cle: string; octets: number } | null = null;
export function refusDeStockage() {
  return refusStockage;
}
function ecrire(cle: string, valeur: string): boolean {
  try {
    localStorage.setItem(cle, valeur);
    refusStockage = null;
    return true;
  } catch {
    // le navigateur refuse sans dire de combien : le seul chiffre exact est le poids de
    // l'écriture refusée, donc le minimum à libérer. Deux octets par caractère (UTF-16).
    refusStockage = { cle, octets: (cle.length + valeur.length) * 2 };
    return false;
  }
}

function loadRuns(): Run[] {
  try {
    return JSON.parse(lire(RUNS_KEY) || "[]") as Run[];
  } catch {
    return [];
  }
}

function saveRuns(runs: Run[]): boolean {
  return ecrire(RUNS_KEY, JSON.stringify(runs.slice(0, 60)));
}

type SimState = {
  ready: boolean;
  vue: Vue;
  settings: Settings;
  series: Record<string, DataFrame>;
  instruments: Instrument[];
  univers: string[];
  resume: Resume | null;
  segs: Segments | null;
  courbe: CourbePoint[];
  trades: Trade[];
  erreur: string | null;
  messageDepot: string | null;
  scan: ScanRow[] | null;
  scanFiche: ScanFiche | null;
  scanning: boolean;
  scanProgress: string | null;
  scanTestes: number;
  gPeriodes: string;
  gSls: string;
  gRrs: string;
  tradesMin: number;
  segMin: number;
  runs: Run[];
  tri: "total" | "dd" | "positifs" | "pf" | "ok";
  extras: MesuresSup | null;
  juge: Juge | null;
  robuste: Robustesse | null;
  ailleurs: AilleursRow[] | null;
  calculEnCours: "robuste" | "ailleurs" | null;
  exemples: { rejete: Exemple; valide: Exemple } | null;
  onb: boolean;
  // le stockage a refusé une écriture : ce qui manque, en octets, pour qu'elle passe
  manquePlace: { cle: string; octets: number } | null;
  init: () => void;
  patch: (p: Partial<Settings>) => void;
  setVue: (v: Vue) => void;
  setUnivers: (ids: string[]) => void;
  dropFiles: (files: FileList | File[]) => Promise<void>;
  retirerFichier: (id: string) => Promise<void>;
  runNow: () => void;
  lancerScan: () => Promise<void>;
  applyScanRow: (row: ScanRow) => void;
  sauverBacktest: () => void;
  sauverScan: () => void;
  supprimerRun: (id: number) => void;
  rechargerRun: (run: Run) => void;
  setGrid: (p: Partial<Pick<SimState, "gPeriodes" | "gSls" | "gRrs" | "tradesMin" | "segMin" | "tri">>) => void;
  testerRobustesse: () => Promise<void>;
  testerAilleurs: () => Promise<void>;
  dismissOnb: () => void;
  applyExemple: (ex: Exemple) => void;
  reopenOnb: () => void;
};

function emptyResume(): Resume {
  return { n: 0, total: 0, winRate: 0, pf: 0, dd: 0, moyenne: 0, rAn: 0, annees: 0 };
}

let bootStarted = false;

export const useSim = create<SimState>((set, get) => ({
  ready: false,
  vue: "backtest",
  settings: { ...DEFAULT_SETTINGS },
  series: {},
  instruments: [...DEMO_INSTRUMENTS],
  univers: DEMO_INSTRUMENTS.map((d) => d.id),
  resume: null,
  segs: null,
  courbe: [],
  trades: [],
  erreur: null,
  messageDepot: null,
  scan: null,
  scanFiche: null,
  scanning: false,
  scanProgress: null,
  scanTestes: 0,
  gPeriodes: "9 20 26 50",
  gSls: "1,5 2,0 2,5",
  gRrs: "1,5 2,5",
  tradesMin: 40,
  segMin: 3,
  runs: [],
  tri: "total",
  extras: null,
  juge: null,
  robuste: null,
  ailleurs: null,
  calculEnCours: null,
  exemples: null,
  onb: true,
  manquePlace: null,

  init: () => {
    if (get().ready || bootStarted) return;
    bootStarted = true;
    void (async () => {
      const series = demoSeries();
      const instruments = [...DEMO_INSTRUMENTS];
      const onb =
        typeof window === "undefined" ? true : lire(ONB_KEY) !== "1";
      let uploads: Awaited<ReturnType<typeof loadUploads>> = [];
      if (typeof window !== "undefined") {
        uploads = await loadUploads();
      }
      for (const u of uploads) {
        series[u.id] = u.df;
        if (!instruments.some((i) => i.id === u.id)) instruments.unshift(asInstrument(u));
      }
      const perso = instruments.find((i) => i.kind === "upload");
      set({
        series,
        instruments,
        univers: instruments.map((i) => i.id),
        settings: perso
          ? { ...get().settings, symbol: perso.id }
          : get().settings,
        ready: true,
        runs: typeof window === "undefined" ? [] : loadRuns(),
        onb,
      });
      get().runNow();
      queueMicrotask(() => {
        if (get().exemples) return;
        set({ exemples: pickExemples(demoSeries()) });
      });
    })();
  },

  patch: (p) => {
    set({ settings: { ...get().settings, ...p } });
    get().runNow();
  },

  setVue: (vue) => set({ vue }),

  setUnivers: (univers) => set({ univers }),

  setGrid: (p) => set(p),

  runNow: () => {
    const { settings, series } = get();
    const df = series[settings.symbol];
    if (!df) {
      set({
        resume: emptyResume(),
        segs: { positifs: 0, total: 5, detail: [], periodes: [] },
        courbe: [],
        trades: [],
        extras: null,
        juge: null,
        robuste: null,
        ailleurs: null,
        erreur: `Aucune série chargée pour ${settings.symbol}.`,
      });
      return;
    }
    const out = runBacktest(df, settings);
    const extras = out.trades.length ? mesuresSup(out.trades, out.resume) : null;
    const juge = extras
      ? juger({
          n: out.resume.n,
          dd: out.resume.dd,
          positifs: out.segs.positifs,
          segTotal: out.segs.total,
          esp: extras.esp,
          oos: extras.oos,
          tenue: extras.tenue,
          calmar: extras.calmar,
        })
      : null;
    set({
      resume: out.resume,
      segs: out.segs,
      courbe: out.courbe,
      trades: out.trades,
      extras,
      juge,
      robuste: null,
      ailleurs: null,
      erreur: out.erreur,
    });
  },

  dropFiles: async (files) => {
    const list = Array.from(files);
    const ajoutes: string[] = [];
    const refuses: string[] = [];
    const series = { ...get().series };
    const instruments = [...get().instruments];
    for (const f of list) {
      if (!/\.csv$/i.test(f.name)) {
        refuses.push(`${f.name} (pas un CSV)`);
        continue;
      }
      const parsed = parseCsvFile(f.name, await f.text());
      if ("error" in parsed) {
        refuses.push(parsed.error);
        continue;
      }
      series[parsed.id] = parsed.df;
      const hint = `${parsed.df.n.toLocaleString("fr-FR")} bougies · sur cet ordinateur`;
      const inst = instruments.find((i) => i.id === parsed.id);
      if (inst) {
        inst.kind = "upload";
        inst.hint = hint;
        inst.label = parsed.id;
      } else {
        instruments.unshift({
          id: parsed.id,
          label: parsed.id,
          kind: "upload",
          hint,
        });
      }
      try {
        await saveUpload({ id: parsed.id, label: parsed.id, hint, df: parsed.df });
      } catch {
        refuses.push(`${parsed.id} (sauvegarde locale saturée — le fichier reste pour cette session)`);
      }
      ajoutes.push(parsed.id);
    }
    const first = ajoutes[0];
    set({
      series,
      instruments,
      univers: [...new Set([...ajoutes, ...get().univers])],
      settings: first ? { ...get().settings, symbol: first } : get().settings,
      messageDepot:
        (ajoutes.length
          ? `${ajoutes.length} fichier(s) enregistré(s) ici : ${ajoutes.join(", ")}. La version en ligne, elle, garde les démos.`
          : "") +
        (refuses.length
          ? `${ajoutes.length ? " — " : ""}Ignoré(s) : ${refuses.join(", ")}`
          : ""),
    });
    if (ajoutes.length) get().runNow();
  },

  retirerFichier: async (id) => {
    const instruments = get().instruments.filter((i) => i.id !== id);
    const series = { ...get().series };
    delete series[id];
    try {
      await deleteUpload(id);
    } catch {
      /* ignore */
    }
    const next = get().settings.symbol === id ? (instruments[0]?.id ?? DEFAULT_SETTINGS.symbol) : get().settings.symbol;
    set({
      series,
      instruments,
      univers: get().univers.filter((x) => x !== id),
      settings: { ...get().settings, symbol: next },
      messageDepot: `${id} retiré de cet ordinateur.`,
    });
    get().runNow();
  },

  lancerScan: async () => {
    const s = get();
    if (s.scanning) return;
    const univers = s.univers.length ? s.univers : [s.settings.symbol];
    const periodes = parseNumbers(s.gPeriodes, [26]);
    const sls = parseNumbers(s.gSls, [1]);
    const rrs = parseNumbers(s.gRrs, [2.5]);
    const total = univers.length * periodes.length * sls.length * rrs.length;
    set({ scanning: true, scanTestes: total, scanProgress: "Préparation…" });
    const out: ScanRow[] = [];
    let fait = 0;
    for (const sym of univers) {
      fait += 1;
      set({ scanProgress: `Symbole ${fait} / ${univers.length} — ${sym}` });
      await new Promise((r) => setTimeout(r, 0));
      const df = get().series[sym];
      if (!df) continue;
      for (const p of periodes) {
        for (const sl of sls) {
          for (const rr of rrs) {
            const res = runBacktest(df, { ...get().settings, symbol: sym }, { periode: p, sl, rr });
            if (res.resume.n < get().tradesMin) continue;
            out.push(toScanRow(sym, p, sl, rr, res.resume, res.segs, res.trades));
            if (out.length % 8 === 0) await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
    }
    out.sort((a, b) => b.total - a.total);
    set({
      scan: out,
      scanFiche: ficheFrom(get().settings, univers, periodes, sls, rrs, get().tradesMin, get().segMin),
      scanning: false,
      scanProgress: null,
      vue: "scan",
    });
  },

  applyScanRow: (row) => {
    set({
      settings: {
        ...get().settings,
        symbol: row.sym,
        periode: row.periode,
        sl: row.sl,
        rr: row.rr,
      },
      vue: "backtest",
    });
    get().runNow();
  },

  sauverBacktest: () => {
    const s = get();
    if (!s.resume || s.erreur) return;
    const run: Run = {
      id: Date.now(),
      type: "backtest",
      date: new Date().toISOString(),
      settings: { ...s.settings },
      n: s.resume.n,
      total: s.resume.total,
      rAn: s.resume.rAn,
      winRate: s.resume.winRate,
      pf: s.resume.pf,
      dd: s.resume.dd,
      positifs: s.segs?.positifs ?? null,
      segTotal: s.segs?.total ?? null,
    };
    const runs = [run, ...s.runs];
    // un enregistrement refusé se DIT : sans ce retour, l'utilisateur croyait son
    // journal écrit et le retrouvait vide au rechargement
    const ecrit = saveRuns(runs);
    set({ runs, vue: "journal", manquePlace: ecrit ? null : refusDeStockage() });
  },

  sauverScan: () => {
    const s = get();
    if (!s.scan || !s.scanFiche) return;
    const garde = s.scan.filter((r) => r.ok >= 4).slice(0, 15);
    const run: Run = {
      id: Date.now(),
      type: "scan",
      date: new Date().toISOString(),
      fiche: s.scanFiche,
      testees: s.scanTestes,
      retenues: garde.length,
      top: garde,
    };
    const runs = [run, ...s.runs];
    const ecrit = saveRuns(runs);
    set({ runs, vue: "journal", manquePlace: ecrit ? null : refusDeStockage() });
  },

  supprimerRun: (id) => {
    const runs = get().runs.filter((r) => r.id !== id);
    const ecrit = saveRuns(runs);
    set({ runs, manquePlace: ecrit ? null : refusDeStockage() });
  },

  rechargerRun: (run) => {
    if (run.type === "scan") {
      set({
        vue: "scan",
        scan: run.top,
        scanFiche: run.fiche,
        scanTestes: run.testees,
      });
      return;
    }
    set({ settings: { ...run.settings }, vue: "backtest" });
    get().runNow();
  },

  testerRobustesse: async () => {
    const s = get();
    const df = s.series[s.settings.symbol];
    if (!df) return;
    set({ calculEnCours: "robuste", robuste: null });
    const cases: Array<Robustesse["cases"][number]> = [];
    for (const dp of [-1, 0, 1]) {
      for (const dr of [-0.25, 0, 0.25]) {
        const p = s.settings.periode + dp;
        const rr = Math.round((s.settings.rr + dr) * 100) / 100;
        if (p < 2 || rr <= 0) {
          cases.push(null);
          continue;
        }
        const out = runBacktest(df, s.settings, { periode: p, rr });
        cases.push({
          p,
          rr,
          centre: dp === 0 && dr === 0,
          total: out.trades.length ? out.resume.total : null,
          n: out.resume.n,
          positifs: out.segs.positifs,
        });
        await new Promise((z) => setTimeout(z, 0));
      }
    }
    const vus = cases.filter((c): c is NonNullable<typeof c> => !!c && c.total !== null);
    const v = vus.map((c) => c.total as number).sort((a, b) => a - b);
    const med = !v.length
      ? 0
      : v.length % 2
        ? v[(v.length - 1) / 2]!
        : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
    set({
      calculEnCours: null,
      robuste: {
        cases,
        positifs: vus.filter((c) => (c.total ?? 0) > 0).length,
        testes: vus.length,
        med,
        centre: s.resume?.total ?? 0,
      },
    });
  },

  testerAilleurs: async () => {
    const s = get();
    let liste = s.univers.filter((x) => x !== s.settings.symbol);
    if (!liste.length) liste = s.instruments.map((i) => i.id).filter((x) => x !== s.settings.symbol);
    liste = liste.slice(0, 12);
    if (!liste.length) return;
    set({ calculEnCours: "ailleurs", ailleurs: null });
    const out: AilleursRow[] = [];
    for (const sym of liste) {
      set({ scanProgress: `Même configuration sur ${sym}` });
      await new Promise((z) => setTimeout(z, 0));
      const df = get().series[sym];
      if (!df) continue;
      const res = runBacktest(df, { ...get().settings, symbol: sym });
      out.push({
        sym,
        total: res.trades.length ? res.resume.total : null,
        n: res.resume.n,
        dd: res.resume.dd,
        positifs: res.segs.positifs,
        segTotal: res.segs.total,
      });
    }
    out.sort((a, b) => (b.total ?? -1e9) - (a.total ?? -1e9));
    set({ calculEnCours: null, scanProgress: null, ailleurs: out.length ? out : null });
  },

  dismissOnb: () => {
    const ecrit = ecrire(ONB_KEY, "1");
    set({ onb: false, manquePlace: ecrit ? null : refusDeStockage() });
  },

  applyExemple: (ex) => {
    ecrire(ONB_KEY, "1");
    set({
      onb: false,
      vue: "backtest",
      settings: {
        ...get().settings,
        symbol: ex.settings.symbol,
        periode: ex.settings.periode,
        sl: ex.settings.sl,
        rr: ex.settings.rr,
      },
    });
    get().runNow();
  },

  reopenOnb: () => {
    // on ne retire QUE la clé neuve : effacer aussi sa jumelle ancienne supprimerait,
    // sur un geste d'entretien, le seul exemplaire d'une donnée non déplacée
    try {
      localStorage.removeItem(ONB_KEY);
    } catch {
      /* stockage indisponible */
    }
    set({ onb: true });
  },
}));
