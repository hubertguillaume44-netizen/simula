import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { computePreuve, type PreuveRow } from "@/lib/preuve";
import { frNum, signedR } from "@/lib/format";

export const Route = createFileRoute("/methode")({
  // Le titre et la description sont PROPRES À CETTE PAGE. La racine en pose un
  // jeu par défaut ; sans ce bloc, les pages du site portaient le même, et deux
  // onglets ouverts devenaient indiscernables — Google, lui, réécrit les titres
  // dupliqués, et c'est alors sa formulation qui s'affiche, plus la nôtre.
  head: () => ({
    meta: [
      { title: "La méthode : cinq périodes, hors échantillon — Véna" },
      {
        name: "description",
        content:
          "Comment Véna découpe un historique en cinq périodes, retire celle qui a servi à choisir la configuration, et ce que les quatre pièges classiques coûtent en R.",
      },
    ],
  }),
  component: Methode,
});

// ————— UNE SEULE PAGE, PARCE QU'IL N'Y AVAIT QU'UNE SEULE THÈSE —————
//
// « Méthode » et « Pourquoi » défendaient le même argument sous deux titres qui
// commençaient tous deux par « pourquoi ». Deux entrées de bandeau qu'on ne pouvait pas
// distinguer sans les avoir déjà lues — et, séparés, chacun était incomplet :
//
//   · Méthode tenait le RAISONNEMENT (on sélectionne un maximum, pas une performance)
//     et l'illustrait par une métaphore de pièces lancées. Elle expliquait sans montrer.
//   · Pourquoi tenait la PREUVE — le tableau des cinq configurations, calculé par le
//     vrai moteur — sans le raisonnement qui la rend lisible. Elle montrait sans
//     expliquer.
//
// Réunis, l'argument est posé, puis démontré au milieu de la page. Pas une ligne n'a été
// réécrite : ce sont les paragraphes des deux pages, remis dans cet ordre.
//
// Ce qui N'A PAS été repris, et pourquoi : les trois cartes « Une stratégie est une
// configuration / Le creux avant le gain / Vos données, vos règles » décrivaient le
// fonctionnement du produit, pas la thèse. Elles n'ont pas leur place dans une
// démonstration, et l'application les dit déjà là où elles servent.

const PIEGES = [
  {
    t: "Les frais absents",
    b: "Un spread de 0,02 % semble négligeable. Rapporté à un stop de 1 %, il mange 2 % de chaque unité de risque — soit sept points de R sur trois cent cinquante trades. Beaucoup de stratégies rentables sur le papier sont exactement à l’équilibre une fois les frais déduits.",
  },
  {
    t: "Le signal de la bougie en cours",
    b: "Si votre condition lit la clôture de la bougie sur laquelle vous entrez, vous utilisez une information que vous n’aviez pas au moment d’agir. L’erreur est invisible dans les chiffres et suffit à fabriquer une courbe parfaite. Le signal doit se lire sur une bougie fermée, l’entrée se faire à l’ouverture de la suivante.",
  },
  {
    t: "Le creux qu’on n’aurait pas tenu",
    b: "Une stratégie qui gagne cinquante R en traversant un creux de trente n’est pas exploitable par un humain : personne ne continue après huit mois de pertes. Le creux maximum n’est pas une statistique secondaire, c’est la contrainte principale — et il faut le majorer, car le pire à venir dépasse généralement le pire observé.",
  },
  {
    t: "Les données du voisin",
    b: "Vos prix, vos horaires de séance, votre spread et votre swap sont propres à votre compte. La même stratégie testée sur les données d’un autre courtier donne un autre résultat. Un backtest fait sur des données qui ne sont pas les vôtres ne décrit pas ce qui vous arrivera.",
  },
];

const RIEN = [
  "Aucun signal d’achat. Le moteur teste des règles, il ne vous dit pas quoi acheter aujourd’hui.",
  "Aucune promesse de rendement. Les résultats passés d’une règle ne sont pas un revenu futur.",
  "Aucune gestion de votre argent. Vous gardez vos comptes, vos ordres et vos décisions.",
  "Aucun classement flatteur. Une configuration qui ne tient pas hors période est marquée comme telle, même si elle affiche le meilleur chiffre.",
];

