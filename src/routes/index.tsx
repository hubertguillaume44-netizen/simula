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
          Simula rejoue vos stratégies sur vos propres exports horaires, puis découpe
          l’historique pour vérifier si le résultat tient hors de la période où il a été
          trouvé.
        </p>
        <p className="mt-3 max-w-prose text-sm text-muted">
          Rien à installer, aucun compte. Vos fichiers restent dans votre navigateur : ils ne
          sont jamais envoyés.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Link to="/simuler" className="no-underline text-ink">
            <Blueprint className="flex h-full flex-col gap-3 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
              <div className="kicker">Essayer</div>
              <div className="font-display text-2xl">Scan, backtest et journal</div>
              <p className="text-sm text-muted">
                Quatre instruments de démonstration pour commencer, puis vos propres exports
                horaires en glisser-déposer.
              </p>
            </Blueprint>
          </Link>
          <Link to="/methode" className="no-underline text-ink">
            <Blueprint className="flex h-full flex-col gap-3 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
              <div className="kicker">Lire</div>
              <div className="font-display text-2xl">Pourquoi un backtest brillant échoue en réel</div>
              <p className="text-sm text-muted">
                Les cinq pièges qui fabriquent de belles courbes, et le test en cinq tranches
                qui les démasque.
              </p>
            </Blueprint>
          </Link>
          <Link to="/pourquoi" className="no-underline text-ink md:col-span-2">
            <Blueprint className="flex h-full flex-col gap-3 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
              <div className="kicker">Comprendre</div>
              <div className="font-display text-2xl">Pourquoi ce tri change tout</div>
              <p className="text-sm text-muted">
                La démonstration en un tableau : le meilleur chiffre est souvent le moins
                fiable.
              </p>
            </Blueprint>
          </Link>
        </div>
        <div className="mt-10">
          <Button asChild>
            <Link to="/simuler">Ouvrir le simulateur</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
