/**
 * Charge le moteur de référence — `moteur.js` à la racine, la spécification.
 *
 * `src/lib/moteur.ts` n'est PAS utilisé ici : il a divergé (spread déduit après coup
 * au lieu d'être payé à l'entrée, segments à tranches fixes, pas de sens vente, pas de
 * colonne de spread). Mesurer avec lui donnerait les chiffres du mauvais moteur.
 */

let cache = null;

export async function chargerMoteur() {
  if (cache) return cache;
  cache = await import(new URL("../../moteur.js", import.meta.url).href);
  return cache;
}
