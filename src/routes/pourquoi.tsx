import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { computePreuve, type PreuveRow } from "@/lib/preuve";
import { frNum, signedR } from "@/lib/format";

export const Route = createFileRoute("/pourquoi")({ component: Pourquoi });

function Pourquoi() {
  const [rows, setRows] = useState<PreuveRow[] | null>(null);
  useEffect(() => {
    setRows(computePreuve());
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />
      <section className="mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <p className="kicker">La démonstration</p>
        <h1 className="mt-3 max-w-[18ch] font-display text-5xl leading-none md:text-7xl">
          Votre backtest est probablement faux.
        </h1>
        <p className="mt-6 max-w-prose text-lg text-ink/80">
          Balayez assez de réglages et vous trouverez toujours une courbe qui monte. Simula
          fait l’inverse du reste du marché : il calcule cette courbe, puis vous dit pourquoi
          il ne faut pas y croire.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/simuler">Ouvrir le simulateur</Link>
          </Button>
        </div>
      </section>

      <section className="bg-steel-ink text-panel">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-16 md:px-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-panel/70">
              Cinq configurations, un même moteur
            </div>
            <h2 className="mt-2 font-display text-3xl text-panel md:text-4xl">
              Le meilleur résultat est le moins fiable
            </h2>
            <p className="mt-3 max-w-prose text-panel/80">
              Classées par performance brute. La colonne des tranches découpe l’historique et
              compte celles qui restent gagnantes. Lisez-la avant tout le reste.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-panel/60">
                <tr className="border-b border-panel/20">
                  <th className="py-2 pr-3 text-left font-medium">Instrument</th>
                  <th className="px-3 py-2 text-right font-medium">Trades</th>
                  <th className="px-3 py-2 text-right font-medium">R total</th>
                  <th className="px-3 py-2 text-right font-medium">Pire creux</th>
                  <th className="px-3 py-2 text-right font-medium">Tranches</th>
                  <th className="py-2 pl-3 text-left font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  ? rows.map((r) => (
                      <tr key={`${r.sym}-${r.periode}-${r.sl}`} className="border-b border-panel/15">
                        <td className="py-3 pr-3 font-medium">
                          {r.sym}
                          <span className="ml-2 text-xs text-panel/50">
                            P{r.periode} · SL {frNum(r.sl, 1)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular">{r.n}</td>
                        <td className="px-3 py-3 text-right tabular">{signedR(r.total, 1)}</td>
                        <td className="px-3 py-3 text-right tabular">{signedR(r.dd, 1)}</td>
                        <td className="px-3 py-3 text-right tabular">
                          {r.positifs} / {r.segTotal}
                        </td>
                        <td
                          className={
                            r.tone === "up"
                              ? "py-3 pl-3 text-up-soft"
                              : r.tone === "down"
                                ? "py-3 pl-3 text-down-soft"
                                : "py-3 pl-3 text-warn-soft"
                          }
                        >
                          {r.verdict}
                        </td>
                      </tr>
                    ))
                  : Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-panel/15">
                        <td className="py-3 text-panel/50">Calcul…</td>
                        <td />
                        <td />
                        <td />
                        <td />
                        <td />
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <p className="max-w-prose text-panel/80">
            Un outil de vente mettrait la première ligne en avant. Simula l’écarte si elle ne
            tient pas hors période — et garde une ligne moins spectaculaire qui gagne dans
            plusieurs tranches.
          </p>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-16 md:grid-cols-3 md:px-8">
        {[
          {
            n: "01",
            t: "Une stratégie est une configuration",
            b: "Pas une ligne de code. Vous choisissez l’entrée, la ligne, les filtres, le stop et l’objectif — le moteur s’occupe du reste, à l’identique d’un test à l’autre.",
          },
          {
            n: "02",
            t: "Le creux avant le gain",
            b: "Chaque résultat annonce la perte que vous auriez dû traverser sans changer d’avis, convertie en euros sur votre capital. C’est le chiffre qui décide, pas le total.",
          },
          {
            n: "03",
            t: "Vos données, vos règles",
            b: "Exports H1, frais saisis, session normalisée. Les séries de démonstration sont générées ici. Vos fichiers ne quittent jamais l’appareil.",
          },
        ].map((c) => (
          <Blueprint key={c.n} className="flex flex-col gap-3 p-6">
            <div className="kicker">{c.n}</div>
            <h3 className="font-display text-xl">{c.t}</h3>
            <p className="text-sm text-muted">{c.b}</p>
          </Blueprint>
        ))}
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 md:grid-cols-2 md:px-8">
          <div>
            <h3 className="font-display text-3xl">Ce que Simula ne fait pas</h3>
            <div className="mt-5 flex flex-col text-sm leading-relaxed">
              {[
                "Aucun signal d’achat. Le moteur teste des règles, il ne vous dit pas quoi acheter aujourd’hui.",
                "Aucune promesse de rendement. Les résultats passés d’une règle ne sont pas un revenu futur.",
                "Aucune gestion de votre argent. Vous gardez vos comptes, vos ordres et vos décisions.",
                "Aucun classement flatteur. Une configuration qui ne tient pas hors période est marquée comme telle, même si elle affiche le meilleur chiffre.",
              ].map((t) => (
                <div key={t} className="border-t border-line py-4">
                  {t}
                </div>
              ))}
            </div>
          </div>
          <Blueprint className="flex flex-col gap-4 p-7">
            <div className="kicker">Accès immédiat</div>
            <h4 className="font-display text-2xl">Testez une de vos propres stratégies</h4>
            <p className="text-sm text-muted">
              Quatre instruments de démonstration, puis vos exports horaires en glisser-déposer.
              Pas de liste d’attente. Pas de compte.
            </p>
            <Button asChild className="self-start">
              <Link to="/simuler">Commencer avec les démos</Link>
            </Button>
          </Blueprint>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
