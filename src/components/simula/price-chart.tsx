import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, frNum, signedR } from "@/lib/format";
import type { DataFrame, Segments, Trade } from "@/lib/types";

const STEEL = "#4a6d8c";
const UP = "#2c6a4a";
const DOWN = "#9a3d3d";
const LINE = "#c9c8c3";
const MUTED = "#6a6d70";
const PANEL = "#f4f3ef";
const BAND = "#d7e2ec";

type Row = {
  t: number;
  c: number | null;
  winPx: number | null;
  lossPx: number | null;
  r: number | null;
};

function downsample(df: DataFrame, maxN = 720): Row[] {
  const step = Math.max(1, Math.ceil(df.n / maxN));
  const out: Row[] = [];
  for (let i = 0; i < df.n; i += step) {
    out.push({ t: df.t[i]!, c: df.c[i]!, winPx: null, lossPx: null, r: null });
  }
  const last = df.n - 1;
  if (out.length && out[out.length - 1]!.t !== df.t[last]) {
    out.push({ t: df.t[last]!, c: df.c[last]!, winPx: null, lossPx: null, r: null });
  }
  return out;
}

function pxTick(v: number) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("fr-FR");
  return frNum(v, Math.abs(v) >= 100 ? 0 : 2);
}

export function PriceChart({
  df,
  trades,
  segs,
}: {
  df: DataFrame | undefined;
  trades: Trade[];
  segs: Segments | null;
}) {
  if (!df || df.n < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted">
        Pas de série de prix pour cet instrument.
      </div>
    );
  }
  const cap = 80;
  const sample = trades.length > cap ? trades.slice(-cap) : trades;
  const data = downsample(df);
  const nearest = (t: number) => {
    let best = 0;
    let d = Infinity;
    for (let i = 0; i < data.length; i++) {
      const x = Math.abs(data[i]!.t - t);
      if (x < d) {
        d = x;
        best = i;
      }
    }
    return best;
  };
  for (const tr of sample) {
    const row = data[nearest(tr.entree_t)]!;
    const r = tr.R_net ?? tr.R;
    row.r = r;
    if (r >= 0) row.winPx = tr.entree;
    else row.lossPx = tr.entree;
  }
  const bands = (segs?.periodes ?? []).filter(
    (p): p is { from: number; to: number } => !!p,
  );
  const tMin = data[0]!.t;
  const tMax = data[data.length - 1]!.t;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="kicker">Prix H1 · entrées</div>
          <p className="text-xs text-muted">
            Points = ouvertures. Vert = trade ensuite gagnant. Les bandes sont les cinq
            tranches.
          </p>
        </div>
        {trades.length > cap ? (
          <div className="text-xs text-muted">
            {cap} derniers sur {trades.length}
          </div>
        ) : null}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
            {bands.map((b, i) =>
              i % 2 === 0 ? (
                <ReferenceArea
                  key={`${b.from}-${b.to}`}
                  x1={Math.max(b.from, tMin)}
                  x2={Math.min(b.to, tMax)}
                  fill={BAND}
                  fillOpacity={0.45}
                  ifOverflow="hidden"
                />
              ) : null,
            )}
            <XAxis
              dataKey="t"
              type="number"
              domain={[tMin, tMax]}
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              minTickGap={36}
              tickFormatter={(v: number) => formatDate(v)}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={pxTick}
            />
            <Tooltip
              contentStyle={{
                background: PANEL,
                border: `1px solid ${LINE}`,
                borderRadius: 0,
                fontSize: 12,
              }}
              formatter={(v, name, item) => {
                const payload = item?.payload as Row | undefined;
                if (name === "c") return [pxTick(Number(v)), "Clôture"];
                const tag = name === "winPx" ? "Entrée +" : "Entrée −";
                const extra =
                  payload?.r != null ? ` · ${signedR(payload.r, 2)} R` : "";
                return [pxTick(Number(v)) + extra, tag];
              }}
              labelFormatter={(l) => formatDate(Number(l))}
            />
            <Line
              type="monotone"
              dataKey="c"
              stroke={STEEL}
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
              name="c"
            />
            <Line
              type="linear"
              dataKey="winPx"
              stroke="none"
              dot={{ r: 3.2, fill: UP, strokeWidth: 0 }}
              isAnimationActive={false}
              name="winPx"
              legendType="circle"
            />
            <Line
              type="linear"
              dataKey="lossPx"
              stroke="none"
              dot={{ r: 3.2, fill: DOWN, strokeWidth: 0 }}
              isAnimationActive={false}
              name="lossPx"
              legendType="circle"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
