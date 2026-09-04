/**
 * Charge le moteur de référence — `moteur.js` à la racine, la spécification.
 *
 * `src/lib/moteur.ts` n'est PAS utilisé ici : il a divergé (spread déduit après coup
 * au lieu d'être payé à l'entrée, segments à tranches fixes, pas de sens vente, pas de
 * colonne de spread). Mesurer avec lui donnerait les chiffres du mauvais moteur.
 */
import { register } from "node:module";

let cache = null;
let cacheDemo = null;

export async function chargerMoteur() {
  if (cache) return cache;
  cache = await import(new URL("../../moteur.js", import.meta.url).href);
  return cache;
}

/** Séries de démonstration (TypeScript du dépôt) — uniquement pour le gabarit de test. */
export async function chargerDemo() {
  if (cacheDemo) return cacheDemo;
  const racine = new URL("../../", import.meta.url);
  register(new URL("./alias-hooks.mjs", import.meta.url).href, racine);
  cacheDemo = await import(new URL("src/lib/demo.ts", racine).href);
  return cacheDemo;
}
