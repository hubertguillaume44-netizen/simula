import { createFileRoute, Link } from "@tanstack/react-router";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/")({ component: Home });

// ————— L'ORDRE DES QUESTIONS, PAS L'ORDRE DU PRODUIT —————
//
// La page s'ouvrait sur trois cadres qui menaient à trois ARTICLES : on demandait à
// quelqu'un qui venait d'arriver de lire trois essais avant de savoir si l'outil le
// concernait. Quatre choses manquaient, et ce sont les quatre qu'on cherche avant
// d'essayer quoi que ce soit :
//
//   · ce que ça fait, sans jargon — « exports horaires » ne veut rien dire à qui n'a
//     jamais exporté de MetaTrader ;
//   · À QUI ça s'adresse — il faut MetaTrader 5, et le taire jusqu'à l'achat est une
//     déception programmée ;
//   · ce que ça coûte — le prix existait, mais DANS l'application, derrière le bouton :
//     il fallait entrer dans le produit pour apprendre son tarif ;
//   · ce qu'on risque à essayer — trois instruments gratuits, sans limite de durée,
//     était le meilleur argument de la maison et il n'était écrit nulle part.
//
// Les trois articles descendent en bas. Ils ne sont pas retirés : ils répondent à la
// question « pourquoi vous croire », qui vient APRÈS « c'est quoi » et « c'est combien ».
function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-16 md:px-8 md:py-24">
        <h1 className="max-w-[22ch] font-display text-5xl leading-none tracking-tight md:text-7xl">
          Testez une règle avant d’y mettre un euro.
        </h1>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink/80">
          Vous avez une règle d’entrée et de sortie. Véna la rejoue sur vos propres historiques de
          prix, frais de votre courtier compris, et vous dit ce qu’elle aurait donné — puis ce qu’il
          en reste une fois retirée la période qui l’a fait bien paraître.
        </p>
        <p className="mt-3 max-w-prose text-sm text-muted">
          Il ne prédit rien et ne passe aucun ordre. Il mesure, et il dit à quel point le chiffre
          est fragile.
        </p>

        {/* CE QU'IL VOUS FAUT, AVANT L'ACHAT. Un client sur cTrader qui l'apprend après
            avoir payé est un remboursement et une mauvaise histoire. */}
        <Blueprint className="mt-10 flex flex-col gap-3 p-6">
          <div className="kicker">Ce qu’il vous faut</div>
          <p className="max-w-prose text-base leading-relaxed">
            <strong>MetaTrader 5</strong> chez votre courtier — c’est la seule plateforme que Véna
            lit. Elle vous fait installer deux scripts, une fois, qui produisent les fichiers : vos
            prix horaires et votre relevé de frais. Glisser un script sur un graphique, puis déposer
            les fichiers ici. Aucune programmation.
          </p>
          <p className="max-w-prose text-sm text-muted">
            Ni cTrader, ni TradingView, ni relevé au format maison. Mieux vaut le savoir maintenant
            qu’après avoir payé.
          </p>
        </Blueprint>

        {/* CE QUI SE PASSE, EN TROIS GESTES. Le numéro est une information : c'est une
            séquence, chacun a besoin du précédent. */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "1",
              t: "Vous déposez",
              b: "Vos bougies horaires et votre relevé de frais, exportés de MetaTrader 5. Ils restent dans votre navigateur — ils ne sont jamais envoyés nulle part.",
            },
            {
              n: "2",
              t: "Véna mesure",
              b: "Il balaie des milliers de variantes de votre règle, découpe chaque résultat en cinq périodes, et compare au hasard pour savoir si le meilleur chiffre vaut mieux qu’un tirage chanceux.",
            },
            {
              n: "3",
              t: "Vous décidez",
              b: "Le coût réel est compté : spread, portage, commission. Ce qui survit à la période retirée est ce sur quoi vous pouvez vous engager. Le reste est écarté, et dit comme tel.",
            },
          ].map((e) => (
            <Blueprint key={e.n} className="flex h-full flex-col gap-3 p-6">
              <div className="font-display text-3xl leading-none text-steel">{e.n}</div>
              <div className="font-display text-2xl">{e.t}</div>
              <p className="text-sm leading-relaxed text-muted">{e.b}</p>
            </Blueprint>
          ))}
        </div>

        {/* LE PRIX. Il vivait dans l'application : il fallait entrer dans le produit pour
            apprendre combien il coûte. Le palier gratuit vient EN PREMIER — c'est lui qui
            décide si quelqu'un essaie. */}
        <Blueprint className="mt-10 flex flex-col gap-6 p-6 md:p-8">
          <div className="kicker">Ce que ça coûte</div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <div className="font-display text-4xl leading-none">Gratuit</div>
              <div className="text-sm font-medium">Trois instruments à vous</div>
              <p className="text-sm text-muted">
                Sans limite de durée, sans compte à créer. Le moteur entier, sur vos vrais fichiers.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="font-display text-4xl leading-none">
                14,99 € <span className="text-xl text-muted">/ mois</span>
              </div>
              <div className="text-sm font-medium">Tous vos instruments</div>
              <p className="text-sm text-muted">
                Tout ce que votre courtier exporte, sans plafond. Résiliable à tout moment.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="font-display text-4xl leading-none">
                149 € <span className="text-xl text-muted">/ an</span>
              </div>
              <div className="text-sm font-medium">Soit 12,42 € par mois</div>
              <p className="text-sm text-muted">
                Quatorze jours pour changer d’avis, sans justification — c’est votre droit de
                rétractation.
              </p>
            </div>
          </div>
          <p className="max-w-prose text-sm text-muted">
            Une clé s’achète une fois et se colle dans l’application : pas de compte, rien n’est
            conservé sur vous, pas même votre achat. Elle se vérifie hors ligne.
          </p>
        </Blueprint>

        <div className="mt-10 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Le bouton d'entrée ouvre l'APPLICATION — cinq pages, le moteur complet,
                vos données. Il menait à la démonstration, qui ne peut pas la remplacer. */}
            <Button asChild>
              <a href="/app">Commencer — trois instruments gratuits</a>
            </Button>
            <Link to="/tarifs" className="text-sm underline decoration-line underline-offset-2">
              ou voir les tarifs
            </Link>
          </div>
          {/* LA DÉMONSTRATION EST DANS L'OUTIL. Le site en portait une seconde, en
              React, sur quatre séries : deux démonstrations à tenir à jour, et une de
              trop à choisir. Celle de l'application tourne sur le moteur entier — les
              séries d'exemple s'y ouvrent sans rien déposer. */}
          <p className="text-sm text-muted">
            Rien à fournir pour regarder : les séries de démonstration s’ouvrent dans l’outil, sur
            le même moteur que vos propres fichiers.
          </p>
        </div>

        {/* POURQUOI NOUS CROIRE — la question d'après. Les trois articles étaient en tête
            de page ; ils y demandaient un effort de lecture avant tout intérêt. */}
        <div className="mt-16 flex flex-col gap-6">
          <div className="kicker">Pour aller plus loin</div>
          <div className="grid gap-6 md:grid-cols-2">
            <Link to="/methode" className="no-underline text-ink">
              <Blueprint className="flex h-full flex-col gap-2 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
                <div className="font-display text-xl">
                  Votre backtest est probablement faux
                </div>
                <p className="text-sm text-muted">
                  Les pièges qui fabriquent de belles courbes, le test en cinq tranches qui les
                  démasque, et le tableau qui le montre.
                </p>
              </Blueprint>
            </Link>
            <Link to="/tarifs" className="no-underline text-ink">
              <Blueprint className="flex h-full flex-col gap-2 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
                <div className="font-display text-xl">Ce que ça coûte, en détail</div>
                <p className="text-sm text-muted">
                  Le comparatif des trois formules, et les six questions qu’on pose avant de payer.
                </p>
              </Blueprint>
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