function Methode() {
  const [rows, setRows] = useState<PreuveRow[] | null>(null);
  useEffect(() => {
    setRows(computePreuve());
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />

      <article className="mx-auto w-full max-w-3xl px-5 pb-12 pt-16 md:px-8 md:pt-24">
        <div className="kicker">Méthode</div>
        {/* Le titre vient de l'ancienne page « Pourquoi » : c'est le plus direct des
            deux, et il énonce la thèse au lieu de l'annoncer. */}
        <h1 className="mt-3 max-w-[18ch] font-display text-5xl leading-none md:text-6xl">
          Votre backtest est probablement faux.
        </h1>
        <p className="mt-6 text-xl leading-relaxed text-ink/80">
          Vous avez trouvé une stratégie qui affiche une courbe régulière sur six ans. Vous la
          passez en réel. Trois mois plus tard, elle perd. Ce n’est presque jamais de la malchance :
          c’est une propriété mathématique de la façon dont vous l’avez trouvée.
        </p>

        <h2 className="mt-14 font-display text-3xl">
          Le problème n’est pas la stratégie, c’est la recherche
        </h2>
        <p className="mt-4 text-base leading-relaxed">
          Quand vous testez une combinaison de réglages, vous mesurez une performance. Quand vous en
          testez quatre cents, vous ne mesurez plus une performance : vous sélectionnez un maximum.
          Et un maximum, sur des données bruitées, contient toujours une part de chance.
        </p>
        <p className="mt-4 text-base leading-relaxed">
          C’est mécanique. Lancez quatre cents pièces cent fois chacune : l’une d’elles fera
          nécessairement une série remarquable. Vous pourriez publier sa courbe. Elle ne vous dit
          rien sur le prochain lancer.
        </p>

        <Blueprint className="mt-9 flex flex-col gap-3 p-6">
          <div className="kicker">La question à se poser</div>
          <p className="text-base">
            Non pas « combien cette configuration a-t-elle gagné ? », mais « aurais-je trouvé
            quelque chose d’aussi beau en cherchant dans du bruit pur ? ». Si oui, votre résultat
            n’est pas une découverte.
          </p>
        </Blueprint>
      </article>

      {/* LA PREUVE, AU MILIEU DE LA PAGE. Elle vivait sur l'autre page : le raisonnement
          ci-dessus n'avait rien à montrer, et ce tableau n'avait rien pour se faire
          lire. Le tri par gain brut est GÊNANT et c'est l'argument même : un outil de
          vente mettrait la première ligne en avant. */}
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
              Classées par performance brute, comme le ferait n’importe quel outil. La colonne des
              tranches découpe l’historique en cinq et compte celles qui restent gagnantes. Lisez-la
              avant tout le reste.
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
                        {/* UNE VALEUR QU'ON N'A PAS S'ÉCRIT « — », JAMAIS ZÉRO. Sous le
                            seuil de trades, le découpage en tranches ne mesure rien :
                            « 0 / 5 » se lirait « elle perd partout », alors qu'on ne
                            sait pas. */}
                        <td className="px-3 py-3 text-right tabular">
                          {r.segTotal > 0 ? `${r.positifs} / ${r.segTotal}` : "—"}
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
                  : Array.from({ length: 5 }).map((_, i) => (
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
            Un outil de vente mettrait la première ligne en avant : c’est le plus gros chiffre de la
            page. Véna l’écarte si elle ne tient pas hors période — et garde une ligne moins
            spectaculaire qui gagne dans plusieurs tranches.
          </p>
        </div>
      </section>

      <article className="mx-auto w-full max-w-3xl px-5 py-12 md:px-8 md:py-16">
        <h2 className="font-display text-3xl">Le test qui départage</h2>
        <p className="mt-4 text-base leading-relaxed">
          Découpez votre historique en cinq tranches consécutives. Une méthode réelle gagne dans la
          plupart d’entre elles. Un résultat trouvé par hasard concentre son gain sur une ou deux
          périodes fastes et perd ailleurs.
        </p>
        <p className="mt-4 text-base leading-relaxed">
          Le vrai visage du surapprentissage ne prend pas toujours la forme d’une courbe trop belle
          : le plus souvent, il ressemble à un résultat honnête qui ne se reproduit ni sur la
          période suivante, ni sur l’instrument d’à côté.
        </p>

        <h2 className="mt-14 font-display text-3xl">Les quatre autres pièges</h2>
        <div className="mt-5 flex flex-col">
          {PIEGES.map((p) => (
            <div key={p.t} className="border-t border-line py-5">
              <div className="font-display text-xl">{p.t}</div>
              <p className="mt-2 text-base leading-relaxed">{p.b}</p>
            </div>
          ))}
        </div>
      </article>

      <section className="border-t border-line">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 md:grid-cols-2 md:px-8">
          <div>
            <h2 className="font-display text-3xl">Ce que Véna ne fait pas</h2>
            <div className="mt-5 flex flex-col text-sm leading-relaxed">
              {RIEN.map((t) => (
                <div key={t} className="border-t border-line py-4">
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* DEUX BOUTONS DEVIENNENT UN. Les deux pages finissaient sur des appels
              différents — « En savoir plus » menait à l'autre moitié de cet argument,
              « Commencer avec les démos » à une démonstration qui n'existe plus. Reste
              le seul geste possible, avec sa contrepartie écrite dessus. */}
          <Blueprint className="flex flex-col gap-4 p-7">
            <div className="kicker">Ce qu’il reste quand on enlève tout ça</div>
            <h3 className="font-display text-2xl">Beaucoup moins de stratégies. C’est le but.</h3>
            <p className="text-base leading-relaxed">
              Une méthode qui survit au découpage en tranches, aux frais réels, à la règle de la
              bougie fermée et à un creux majoré de moitié est une méthode dont vous connaissez
              enfin le coût. Vous ne saurez toujours pas si elle gagnera — mais vous saurez ce que
              vous risquez, et pourquoi vous y croyez.
            </p>
            <p className="text-sm text-muted">
              Véna applique ces contrôles par défaut : découpage en cinq tranches, frais du symbole
              déduits, signal sur bougie fermée, creux affiché avant le gain. Vos exports horaires
              restent dans votre navigateur.
            </p>
            <Button asChild className="mt-1 self-start">
              <a href="/app">Ouvrir mon outil — trois instruments gratuits</a>
            </Button>
          </Blueprint>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
