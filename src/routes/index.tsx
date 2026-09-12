import { createFileRoute, Link } from "@tanstack/react-router";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-16 md:px-8 md:py-24">
        <h1 className="max-w-[22ch] font-display text-5xl leading-none tracking-tight md:text-7xl">
          Testez une règle avant d’y mettre un euro.
        </h1>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink/80">
          Véna rejoue vos stratégies sur vos propres exports horaires, puis découpe l’historique
          pour vérifier si le résultat tient hors de la période où il a été trouvé.
        </p>
        <p className="mt-3 max-w-prose text-sm text-muted">
          Rien à installer, aucun compte. Vos fichiers restent dans votre navigateur : ils ne sont
          jamais envoyés.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Link to="/simuler" className="no-underline text-ink">
            <Blueprint className="flex h-full flex-col gap-3 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
              <div className="kicker">Démonstration</div>
              <div className="font-display text-2xl">Scan, backtest et journal</div>
              <p className="text-sm text-muted">
                Quatre instruments d’exemple, pour voir comment l’outil raisonne. Vos propres
                exports horaires s’ouvrent dans l’application.
              </p>
            </Blueprint>
          </Link>
          <Link to="/methode" className="no-underline text-ink">
            <Blueprint className="flex h-full flex-col gap-3 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
              <div className="kicker">Lire</div>
              <div className="font-display text-2xl">
                Pourquoi un backtest brillant échoue en réel
              </div>
              <p className="text-sm text-muted">
                Les cinq pièges qui fabriquent de belles courbes, et le test en cinq tranches qui
                les démasque.
              </p>
            </Blueprint>
          </Link>
          <Link to="/pourquoi" className="no-underline text-ink md:col-span-2">
            <Blueprint className="flex h-full flex-col gap-3 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
              <div className="kicker">Comprendre</div>
              <div className="font-display text-2xl">Pourquoi ce tri change tout</div>
              <p className="text-sm text-muted">
                La démonstration en un tableau : le meilleur chiffre est souvent le moins fiable.
              </p>
            </Blueprint>
          </Link>
        </div>
        <div className="mt-10">
          {/* Le bouton d'entrée ouvre l'APPLICATION — cinq pages, le moteur complet,
              vos données. Il menait à la démonstration, qui ne peut pas la remplacer. */}
          <Button asChild>
            <a href="/app">Ouvrir mon outil</a>
          </Button>
          <p className="mt-3 text-sm text-muted">
            Pas encore de données ?{" "}
            <Link to="/simuler" className="underline decoration-line underline-offset-2">
              voir la démonstration
            </Link>{" "}
            — quatre séries d’exemple, pour montrer le raisonnement.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
