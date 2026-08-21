import { createFileRoute, Link } from "@tanstack/react-router";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/methode")({ component: Methode });

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

function Methode() {
  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />
      <article className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8 md:py-24">
        <div className="kicker">Méthode</div>
        <h1 className="mt-3 font-display text-5xl leading-none md:text-6xl">
          Pourquoi un backtest brillant échoue en réel
        </h1>
        <p className="mt-6 text-xl leading-relaxed text-ink/80">
          Vous avez trouvé une stratégie qui affiche une courbe régulière sur six ans. Vous la
          passez en réel. Trois mois plus tard, elle perd. Ce n’est presque jamais de la
          malchance : c’est une propriété mathématique de la façon dont vous l’avez trouvée.
        </p>

        <h2 className="mt-14 font-display text-3xl">Le problème n’est pas la stratégie, c’est la recherche</h2>
        <p className="mt-4 text-base leading-relaxed">
          Quand vous testez une combinaison de réglages, vous mesurez une performance. Quand
          vous en testez quatre cents, vous ne mesurez plus une performance : vous
          sélectionnez un maximum. Et un maximum, sur des données bruitées, contient toujours
          une part de chance.
        </p>
        <p className="mt-4 text-base leading-relaxed">
          C’est mécanique. Lancez quatre cents pièces cent fois chacune : l’une d’elles fera
          nécessairement une série remarquable. Vous pourriez publier sa courbe. Elle ne vous
          dit rien sur le prochain lancer.
        </p>

        <Blueprint className="mt-9 flex flex-col gap-3 p-6">
          <div className="kicker">La question à se poser</div>
          <p className="text-base">
            Non pas « combien cette configuration a-t-elle gagné ? », mais « aurais-je trouvé
            quelque chose d’aussi beau en cherchant dans du bruit pur ? ». Si oui, votre
            résultat n’est pas une découverte.
          </p>
        </Blueprint>

        <h2 className="mt-14 font-display text-3xl">Le test qui départage</h2>
        <p className="mt-4 text-base leading-relaxed">
          Découpez votre historique en cinq tranches consécutives. Une méthode réelle gagne
          dans la plupart d’entre elles. Un résultat trouvé par hasard concentre son gain sur
          une ou deux périodes fastes et perd ailleurs.
        </p>
        <p className="mt-4 text-base leading-relaxed">
          Le vrai visage du surapprentissage ne prend pas toujours la forme d’une courbe trop
          belle : le plus souvent, il ressemble à un résultat honnête qui ne se reproduit ni
          sur la période suivante, ni sur l’instrument d’à côté.
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

        <h2 className="mt-14 font-display text-3xl">Ce qu’il reste quand on enlève tout ça</h2>
        <p className="mt-4 text-base leading-relaxed">
          Beaucoup moins de stratégies. C’est le but. Une méthode qui survit au découpage en
          tranches, aux frais réels, à la règle de la bougie fermée et à un creux majoré de
          moitié est une méthode dont vous connaissez enfin le coût. Vous ne saurez toujours
          pas si elle gagnera — mais vous saurez ce que vous risquez, et pourquoi vous y
          croyez.
        </p>

        <Blueprint className="mt-11 flex flex-col gap-4 p-7">
          <div className="kicker">Faire le test sur vos propres règles</div>
          <h3 className="font-display text-2xl">Simula applique ces contrôles par défaut</h3>
          <p className="text-sm text-muted">
            Découpage en cinq tranches, frais du symbole déduits, signal sur bougie fermée,
            creux affiché avant le gain. Vos exports horaires restent dans votre navigateur.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/simuler">Essayer maintenant</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/pourquoi">En savoir plus</Link>
            </Button>
          </div>
        </Blueprint>
      </article>
      <SiteFooter />
    </div>
  );
}
