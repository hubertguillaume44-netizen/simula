import { Trash2 } from "lucide-react";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { formatDate, frNum, signedR, verdict } from "@/lib/format";
import { useSim } from "@/lib/store";

export function JournalPanel() {
  const runs = useSim((s) => s.runs);
  const recharger = useSim((s) => s.rechargerRun);
  const supprimer = useSim((s) => s.supprimerRun);

  if (!runs.length) {
    return (
      <Blueprint className="p-8">
        <div className="kicker">Journal</div>
        <h2 className="mt-1 font-display text-3xl">Rien n’est encore sauvé</h2>
        <p className="mt-3 max-w-prose text-sm text-muted">
          Les backtests et scans restent dans ce navigateur. Sauvez un résultat pour le
          retrouver ici — et le recharger d’un clic.
        </p>
      </Blueprint>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="kicker">Résultats sauvegardés</div>
        <h2 className="mt-1 font-display text-3xl">Vos stratégies testées</h2>
      </div>
      {runs.map((run) => (
        <Blueprint key={run.id} className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="kicker">{run.type === "scan" ? "Scan" : "Backtest"}</div>
              <div className="font-display text-xl">
                {run.type === "scan"
                  ? `${run.retenues} retenues sur ${run.testees} tests`
                  : `${run.settings.symbol} · ${run.settings.ut}`}
              </div>
              <div className="text-xs text-muted">{formatDate(Date.parse(run.date))}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => recharger(run)}>
                Recharger
              </Button>
              <Button variant="ghost" size="sm" onClick={() => supprimer(run.id)} aria-label="Supprimer">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          {run.type === "backtest" ? (
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs text-muted">R total</div>
                <div className="tabular">{signedR(run.total, 1)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Creux</div>
                <div className="tabular text-down">{signedR(run.dd, 1)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Trades</div>
                <div className="tabular">
                  {run.n} · {frNum(run.winRate, 0)} %
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Tranches</div>
                <div className="tabular">
                  {run.positifs ?? "—"} / {run.segTotal ?? "—"}{" "}
                  {run.positifs != null && run.segTotal
                    ? `· ${verdict(run.positifs, run.segTotal).label}`
                    : ""}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{run.fiche.grille}</p>
          )}
        </Blueprint>
      ))}
    </div>
  );
}
