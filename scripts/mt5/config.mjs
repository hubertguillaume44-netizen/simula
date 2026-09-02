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

export function construireConfig(o) {
  const securisation = o.trailing
    ? { type: "trailing", distance_pct: o.trailing }
    : o.paliers && o.paliers.length
      ? { type: "be_progressif", etapes: o.paliers }
      : { type: "aucun" };

  return {
    sens: o.sens === "vente" ? "vente" : "achat",
    entree: { type: o.entree, ligne: o.ligne, periode: o.periode },
    filtres: o.filtres ?? [],
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
    debut: o.debut,
  };
}
