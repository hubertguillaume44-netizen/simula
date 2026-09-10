/**
 * LE SIGNE VÉNA — un chevron à deux graisses : le jambage fin descend, le plein remonte.
 *
 * TROIS DESSINS, PAS TROIS TAILLES. Le rapport 6/17 du palier `lg` ne tient que
 * au-dessus de 40 px. En dessous, le jambage fin passe sous le pixel : l'écart de
 * graisses s'écrase et il ne reste qu'un V ordinaire — c'est-à-dire plus de marque du
 * tout. `favicon-16.png` et `favicon-32.png` ne sont donc pas deux tailles du même
 * dessin, ce sont deux dessins. Ne jamais rasteriser une icône depuis un autre palier.
 *
 * UN POLYGONE, PAS DEUX TRAITS. Deux traits à bouts carrés ne se rejoignent pas :
 * chacun dépasse la pointe de sa demi-graisse, et la base part en marche d'escalier.
 * Une pointe mitrée partagée entre 6 et 17 d'épaisseur produit à l'inverse un talon
 * massif sous l'angle rentrant. Le dessin retenu coupe le plein À PLAT en bas et fait
 * buter le fin contre son flanc : huit sommets, deux plats en haut, un pied à plat.
 * Ne pas le réécrire en `<path stroke>`.
 *
 * Le `viewBox` est calculé pour contenir le palier le plus gras : les trois se
 * superposent au pixel dans une même boîte.
 */

const GRAISSES = {
  /** fin 6 / plein 17 — ≥ 40 px : en-tête, avatar, broderie, document */
  lg: "M 6.00 15.73 L 13.77 15.73 L 42.88 70.31 L 71.99 15.73 L 94.00 15.73 L 57.44 84.27 L 35.43 84.27 L 39.00 77.60 Z",
  /** fin 11 / plein 20 — 20 à 40 px : onglet 32, favicon 32 */
  md: "M 6.00 17.63 L 19.45 17.63 L 44.50 64.60 L 69.55 17.63 L 94.00 17.63 L 59.48 82.37 L 35.02 82.37 L 37.77 77.21 Z",
  /** fin 13 / plein 22 — < 20 px : favicon 16 */
  sm: "M 6.00 18.51 L 21.47 18.51 L 44.65 61.97 L 67.83 18.51 L 94.00 18.51 L 60.41 81.49 L 34.24 81.49 L 36.91 76.47 Z",
} as const;

export type TailleMarque = keyof typeof GRAISSES;

/** Choisit le palier d'après la taille de rendu en pixels. */
export function palierPour(px: number): TailleMarque {
  if (px >= 40) return "lg";
  if (px >= 20) return "md";
  return "sm";
}

export function VenaMark({
  taille = "lg",
  className,
}: {
  taille?: TailleMarque;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path fill="currentColor" d={GRAISSES[taille]} />
    </svg>
  );
}

export { GRAISSES };
