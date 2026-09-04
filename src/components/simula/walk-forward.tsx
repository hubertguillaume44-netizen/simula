import { cn } from "@/lib/utils";
import { signedR, sliceLabel, verdict } from "@/lib/format";
import type { Segments } from "@/lib/types";

export function WalkForward({ segs }: { segs: Segments | null }) {
  if (!segs || !segs.detail.length) {
    return <p className="text-sm text-muted">Pas assez de trades pour découper l’historique.</p>;
  }
  const v = verdict(segs.positifs, segs.total);
  const maxAbs = Math.max(...segs.detail.map((d) => Math.abs(d ?? 0)), 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Walk-forward · 5 tranches</div>
          <p className="mt-1 font-display text-2xl font-semibold">
            {segs.positifs} / {segs.total}{" "}
            <span className="text-base font-normal text-muted">tranches gagnantes</span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex px-3 py-1 text-xs tracking-wide",
            v.tone === "up" && "bg-up-soft text-up",
            v.tone === "warn" && "bg-warn-soft text-warn",
            v.tone === "down" && "bg-down-soft text-down",
            v.tone === "muted" && "bg-secondary text-muted",
          )}
        >
          {v.label}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {segs.detail.map((d, i) => {
          const pos = (d ?? 0) > 0;
          const h = Math.max(8, ((Math.abs(d ?? 0) / maxAbs) * 72) | 0);
          const per = segs.periodes?.[i];
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="flex h-20 w-full items-end justify-center bg-paper">
                <div
                  className={cn("w-3/5", pos ? "bg-up" : "bg-down")}
                  style={{ height: d == null ? 0 : h }}
                />
              </div>
              <div className="text-center text-[11px] leading-tight text-muted">
                {per ? sliceLabel(per.from, per.to) : `T${i + 1}`}
              </div>
              <div className={cn("tabular text-xs", pos ? "text-up" : "text-down")}>
                {d == null ? "—" : signedR(d, 1)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        L’historique des trades est coupé en cinq parts égales. Les années sous chaque barre
        sont celles des sorties de la tranche — pas un calendrier boursier.
      </p>
    </div>
  );
}
