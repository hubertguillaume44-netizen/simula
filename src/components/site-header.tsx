import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { VenaMark } from "@/components/vena-mark";

const LINKS = [
  { to: "/", label: "Accueil" },
  { to: "/methode", label: "Méthode" },
  { to: "/pourquoi", label: "Pourquoi" },
  // « Démonstration » et non « Simulateur » : cette page montre le raisonnement sur des
  // séries d'exemple. Le produit s'ouvre par le bouton, à droite.
  { to: "/simuler", label: "Démonstration" },
] as const;

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div
        className={cn(
          "mx-auto flex items-center gap-4 px-5 py-3 md:px-8",
          compact ? "max-w-[1480px]" : "max-w-6xl",
        )}
      >
        {/* `items-center` et non `items-baseline` : un signe géométrique s'aligne sur
            l'axe optique du mot, pas sur sa ligne de pied — sinon il flotte au-dessus.
            `shrink-0` sur le signe ET sur le mot : à l'étroit, c'est la ligne
            « Simulateur de stratégies trading » qui cède, jamais la marque. */}
        <Link
          to="/"
          aria-label="Véna — accueil"
          className="mr-auto flex items-center gap-3 no-underline text-ink"
        >
          <VenaMark taille="lg" className="h-6 w-6 shrink-0" />
          <span className="shrink-0 font-display text-lg font-semibold tracking-wide">VÉNA</span>
          <span className="hidden text-[11px] uppercase tracking-[0.14em] text-muted sm:inline">
            Simulateur de stratégies trading
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-4">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "hidden px-2 py-2 text-sm no-underline sm:inline",
                pathname === l.to ? "text-steel" : "text-ink hover:text-steel",
              )}
            >
              {l.label}
            </Link>
          ))}
          {/* L'APPLICATION, PAS LA VITRINE. `/app` sert Vena.solo.html tel quel : un
              fichier unique, hors du routeur du site — d'où un <a> et non un <Link>,
              qui tenterait une navigation interne vers une route qui n'existe pas.
              C'est ce bouton qu'un client qui a payé va chercher. */}
          <a
            href="/app"
            className="inline-flex min-h-11 items-center bg-steel px-4 font-display text-sm font-semibold tracking-wide text-panel no-underline hover:bg-steel-ink"
          >
            Ouvrir mon outil
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-5 py-8 text-center text-xs text-muted md:px-8">
      Véna — simulateur de stratégies trading. Outil d’analyse, ni conseil en
      investissement ni service de gestion. Le trading fait perdre de l’argent à la majorité
      de ceux qui s’y essaient.{" "}
      <Link to="/visiteurs" className="text-ink/70 underline decoration-line underline-offset-2">
        Fréquentation
      </Link>
    </footer>
  );
}
