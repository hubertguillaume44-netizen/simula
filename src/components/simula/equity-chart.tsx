import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, signedR } from "@/lib/format";
import type { CourbePoint } from "@/lib/types";

export function EquityChart({ data }: { data: CourbePoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted">
        Aucun trade — la courbe apparaîtra dès qu’une règle produira des sorties.
      </div>
    );
  }
  const chart = data.map((p) => ({
    t: p.t,
    eq: +p.eq.toFixed(2),
    label: formatDate(p.t),
  }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a6d8c" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#4a6d8c" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#c9c8c3" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#6a6d70", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#c9c8c3" }}
            minTickGap={32}
          />
          <YAxis
            tick={{ fill: "#6a6d70", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => signedR(v, 0)}
          />
          <Tooltip
            contentStyle={{
              background: "#f4f3ef",
              border: "1px solid #c9c8c3",
              borderRadius: 0,
              fontSize: 12,
            }}
            formatter={(v) => [signedR(Number(v), 2) + " R", "Équité"]}
            labelFormatter={(l) => String(l)}
          />
          <Area
            type="monotone"
            dataKey="eq"
            stroke="#4a6d8c"
            strokeWidth={1.6}
            fill="url(#eqFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
