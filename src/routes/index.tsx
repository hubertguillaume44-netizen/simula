import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Blueprint } from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { vitrine, type Vitrine } from "@/lib/preuve";
import { signedR } from "@/lib/format";

export const Route = createFileRoute("/")({ component: Home });

// ————— MONTRER, PAS RACONTER —————
//
// La page décrivait l'outil sans jamais en afficher un chiffre : on lisait trois écrans
// avant de voir à quoi il sert. Or ce qui se vend ici n'est pas une promesse de gain —
// tout le monde en fait une — c'est un outil qui CONTREDIT son propriétaire. Ça ne se
// raconte pas, ça se montre.
//
// Une mesure réelle est donc posée à côté du titre : deux nombres — le résultat brut, et
// ce qu'il en reste hors de la période qui a servi à le choisir — puis les contrôles,
// tels qu'ils tombent. Elle sort du VRAI moteur, sur les séries de démonstration (voir
// `vitrine()`), et la ligne montrée est la plus GROSSE de celles que Véna refuse de
// retenir : le plus beau chiffre de la page, avec le contrôle qui le disqualifie juste
// en dessous. Voir `vitrine()` pour la règle — c'est un tri, pas un échec fabriqué.
//
// L'ordre des sections suit l'ordre des questions : ce que ça fait → pourquoi y croire →
// à qui ça s'adresse et comment → combien. « Ce qu'il vous faut » était en deuxième
// position et disait « vous n'êtes peut-être pas concerné » avant d'avoir donné envie ;
// il descend après la preuve, et les trois gestes lui tiennent compagnie au lieu
// d'occuper trois cartes séparées.
//
// Le prix n'est plus détaillé ici : trois montants et un lien vers les Tarifs, qui font
// autorité. Deux copies d'un prix divergent, et la divergence est muette.

const GESTES = [
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
];

// Trois nombres, et les trois sont VÉRIFIABLES dans le code — c'est la condition pour
// qu'ils figurent ici. Aucun chiffre de performance, aucune vitesse annoncée : ce qu'on
// ne mesure pas ne s'écrit pas.
const CHIFFRES = [
  { n: "5", b: "contrôles passés par chaque configuration avant d’être retenue" },
  { n: "1 / 5", b: "de l’historique tenu hors du choix, pour vérifier ce qui tient" },
  { n: "0", b: "fichier envoyé, compte créé ou mouchard posé" },
];

