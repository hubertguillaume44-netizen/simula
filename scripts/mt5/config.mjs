/**
 * Construit une configuration pour `moteur.js` à partir des options de la ligne de
 * commande. On n'passe pas par `buildConfig` de `src/lib/engine.ts` : cette couche a
 * divergé elle aussi (pas de sens, pas de mode prudent, pas de durée maximale).
 */

export const PALIERS_REFERENCE = [
  [25, 0],
  [50, 25],
  [75, 50],
];

/** "25:0,50:25,75:50" → [[25,0],[50,25],[75,50]] ; "aucun" → [] */
export function lirePaliers(txt) {
  const s = String(txt ?? "").trim();
  if (!s || s === "aucun" || s === "aucune") return [];
  return s
    .split(/[;,]/)
    .map((p) => p.split(":").map((x) => Number(x.trim().replace(",", "."))))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

// À la vente, tout filtre de tendance se lit en MIROIR : « au-dessus » devient « en
// dessous », « hausse » devient « baisse ». Sans cela on vendrait à découvert dans un
// marché filtré comme haussier — exactement l'inverse du but.
//
// L'application le fait déjà dans `cfgCourante`, et le robot généré aussi ; le harnais,
// lui, passait les filtres de `references.mjs` tels quels — orientés achat. Il comparait
// donc un robot en miroir à un moteur qui ne l'était pas. Mesuré sur AUDCAD vente :
// 77 journées où le moteur donnait signal et le robot refusait, 40 où c'était l'inverse,
// deux ensembles exactement miroirs l'un de l'autre.
//
// Les règles sont celles de l'application, à la lettre :
//   · l'ADX mesure la FORCE du mouvement, pas sa direction : il ne s'inverse pas ;
//   · le RSI s'inverse par son seuil, 100 − x ;
//   · « sous résistance » et « zone de résistance » n'ont pas d'équivalent vendeur et
//     sont retirés.
export function mirroirVente(filtres) {
  const out = [];
  for (const f of filtres || []) {
    if (f.type === "sous_resistance" || f.type === "zone_resistance") continue;
    if (f.type === "adx" || f.type === "horaire" || f.type === "delai_bougies") { out.push(f); continue; }
    // Le sens ABSENT vaut le défaut du moteur — `au_dessus` pour les filtres de niveau,
    // `hausse` pour la pente. Sans ce défaut, l'inversion laissait le filtre inchangé :
    // le filtre `tendance_mtf` de GOLD n'a pas de champ `sens`, et le moteur exigeait
    // donc la clôture AU-DESSUS de la ligne sur une vente à découvert, quand le robot la
    // voulait en dessous. 538 journées de désaccord sur 1 719, toutes dans le même sens.
    const au = (f.sens || "au_dessus") === "au_dessus";
    const haut = (f.sens || "hausse") === "hausse";
    if (f.type === "pente") { out.push({ ...f, sens: haut ? "baisse" : "hausse" }); continue; }
    if (f.type === "rsi") {
      out.push({ ...f, seuil: 100 - Number(f.seuil), sens: au ? "en_dessous" : "au_dessus" });
      continue;
    }
    out.push({ ...f, sens: au ? "en_dessous" : "au_dessus" });
  }
  return out;
}

export function construireConfig(o) {
  const securisation = o.trailing
    ? { type: "trailing", distance_pct: o.trailing }
    : o.paliers && o.paliers.length
      ? { type: "be_progressif", etapes: o.paliers }
      : { type: "aucun" };

  return {
    sens: o.sens === "vente" ? "vente" : "achat",
    entree: { type: o.entree, ligne: o.ligne, periode: o.periode },
    filtres: o.sens === "vente" ? mirroirVente(o.filtres) : (o.filtres ?? []),
    sortie: {
      sl: { type: "pct", valeur: o.sl },
      tp: { valeur: o.rr },
      securisation,
      prudent: !!o.prudent,
      duree_max: o.dureeMax ?? 0,
    },
    frais: {
      spread_pct: o.spread ?? 0,
      swap_annuel_pct: o.swap ?? 0,
      commission_pct: o.commission ?? 0,
    },
    // Distance minimale de stop imposée par le courtier (StopsLevel × Point), en unités
    // de PRIX. `references.mjs` la porte sous le nom `stopMini` depuis qu'elle a été
    // relevée, mais RIEN ne la transmettait au moteur : le harnais mesurait donc BITCOIN
    // sans la contrainte que le testeur applique, et comptait 422 trades quand le robot
    // en prend 355 — le courtier refuse les ordres dont le stop tient dans 200,00.
    stop_mini: o.stopMini ?? 0,
    debut: o.debut,
  };
}
