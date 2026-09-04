import { Bookmark } from "lucide-react";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { EquityChart } from "@/components/simula/equity-chart";
import { ControlesPanel, RobustessePanel } from "@/components/simula/controles";
import { PriceChart } from "@/components/simula/price-chart";
import { Stat } from "@/components/simula/stat";
import { WalkForward } from "@/components/simula/walk-forward";
import { EUR, formatDateTime, frNum, signedR } from "@/lib/format";
import { useSim } from "@/lib/store";

export function ResultsPanel() {
  const resume = useSim((s) => s.resume);
  const segs = useSim((s) => s.segs);
  const courbe = useSim((s) => s.courbe);
  const trades = useSim((s) => s.trades);
  const erreur = useSim((s) => s.erreur);
  const settings = useSim((s) => s.settings);
  const sauver = useSim((s) => s.sauverBacktest);
  const extras = useSim((s) => s.extras);
  const series = useSim((s) => s.series);
  const df = series[settings.symbol];
  const euroR = (settings.capital * settings.risquePct) / 100;

  if (erreur) {
    return (
      <Blueprint className="p-6">
        <p className="text-sm text-down">{erreur}</p>
      </Blueprint>
    );
  }

  if (!resume) {
    return (
      <Blueprint className="p-6">
        <p className="text-sm text-muted">Calcul en cours…</p>
      </Blueprint>
    );
  }

  const tone = resume.total >= 0 ? "up" : "down";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="kicker">Backtest · {settings.symbol}</div>
          <h2 className="mt-1 font-display text-3xl">D’abord le verdict, ensuite la courbe</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={sauver}>
          <Bookmark className="size-3.5" />
          Sauver dans le journal
        </Button>
      </div>

      <ControlesPanel />

      <Blueprint className="p-6">
        <WalkForward segs={segs} />
      </Blueprint>

      <Blueprint className="p-6">
        <PriceChart df={df} trades={trades} segs={segs} />
      </Blueprint>

      <Blueprint className="flex flex-col gap-6 p-6">
        <div>
          <div className="kicker">Courbe cumulée en R</div>
          <p className="text-xs text-muted">Le total, lu après les tranches — pas avant.</p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="R total" value={signedR(resume.total, 1)} tone={tone} />
          <Stat
            label="Pire creux"
            value={signedR(resume.dd, 1)}
            tone="down"
            hint={EUR.format(Math.abs(resume.dd) * euroR)}
          />
          <Stat label="Trades" value={String(resume.n)} hint={`${frNum(resume.winRate, 0)} % gagnants`} />
          <Stat
            label="R / an"
            value={signedR(resume.rAn, 1)}
            hint={
              extras
                ? `Hors échantillon ${signedR(extras.oos, 1)} · tenue ${Math.round(extras.tenue)} %`
                : `Profit factor ${resume.pf === Infinity ? "∞" : frNum(resume.pf, 2)}`
            }
          />
        </div>
        <EquityChart data={courbe} />
      </Blueprint>

      <RobustessePanel />

      <Blueprint className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="kicker">Journal des trades</div>
          <div className="text-xs text-muted">{trades.length} sorties</div>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Entrée</th>
                <th className="px-4 py-2 text-right font-medium">R net</th>
                <th className="px-4 py-2 text-right font-medium">Sortie</th>
                <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Bars</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(-80).reverse().map((t, i) => {
                const r = t.R_net ?? t.R;
                return (
                  <tr key={`${t.entree_t}-${i}`} className="border-t border-line/70">
                    <td className="px-4 py-2 text-xs">{formatDateTime(t.entree_t)}</td>
                    <td className={`px-4 py-2 text-right tabular ${r >= 0 ? "text-up" : "text-down"}`}>
                      {r >= 0 ? "+" : "−"} {Math.abs(r).toFixed(2).replace(".", ",")}
                    </td>
                    <td className="px-4 py-2 text-right text-xs uppercase text-muted">{t.motif}</td>
                    <td className="hidden px-4 py-2 text-right tabular text-xs text-muted sm:table-cell">
                      {t.bougies}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Blueprint>
    </div>
  );
}
