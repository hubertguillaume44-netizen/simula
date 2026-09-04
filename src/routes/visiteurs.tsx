import { createFileRoute } from "@tanstack/react-router";
import { Blueprint } from "@/components/blueprint";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Stat } from "@/components/simula/stat";
import { visitStats } from "@/lib/visits";

export const Route = createFileRoute("/visiteurs")({
  loader: () => visitStats(),
  component: Visiteurs,
});

const PAYS: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  CA: "Canada",
  LU: "Luxembourg",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  GB: "Royaume-Uni",
  US: "États-Unis",
  NL: "Pays-Bas",
  PT: "Portugal",
  MA: "Maroc",
  SN: "Sénégal",
  CI: "Côte d’Ivoire",
  RE: "La Réunion",
  GP: "Guadeloupe",
  MQ: "Martinique",
};

function labelPays(c: string) {
  if (!c) return "Inconnu";
  return PAYS[c] ?? c;
}

function labelOrigine(r: string) {
  if (!r) return "Direct (barre d’adresse ou favori)";
  return r;
}

function labelPage(p: string) {
  if (p === "/") return "Accueil";
  if (p === "/simuler") return "Simulateur";
  if (p === "/methode") return "Méthode";
  if (p === "/pourquoi") return "La démonstration";
  return p;
}

function Visiteurs() {
  const s = Route.useLoaderData();
  const maxJ = Math.max(...s.jours.map((j) => j.n), 1);

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-16 md:px-8 md:py-24">
        <div>
          <div className="kicker">Fréquentation</div>
          <h1 className="mt-2 font-display text-5xl leading-none">Qui ouvre Simula</h1>
          <p className="mt-4 max-w-prose text-sm text-muted">
            Pages vues et sessions dans cet onglet. Pas d’adresse IP, pas de nom. Le pays
            vient du réseau (code à deux lettres). Cette page n’est pas comptée.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Pages vues" value={String(s.vues)} />
          <Stat label="Sessions" value={String(s.sessions)} hint="un onglet ≈ une session" />
          <Stat label="7 derniers jours" value={String(s.vues7)} />
          <Stat label="24 heures" value={String(s.vuesJour)} />
        </div>

        <Blueprint className="p-6">
          <div className="kicker">14 jours</div>
          {s.jours.length ? (
            <div
              className="mt-4 grid gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(s.jours.length, 1)}, minmax(0, 1fr))` }}
            >
              {s.jours.map((j) => (
                <div key={j.jour} className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end bg-paper">
                    <div
                      className="w-full bg-steel"
                      style={{ height: `${Math.max(8, (j.n / maxJ) * 96)}px` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted">
                    {j.jour.slice(8)}/{j.jour.slice(5, 7)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Pas encore de visite enregistrée.</p>
          )}
        </Blueprint>

        <div className="grid gap-6 md:grid-cols-3">
          <Liste titre="Pages" rows={s.pages.map((r) => ({ k: labelPage(r.path), n: r.n }))} />
          <Liste
            titre="D’où ils viennent"
            rows={s.origines.map((r) => ({ k: labelOrigine(r.referrer), n: r.n }))}
          />
          <Liste titre="Pays" rows={s.pays.map((r) => ({ k: labelPays(r.country), n: r.n }))} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Liste({ titre, rows }: { titre: string; rows: Array<{ k: string; n: number }> }) {
  return (
    <Blueprint className="p-5">
      <div className="kicker">{titre}</div>
      {rows.length ? (
        <ul className="mt-3 flex flex-col">
          {rows.map((r) => (
            <li
              key={r.k}
              className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm"
            >
              <span>{r.k}</span>
              <span className="tabular text-muted">{r.n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Rien pour l’instant.</p>
      )}
    </Blueprint>
  );
}
