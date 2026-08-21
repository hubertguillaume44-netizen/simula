import type { DataFrame, Instrument } from "@/lib/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(1e-12, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type Regime = { from: number; drift: number; vol: number };

type Spec = {
  id: string;
  label: string;
  hint: string;
  start: number;
  regimes: Regime[];
};

const SPECS: Spec[] = [
  {
    id: "DEMO-TECH",
    label: "Démo Tech",
    hint: "Tendance longue, creux 2022",
    start: 42,
    regimes: [
      { from: Date.UTC(2019, 0, 1), drift: 0.00012, vol: 0.0032 },
      { from: Date.UTC(2020, 1, 20), drift: -0.0004, vol: 0.007 },
      { from: Date.UTC(2020, 3, 15), drift: 0.0002, vol: 0.0038 },
      { from: Date.UTC(2022, 0, 1), drift: -0.00014, vol: 0.0046 },
      { from: Date.UTC(2023, 0, 1), drift: 0.00016, vol: 0.0034 },
    ],
  },
  {
    id: "DEMO-INDICE",
    label: "Démo Indice",
    hint: "Marche plus lisse, moins de bruit",
    start: 12800,
    regimes: [
      { from: Date.UTC(2019, 0, 1), drift: 0.00007, vol: 0.002 },
      { from: Date.UTC(2020, 1, 20), drift: -0.00032, vol: 0.006 },
      { from: Date.UTC(2020, 3, 20), drift: 0.0001, vol: 0.0022 },
      { from: Date.UTC(2022, 0, 1), drift: -0.00005, vol: 0.0028 },
      { from: Date.UTC(2023, 2, 1), drift: 0.00009, vol: 0.002 },
    ],
  },
  {
    id: "DEMO-BANQUE",
    label: "Démo Banque",
    hint: "Deux chocs, tenue inégale",
    start: 28,
    regimes: [
      { from: Date.UTC(2019, 0, 1), drift: 0.00004, vol: 0.0038 },
      { from: Date.UTC(2020, 1, 24), drift: -0.0007, vol: 0.013 },
      { from: Date.UTC(2020, 5, 1), drift: 0.00008, vol: 0.0042 },
      { from: Date.UTC(2023, 2, 1), drift: -0.00045, vol: 0.009 },
      { from: Date.UTC(2023, 5, 1), drift: 0.00006, vol: 0.004 },
    ],
  },
  {
    id: "DEMO-CRYPTO",
    label: "Démo Crypto",
    hint: "Forte amplitude, un seul régime porteur",
    start: 3800,
    regimes: [
      { from: Date.UTC(2019, 0, 1), drift: -0.00004, vol: 0.006 },
      { from: Date.UTC(2021, 0, 1), drift: 0.0007, vol: 0.008 },
      { from: Date.UTC(2021, 6, 1), drift: -0.00035, vol: 0.01 },
      { from: Date.UTC(2023, 0, 1), drift: 0.00004, vol: 0.007 },
      { from: Date.UTC(2024, 2, 1), drift: -0.00002, vol: 0.008 },
    ],
  },
];

export const DEMO_INSTRUMENTS: Instrument[] = SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  kind: "demo",
  hint: s.hint,
}));

function seedFrom(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickRegime(regimes: Regime[], t: number): Regime {
  let cur = regimes[0]!;
  for (const r of regimes) if (t >= r.from) cur = r;
  return cur;
}

export function generateDemo(spec: Spec): DataFrame {
  const rand = mulberry32(seedFrom(spec.id));
  const t: number[] = [];
  const o: number[] = [];
  const h: number[] = [];
  const l: number[] = [];
  const c: number[] = [];
  const v: number[] = [];
  let px = spec.start;
  const start = Date.UTC(2019, 0, 2, 13, 0);
  const end = Date.UTC(2025, 11, 30, 20, 0);

  for (let ms = start; ms <= end; ms += 3600000) {
    const d = new Date(ms);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const hour = d.getUTCHours();
    if (hour < 13 || hour > 20) continue;

    const regime = pickRegime(spec.regimes, ms);
    const shock = rand() < 0.004 ? (rand() < 0.5 ? -1 : 1) * regime.vol * 4 : 0;
    const ret = regime.drift + regime.vol * gaussian(rand) + shock;
    const open = px;
    const close = Math.max(0.05, open * Math.exp(ret));
    const wick = regime.vol * (0.22 + rand() * 0.45);
    const high = Math.max(open, close) * (1 + wick * (0.35 + rand() * 0.5));
    const low = Math.min(open, close) * (1 - wick * (0.35 + rand() * 0.5));
    t.push(ms);
    o.push(+open.toFixed(4));
    h.push(+high.toFixed(4));
    l.push(+Math.max(0.01, low).toFixed(4));
    c.push(+close.toFixed(4));
    v.push(Math.round(200 + rand() * 4800));
    px = close;
  }

  return { t, o, h, l, c, v, n: t.length };
}

let cache: Record<string, DataFrame> | null = null;

export function demoSeries(): Record<string, DataFrame> {
  if (cache) return cache;
  cache = {};
  for (const spec of SPECS) cache[spec.id] = generateDemo(spec);
  return cache;
}

export function seriesToCsv(id: string, df: DataFrame): string {
  const lines = ["datetime,open,high,low,close,volume"];
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]!);
    const stamp = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    lines.push(
      `${stamp},${df.o[i]},${df.h[i]},${df.l[i]},${df.c[i]},${df.v[i]}`,
    );
  }
  return lines.join("\n");
}

export const CSV_HELP = `Format attendu (export H1 de votre courtier) :

datetime,open,high,low,close,volume
2019.01.02 13:00,42.00,42.48,41.90,42.30,798

Séparateurs acceptés : virgule, point-virgule, tabulation.
Date JJ/MM/AAAA ou AAAA.MM.JJ. L'heure peut être dans une colonne à part.
Rien n'est envoyé : le fichier est lu ici, dans votre navigateur.`;
