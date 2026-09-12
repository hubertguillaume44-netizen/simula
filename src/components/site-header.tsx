import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { VenaMark, palierPour } from "@/components/vena-mark";

// ————— TROIS ENTRÉES, ET LE BOUTON —————
//
// Il y en avait quatre pour cinq pages, dont deux jumelles. « Méthode » et
// « Pourquoi » défendaient la même thèse sous deux titres commençant tous deux par
// « pourquoi » : rien dans le bandeau ne permettait de les distinguer, et choisir
// entre elles demandait de les avoir déjà lues. Elles fondent en une.
//
// « Démonstration » menait à une seconde démonstration, en React, à côté de celle que
// l'application porte déjà avec le moteur entier. Deux démonstrations, c'est une de
// trop à tenir à jour et une de trop à choisir.
//
// « Tarifs » prend la place libérée : c'est la question qu'un visiteur se pose après
// « c'est quoi », et aucune entrée n'y menait.
const LINKS = [
  { to: "/", label: "Accueil" },
  { to: "/methode", label: "Méthode" },
  { to: "/tarifs", label: "Tarifs" },
] as const;

// ————— L'ACCENT VA À L'ACTION PRINCIPALE DE LA PAGE —————
//
// Dans le bandeau, « Ouvrir mon outil » est l'action principale par DÉFAUT : sur une
// page qui n'en a pas de plus forte, c'est le seul geste possible, et il porte le fond
// plein. Mais une page peut en avoir une plus forte — les Tarifs ont « Prendre
// l'année » — et deux boutons pleins sur un même écran ne désignent plus rien : l'œil
// ne sait plus lequel est LE geste.
//
// La page le dit alors elle-même, par `accentEntree={false}`, et l'entrée passe en
// filet. Une règle, pas une exception : l'accent cède à qui en a un meilleur usage.
export function SiteHeader({
  compact = false,
  accentEntree = true,
}: {
  compact?: boolean;
  accentEntree?: boolean;
}) {
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
          className="mr-auto flex min-w-0 items-center gap-3 no-underline text-ink"
        >
          {/* le palier vient de la RÈGLE, pas d'un littéral : `h-6 w-6` rend le signe
              à 24 px, et `palierPour(24)` répond `md`. Écrire « lg » ici, comme je
              l'avais fait, contredisait la règle du composant — à 24 px le jambage
              fin du palier `lg` fait 1,44 px et grisonne hors écran retina. */}
          <VenaMark taille={palierPour(24)} className="h-6 w-6 shrink-0" />
          <span className="shrink-0 font-display text-lg font-semibold tracking-wide">VÉNA</span>
          <span className="hidden min-w-0 truncate text-[11px] uppercase tracking-[0.14em] text-muted sm:inline">
            Simulateur de stratégies trading
          </span>
        </Link>
        {/* `shrink-0` : quand la place manque, c'est le bloc de marque qui rend du
            terrain — donc l'accroche, seule chose tronquable de la rangée. Sans lui, le
            navigateur répartit le manque entre les deux blocs et pousse le bouton hors
            de l'écran. */}
        <nav className="flex shrink-0 items-center gap-1 sm:gap-4">
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
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center px-4 font-display text-sm font-semibold tracking-wide no-underline",
              accentEntree
                ? "bg-steel text-panel hover:bg-steel-ink"
                : "border border-line text-ink hover:bg-ink/5",
            )}
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
