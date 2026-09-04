import { cn } from "@/lib/utils";
export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="kicker">{label}</div>
      <div className={cn("font-display text-2xl tabular leading-none", tone === "up" && "text-up", tone === "down" && "text-down")}>
        {value}
      </div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