function CarteMesure({ v }: { v: Vitrine }) {
  const { row, controles: ctl } = v;
  return (
    <Blueprint className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="kicker">Une mesure, telle qu’elle sort</div>
        <span className="text-xs tabular text-muted">
          {row.sym} · P{row.periode} · {row.n} trades
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border border-line bg-line">
        <div className="flex flex-col gap-1 bg-paper p-4">
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">
            Sur toute la période
          </div>
          <div className="font-display text-3xl leading-none tabular">{signedR(row.total, 1)}</div>
        </div>
        <div className="flex flex-col gap-1 bg-steel-soft/50 p-4">
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-steel">
            Hors de la période qui flatte
          </div>
          <div className="font-display text-3xl leading-none tabular">
            {/* « — » et non zéro : sans mesure hors échantillon on ne SAIT pas, et un
                zéro se lirait « elle ne rapporte rien ». */}
            {row.oos === undefined || Number.isNaN(row.oos) ? "—" : signedR(row.oos, 1)}
          </div>
          {/* « tenue » est un RAPPORT, pas une part : le rythme de la période retirée
              divisé par celui de la période d'apprentissage. Il dépasse 100 % quand la
              partie non choisie fait mieux — écrire « il en reste 288 % » n'aurait
              aucun sens. */}
          <div className="text-[11.5px] tabular text-muted">
            {row.tenue === undefined || Number.isNaN(row.tenue)
              ? "tenue non mesurée"
              : `tenue ${Math.round(row.tenue)} % du rythme d’apprentissage`}
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        {ctl.map((c) => (
          <div
            key={c.nom}
            className="flex items-baseline gap-3 border-t border-line py-2 text-sm first:border-t-0"
          >
            {/* Carré plein = tenu, carré vide = en échec, pointillé = non mesurable.
                Pas de croix rouge : l'échec d'un contrôle n'est pas une faute, c'est le
                renseignement qu'on vient chercher. */}
            <span
              className={
                c.ok === true
                  ? "mt-1.5 inline-block size-2.5 shrink-0 bg-steel"
                  : c.ok === false
                    ? "mt-1.5 inline-block size-2.5 shrink-0 border border-muted"
                    : "mt-1.5 inline-block size-2.5 shrink-0 border border-dashed border-line"
              }
            />
            <span className={c.ok === false ? "flex-1 text-muted" : "flex-1"}>{c.nom}</span>
            <span className="shrink-0 tabular text-xs text-muted">{c.valeur}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-3 border-t border-line pt-3">
        <span className="bg-steel-soft px-2 py-0.5 text-[10px] uppercase tracking-wide tabular text-steel-ink">
          {row.verdict} · {v.passes}/{v.total}
        </span>
        <span className="min-w-[24ch] flex-1 text-xs leading-relaxed text-muted">
          Véna ne dit pas « bravo ». Il dit ce qui tient, ce qui ne tient pas, et il vous laisse
          trancher.
        </span>
      </div>
    </Blueprint>
  );
}

function Home() {
  // La mesure est calculée dans le navigateur, comme le tableau de Méthode : le rendu
  // serveur affiche le gabarit, les chiffres arrivent au premier rendu client.
  const [v, setV] = useState<Vitrine | null>(null);
  useEffect(() => {
    setV(vitrine());
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-5xl items-center gap-11 px-5 py-16 md:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] md:px-8 md:py-20">
          <div className="flex flex-col">
            <h1 className="max-w-[17ch] font-display text-5xl leading-[1.02] tracking-tight md:text-6xl">
              Testez une règle avant d’y mettre un euro.
            </h1>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink/80">
              Véna rejoue votre règle sur vos propres historiques, frais de votre courtier compris.
              Puis il retire la période qui l’a fait bien paraître, et vous montre ce qu’il en
              reste.
            </p>
            <p className="mt-3 max-w-prose text-sm text-muted">
              Il ne prédit rien et ne passe aucun ordre. Il mesure, et il dit à quel point le
              chiffre est fragile.
            </p>
            <div className="mt-8 flex flex-col items-start gap-2">
              {/* Le geste ET sa contrepartie dans le même bouton : « ouvrir » seul ne dit
                  pas ce qu'on obtient sans payer, et c'est ça qui décide d'un essai. */}
              <Button asChild>
                <a href="/app">Ouvrir mon outil — trois instruments gratuits</a>
              </Button>
              <p className="max-w-[46ch] text-sm text-muted">
                Sans compte, sans carte. Des séries de démonstration pour regarder, trois
                instruments à vous pour de vrai.
              </p>
            </div>
          </div>

          {v ? (
            <CarteMesure v={v} />
          ) : (
            <Blueprint className="flex min-h-[380px] flex-col justify-center gap-2 p-6">
              <div className="kicker">Une mesure, telle qu’elle sort</div>
              <p className="text-sm text-muted">Calcul sur les séries de démonstration…</p>
            </Blueprint>
          )}
        </section>

        {/* LA FRAGILITÉ EST L'ARGUMENT, PAS UNE SUBORDONNÉE. « Ce qu'il en reste une fois
            retirée la période qui l'a fait bien paraître » vivait au milieu d'un
            paragraphe. C'est pourtant la seule chose que les autres ne font pas. */}
        <section className="bg-steel-ink text-panel">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-5 py-16 text-center md:px-8">
            <div className="text-[11px] uppercase tracking-[0.14em] text-panel/70">
              Ce que personne ne vous montre
            </div>
            <h2 className="max-w-[26ch] font-display text-4xl leading-tight text-panel">
              Toute courbe est belle sur la période qui l’a fabriquée
            </h2>
            <p className="max-w-[64ch] text-base leading-relaxed text-panel/85">
              Un réglage trouvé sur six ans d’historique a eu six ans pour s’y ajuster. Véna coupe
              l’historique en cinq, mesure sur quatre, vérifie sur la cinquième — celle qu’il n’a
              jamais vue. Ce qui survit est la seule chose sur laquelle on peut miser.
            </p>
            <div className="mt-3 grid w-full max-w-[760px] gap-px border border-panel/25 bg-panel/25 md:grid-cols-3">
              {CHIFFRES.map((c) => (
                <div key={c.n} className="flex flex-col gap-1 bg-steel-ink p-5 text-left">
                  <div className="font-display text-4xl leading-none tabular">{c.n}</div>
                  <p className="text-xs leading-relaxed text-panel/85">{c.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CE QU'IL VOUS FAUT, ET LES TROIS GESTES, DANS UN SEUL CADRE. Le premier disait
            « vous n'êtes peut-être pas concerné » ; les seconds répondaient « voilà
            comment ça se passe ». Séparés, le refus arrivait avant la réponse. */}
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-16 md:px-8">
          <div className="flex flex-wrap items-baseline gap-4">
            <div className="kicker">Ce qu’il vous faut</div>
            <span className="min-w-[36ch] flex-1 text-sm text-muted">
              Dit ici, avant l’achat — pas après.
            </span>
          </div>
          <Blueprint className="flex flex-wrap items-start gap-8 p-6 md:p-7">
            <div className="flex min-w-[36ch] flex-1 flex-col gap-2">
              <p className="text-base leading-relaxed">
                <strong>MetaTrader 5</strong> chez votre courtier — c’est la seule plateforme que
                Véna lit. Elle vous fait installer deux scripts, une fois, qui produisent les
                fichiers : vos prix horaires et votre relevé de frais. Aucune programmation.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                Ni cTrader, ni TradingView, ni relevé au format maison. Mieux vaut le savoir
                maintenant qu’après avoir payé.
              </p>
            </div>
            <div className="flex min-w-[30ch] flex-1 flex-col">
              {GESTES.map((g) => (
                <div
                  key={g.n}
                  className="flex gap-3 border-t border-line py-3 first:border-t-0 first:pt-0"
                >
                  <span className="w-[2ch] shrink-0 font-display text-base tabular text-steel">
                    {g.n}
                  </span>
                  <p className="flex-1 text-sm leading-relaxed">
                    <strong>{g.t}.</strong> {g.b}
                  </p>
                </div>
              ))}
            </div>
          </Blueprint>
        </section>

        {/* LE PRIX, EN RÉSUMÉ SEULEMENT. Le détail — comparatif, objections, conditions —
            vit sur /tarifs, et nulle part ailleurs. */}
        <section className="mx-auto w-full max-w-5xl px-5 pb-16 md:px-8">
          <Blueprint className="flex flex-col gap-6 p-6 md:p-8">
            <div className="flex flex-wrap items-baseline gap-4">
              <div className="kicker">Ce que ça coûte</div>
              <span className="min-w-[34ch] flex-1 text-sm text-muted">
                Le gratuit d’abord : c’est lui qui décide si quelqu’un essaie.
              </span>
            </div>
            <div className="grid gap-7 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <div className="font-display text-4xl leading-none tabular">0 €</div>
                <div className="text-sm font-medium">Trois instruments à vous</div>
                <p className="text-sm text-muted">Sans limite de durée, sans compte à créer.</p>
              </div>
              <div className="flex flex-col gap-1">
                <div className="font-display text-4xl leading-none tabular">
                  14,99 €{" "}
                  <span className="text-lg text-muted" style={{ fontVariantNumeric: "normal" }}>
                    / mois
                  </span>
                </div>
                <div className="text-sm font-medium">Tous vos instruments</div>
                <p className="text-sm text-muted">Résiliable à tout moment.</p>
              </div>
              <div className="flex flex-col gap-1">
                <div className="font-display text-4xl leading-none tabular">
                  149 €{" "}
                  <span className="text-lg text-muted" style={{ fontVariantNumeric: "normal" }}>
                    / an
                  </span>
                </div>
                <div className="text-sm font-medium tabular">Soit 12,42 € par mois</div>
                <p className="text-sm text-muted">Quatorze jours pour changer d’avis.</p>
              </div>
            </div>
            <p className="border-t border-line pt-4 text-sm text-muted">
              Une clé s’achète une fois et se colle dans l’application : pas de compte, rien n’est
              conservé sur vous, pas même votre achat.{" "}
              <Link to="/tarifs" className="text-ink underline decoration-line underline-offset-2">
                Le comparatif et les conditions
              </Link>
              .
            </p>
          </Blueprint>
        </section>

        <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pb-20 md:px-8">
          <div className="kicker">Pour aller plus loin</div>
          <div className="grid gap-6 md:grid-cols-2">
            <Link to="/methode" className="no-underline text-ink">
              <Blueprint className="flex h-full flex-col gap-2 p-6 transition-colors duration-150 hover:bg-steel-soft/40">
                <div className="font-display text-xl">Votre backtest est probablement faux</div>
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
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
