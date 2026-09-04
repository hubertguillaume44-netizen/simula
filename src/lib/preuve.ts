import { demoSeries } from "@/lib/demo";
import { DEFAULT_SETTINGS, runBacktest, toScanRow } from "@/lib/engine";
import { verdict } from "@/lib/format";
import type { ScanRow } from "@/lib/types";

export type PreuveRow = ScanRow & { verdict: string; tone: "up" | "warn" | "down" | "muted" };

let cached: PreuveRow[] | null = null;

function key(r: ScanRow) {
  return `${r.sym}|${r.periode}|${r.sl}|${r.rr}`;
}

export function computePreuve(): PreuveRow[] {
  if (cached) return cached;
  const series = demoSeries();
  const grid = [
    { periode: 26, sl: 2.0, rr: 2.5 },
    { periode: 26, sl: 3.0, rr: 3 },
    { periode: 50, sl: 2.0, rr: 2.5 },
    { periode: 9, sl: 1.5, rr: 1.5 },
    { periode: 20, sl: 1.0, rr: 3 },
    { periode: 9, sl: 1.0, rr: 4 },
  ];
  const rows: ScanRow[] = [];
  for (const id of Object.keys(series)) {
    const df = series[id]!;
    for (const g of grid) {
      const out = runBacktest(df, { ...DEFAULT_SETTINGS, symbol: id }, g);
      if (out.resume.n < 20) continue;
      rows.push(toScanRow(id, g.periode, g.sl, g.rr, out.resume, out.segs, out.trades));
    }
  }
  rows.sort((a, b) => b.total - a.total);

  const picked: ScanRow[] = [];
  const take = (r: ScanRow | undefined) => {
    if (!r) return;
    if (picked.some((p) => key(p) === key(r))) return;
    picked.push(r);
  };

  take(rows[0]);
  take(rows.find((r) => r.positifs <= 3));
  take([...rows].sort((a, b) => a.positifs - b.positifs || b.total - a.total)[0]);
  const bySym = new Set(picked.map((r) => r.sym));
  for (const r of rows) {
    if (bySym.has(r.sym)) continue;
    take(r);
    bySym.add(r.sym);
    if (picked.length >= 5) break;
  }
  while (picked.length < 5) {
    const next = rows.find((r) => !picked.some((p) => key(p) === key(r)));
    if (!next) break;
    take(next);
  }
  picked.sort((a, b) => b.total - a.total);

  cached = picked.map((r) => {
    const v = verdict(r.positifs, r.segTotal);
    return { ...r, verdict: v.label, tone: v.tone };
  });
  return cached;
}
