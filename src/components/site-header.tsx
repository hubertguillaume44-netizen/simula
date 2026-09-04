import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", label: "Accueil" },
  { to: "/methode", label: "Méthode" },
  { to: "/pourquoi", label: "La démonstration" },
  { to: "/simuler", label: "Simulateur" },
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
        <Link to="/" className="mr-auto flex items-baseline gap-3 no-underline text-ink">
          <span className="font-display text-lg font-semibold tracking-wide">SIMULA</span>
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
          <Link
            to="/simuler"
            className="inline-flex min-h-11 items-center bg-steel px-4 font-display text-sm font-semibold tracking-wide text-panel no-underline hover:bg-steel-ink"
          >
            Essayer
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-5 py-8 text-center text-xs text-muted md:px-8">
      Simula — simulateur de stratégies trading. Outil d’analyse, ni conseil en
      investissement ni service de gestion. Le trading fait perdre de l’argent à la majorité
      de ceux qui s’y essaient.{" "}
      <Link to="/visiteurs" className="text-ink/70 underline decoration-line underline-offset-2">
        Fréquentation
      </Link>
    </footer>
  );
}
