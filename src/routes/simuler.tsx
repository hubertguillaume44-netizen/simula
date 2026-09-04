import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConfigPanel } from "@/components/simula/config-panel";
import { Duo, DuoRevoir } from "@/components/simula/duo";
import { JournalPanel } from "@/components/simula/journal-panel";
import { ResultsPanel } from "@/components/simula/results-panel";
import { ScanPanel } from "@/components/simula/scan-panel";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Vue } from "@/lib/types";

export const Route = createFileRoute("/simuler")({ component: Simuler });

const TABS: { id: Vue; label: string }[] = [
  { id: "backtest", label: "Backtest" },
  { id: "scan", label: "Scan" },
  { id: "journal", label: "Journal" },
];

function Simuler() {
  const init = useSim((s) => s.init);
  const ready = useSim((s) => s.ready);
  const vue = useSim((s) => s.vue);
  const setVue = useSim((s) => s.setVue);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader compact />
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-2 px-5 pt-6 md:px-8">
        <div className="kicker">Simulateur</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl md:text-5xl">Testez une règle, pas une courbe.</h1>
            <p className="mt-2 max-w-prose text-sm text-muted">
              Version en ligne : quatre séries de démonstration. Version perso : glissez vos
              CSV H1 — ils restent ici, dans ce navigateur.
            </p>
            <div className="mt-2">
              <DuoRevoir />
            </div>
          </div>
          <div className="flex border border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setVue(t.id)}
                className={cn(
                  "min-h-11 px-4 text-sm",
                  vue === t.id ? "bg-steel text-panel" : "bg-panel text-ink hover:bg-ink/5",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-8 px-5 py-8 md:px-8">
        {!ready ? (
          <p className="text-sm text-muted">Préparation des séries de démonstration…</p>
        ) : vue === "scan" ? (
          <ScanPanel />
        ) : vue === "journal" ? (
          <JournalPanel />
        ) : (
          <>
            <Duo />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
              <ConfigPanel />
              <ResultsPanel />
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
