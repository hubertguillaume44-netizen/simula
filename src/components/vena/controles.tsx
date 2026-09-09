import { Blueprint } from "@/components/blueprint";
import { cn } from "@/lib/utils";
import { useSim } from "@/lib/store";
import { signedR } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function ControlesPanel() {
  const juge = useSim((s) => s.juge);
  const extras = useSim((s) => s.extras);
  if (!juge) return null;
  return (
    <Blueprint className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Cinq questions</div>
          <h3 className="font-display text-2xl">
            {juge.label}
            <span className="ml-2 text-base font-normal text-muted">
              {juge.ok} / 5
            </span>
          </h3>
        </div>
        {extras ? (
          <div className="text-xs text-muted">
            Frais {signedR(-extras.frais, 1)} R · série perdante max {extras.serie}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col">
        {juge.controles.map((c) => (
          <div key={c.nom} className="border-t border-line py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-display text-lg">{c.nom}</div>
              <span
                className={cn(
                  "text-xs",
                  c.ok === true && "text-up",
                  c.ok === false && "text-down",
                  c.ok === null && "text-muted",
                )}
              >
                {c.ok === true ? "Oui" : c.ok === false ? "Non" : "—"} · {c.valeur}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Attendu : {c.attendu}. {c.pourquoi}
            </p>
          </div>
        ))}
      </div>
    </Blueprint>
  );
}

export function RobustessePanel() {
  const tester = useSim((s) => s.testerRobustesse);
  const ailleurs = useSim((s) => s.testerAilleurs);
  const busy = useSim((s) => s.calculEnCours);
  const robuste = useSim((s) => s.robuste);
  const rows = useSim((s) => s.ailleurs);
  const settings = useSim((s) => s.settings);

  return (
    <Blueprint className="flex flex-col gap-5 p-6">
      <div>
        <div className="kicker">Voisinage et transfert</div>
        <h3 className="font-display text-2xl">Si le voisin s’effondre, ce n’est pas une méthode</h3>
        <p className="mt-2 text-sm text-muted">
          Robustesse : ±1 période et ±0,25 R d’objectif. Ailleurs : mêmes réglages sur les
          autres instruments.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => void tester()}
          disabled={busy === "robuste"}
        >
          {busy === "robuste" ? "Voisinage…" : "Tester la robustesse"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void ailleurs()}
          disabled={busy === "ailleurs"}
        >
          {busy === "ailleurs" ? "Comparaison…" : "Même règle ailleurs"}
        </Button>
      </div>
      {robuste ? (
        <div>
          <p className="mb-3 text-sm">
            {robuste.positifs} / {robuste.testes} voisins encore positifs · médiane{" "}
            {signedR(robuste.med, 1)} R (centre {signedR(robuste.centre, 1)})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {robuste.cases.map((c, i) =>
              c ? (
                <div
                  key={i}
                  className={cn(
                    "border border-line px-3 py-2 text-xs",
                    c.centre && "border-steel bg-steel-soft/40",
                  )}
                >
                  <div className="text-muted">
                    P{c.p} · R/R {String(c.rr).replace(".", ",")}
                  </div>
                  <div
                    className={cn(
                      "tabular font-medium",
                      (c.total ?? 0) >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {c.total == null ? "—" : signedR(c.total, 1)}
                  </div>
                </div>
              ) : (
                <div key={i} className="border border-line px-3 py-2 text-xs text-muted">
                  —
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}
      {rows ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 text-left font-medium">Instrument</th>
                <th className="py-2 text-right font-medium">R</th>
                <th className="py-2 text-right font-medium">Tranches</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <td className="py-2 font-medium">{settings.symbol} (ici)</td>
                <td className="py-2 text-right tabular text-muted">référence</td>
                <td />
              </tr>
              {rows.map((r) => (
                <tr key={r.sym} className="border-t border-line/70">
                  <td className="py-2">{r.sym}</td>
                  <td
                    className={cn(
                      "py-2 text-right tabular",
                      (r.total ?? 0) >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {r.total == null ? "—" : signedR(r.total, 1)}
                  </td>
                  <td className="py-2 text-right tabular">
                    {r.n ? `${r.positifs} / ${r.segTotal}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Blueprint>
  );
}
