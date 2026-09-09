import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { frNum, signedR } from "@/lib/format";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Exemple } from "@/lib/types";

function Card({
  ex,
  tone,
  onOpen,
}: {
  ex: Exemple;
  tone: "down" | "up";
  onOpen: () => void;
}) {
  return (
    <Blueprint className="flex h-full flex-col gap-3 p-5">
      <div className="kicker">{ex.kind === "rejete" ? "Rejetée" : "Retenue"}</div>
      <h3 className="font-display text-2xl">{ex.titre}</h3>
      <p className="text-sm text-muted">
        {ex.settings.symbol} · MME {ex.settings.periode} · SL {frNum(ex.settings.sl, 1)} % ·
        R/R {frNum(ex.settings.rr, 1)}
      </p>
      <div className="mt-auto grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted">R total</div>
          <div className={cn("tabular", ex.total >= 0 ? "text-up" : "text-down")}>
            {signedR(ex.total, 1)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Tranches</div>
          <div className="tabular">
            {ex.positifs} / {ex.segTotal}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">État</div>
          <div className={cn("text-sm", tone === "up" ? "text-up" : "text-down")}>{ex.etat}</div>
        </div>
      </div>
      <Button
        variant={tone === "up" ? "primary" : "secondary"}
        className="mt-1 min-h-11"
        onClick={onOpen}
      >
        Ouvrir ce backtest
      </Button>
    </Blueprint>
  );
}

export function Duo() {
  const exemples = useSim((s) => s.exemples);
  const onb = useSim((s) => s.onb);
  const apply = useSim((s) => s.applyExemple);
  const dismiss = useSim((s) => s.dismissOnb);
  if (!onb || !exemples) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Deux règles, même moteur</div>
          <h2 className="font-display text-3xl">Lisez l’état, pas le total</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            À gauche, une règle que le total ne sauve pas. À droite, une qui passe les cinq
            questions. Ouvrez-les, puis lisez le verdict avant la courbe.
          </p>
        </div>
        <Button variant="ghost" onClick={dismiss}>
          Passer au laboratoire
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card ex={exemples.rejete} tone="down" onOpen={() => apply(exemples.rejete)} />
        <Card ex={exemples.valide} tone="up" onOpen={() => apply(exemples.valide)} />
      </div>
    </section>
  );
}

export function DuoRevoir() {
  const onb = useSim((s) => s.onb);
  const exemples = useSim((s) => s.exemples);
  const reopen = useSim((s) => s.reopenOnb);
  if (onb || !exemples) return null;
  return (
    <button
      type="button"
      className="text-left text-xs text-steel underline decoration-steel/40 underline-offset-4"
      onClick={reopen}
    >
      Revoir les deux exemples
    </button>
  );
}
