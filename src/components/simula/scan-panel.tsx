import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { Field, NumberInput } from "@/components/simula/fields";
import { frNum, signedR } from "@/lib/format";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ScanPanel() {
  const instruments = useSim((s) => s.instruments);
  const univers = useSim((s) => s.univers);
  const setUnivers = useSim((s) => s.setUnivers);
  const gPeriodes = useSim((s) => s.gPeriodes);
  const gSls = useSim((s) => s.gSls);
  const gRrs = useSim((s) => s.gRrs);
  const tradesMin = useSim((s) => s.tradesMin);
  const segMin = useSim((s) => s.segMin);
  const setGrid = useSim((s) => s.setGrid);
  const lancer = useSim((s) => s.lancerScan);
  const scanning = useSim((s) => s.scanning);
  const progress = useSim((s) => s.scanProgress);
  const scan = useSim((s) => s.scan);
  const fiche = useSim((s) => s.scanFiche);
  const scanTestes = useSim((s) => s.scanTestes);
  const apply = useSim((s) => s.applyScanRow);
  const sauver = useSim((s) => s.sauverScan);
  const tri = useSim((s) => s.tri);

  const sorted = (scan ?? []).slice().sort((a, b) => {
    if (tri === "dd") return a.dd - b.dd;
    if (tri === "positifs") return b.positifs - a.positifs || b.total - a.total;
    if (tri === "pf") return b.pf - a.pf;
    if (tri === "ok") return b.ok - a.ok || b.total - a.total;
    return b.total - a.total;
  });
  const retenues = sorted.filter((r) => r.ok >= 4);

  return (
    <div className="flex flex-col gap-6">
      <Blueprint className="flex flex-col gap-5 p-6">
        <div>
          <div className="kicker">Grille + walk-forward</div>
          <h2 className="mt-1 font-display text-3xl">Balayez, puis lisez l’état</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Classées par R total, mais lisez d’abord les cinq contrôles : c’est eux qui
            distinguent une méthode d’un hasard.
          </p>
        </div>
        <div>
          <div className="field-label">Univers</div>
          <div className="flex flex-wrap gap-2">
            {instruments.map((i) => {
              const on = univers.includes(i.id);
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() =>
                    setUnivers(on ? univers.filter((x) => x !== i.id) : [...univers, i.id])
                  }
                  className={cn(
                    "min-h-9 border px-3 text-xs",
                    on ? "border-steel bg-steel text-panel" : "border-line text-ink",
                  )}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Périodes">
            <input
              className="input-plain"
              value={gPeriodes}
              onChange={(e) => setGrid({ gPeriodes: e.target.value })}
            />
          </Field>
          <Field label="Stops (%)">
            <input
              className="input-plain"
              value={gSls}
              onChange={(e) => setGrid({ gSls: e.target.value })}
            />
          </Field>
          <Field label="R/R">
            <input
              className="input-plain"
              value={gRrs}
              onChange={(e) => setGrid({ gRrs: e.target.value })}
            />
          </Field>
          <Field label="Trades min.">
            <NumberInput
              value={tradesMin}
              onChange={(e) => setGrid({ tradesMin: Number(e.target.value) })}
            />
          </Field>
          <Field label="Tranches min.">
            <NumberInput
              value={segMin}
              min={1}
              max={5}
              onChange={(e) => setGrid({ segMin: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void lancer()} disabled={scanning || univers.length === 0}>
            {scanning ? "Scan en cours…" : "Lancer le scan"}
          </Button>
          {scan ? (
            <>
              <Button variant="secondary" onClick={sauver}>
                Sauver les retenues
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const lines = [
                    "instrument,periode,sl,rr,n,total,dd,tranches,etat",
                    ...sorted.map(
                      (r) =>
                        `${r.sym},${r.periode},${r.sl},${r.rr},${r.n},${r.total.toFixed(2)},${r.dd.toFixed(2)},${r.positifs}/${r.segTotal},${r.etat}`,
                    ),
                  ];
                  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "simula-top.csv";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Exporter le TOP
              </Button>
            </>
          ) : null}
          {progress ? <span className="text-xs text-muted">{progress}</span> : null}
        </div>
      </Blueprint>

      {fiche ? (
        <p className="text-xs text-muted">
          {fiche.entree} · {fiche.ligne} · {fiche.ut} · {fiche.grille} · {scanTestes} tests ·{" "}
          {retenues.length} avec au moins 4 contrôles
        </p>
      ) : null}

      {scan ? (
        <Blueprint className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="kicker">Résultats</div>
            <label className="flex items-center gap-2 text-xs text-muted">
              Trier
              <select
                className="input-plain min-h-9 py-1 text-ink"
                value={tri}
                onChange={(e) =>
                  setGrid({ tri: e.target.value as "total" | "dd" | "positifs" | "pf" | "ok" })
                }
              >
                <option value="total">R total</option>
                <option value="ok">Contrôles</option>
                <option value="positifs">Tranches</option>
                <option value="dd">Creux</option>
                <option value="pf">Profit factor</option>
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Instrument</th>
                  <th className="px-3 py-2 text-right font-medium">P</th>
                  <th className="px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 text-right font-medium">R/R</th>
                  <th className="px-3 py-2 text-right font-medium">N</th>
                  <th className="px-3 py-2 text-right font-medium">R total</th>
                  <th className="px-3 py-2 text-right font-medium">Creux</th>
                  <th className="px-3 py-2 text-right font-medium">Tranches</th>
                  <th className="px-3 py-2 text-left font-medium">État</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 40).map((r, i) => {
                  return (
                    <tr
                      key={`${r.sym}-${r.periode}-${r.sl}-${r.rr}-${i}`}
                      className="cursor-pointer border-t border-line/70 hover:bg-ink/5"
                      onClick={() => apply(r)}
                    >
                      <td className="px-3 py-2 font-medium">{r.sym}</td>
                      <td className="px-3 py-2 text-right tabular">{r.periode}</td>
                      <td className="px-3 py-2 text-right tabular">{frNum(r.sl, 1)}</td>
                      <td className="px-3 py-2 text-right tabular">{frNum(r.rr, 1)}</td>
                      <td className="px-3 py-2 text-right tabular">{r.n}</td>
                      <td className="px-3 py-2 text-right tabular">{signedR(r.total, 1)}</td>
                      <td className="px-3 py-2 text-right tabular text-down">{signedR(r.dd, 1)}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {r.positifs} / {r.segTotal}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-xs",
                          r.ok === 5 && "text-up",
                          r.ok === 4 && "text-warn",
                          r.ok < 4 && "text-down",
                        )}
                      >
                        {r.etat}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            Cliquez une ligne pour l’ouvrir en backtest. Le tri par R total met le bruit en haut —
            c’est volontaire.
          </p>
        </Blueprint>
      ) : (
        <p className="text-sm text-muted">Aucun scan pour l’instant. Lancez-en un sur les démos.</p>
      )}
    </div>
  );
}
