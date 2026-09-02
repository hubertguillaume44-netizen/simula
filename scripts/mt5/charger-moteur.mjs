/**
 * Charge le moteur Simula (TypeScript du dépôt) dans Node, sans build :
 * on enregistre la résolution de l'alias `@/…` puis on importe src/lib/engine.ts.
 * Le harnais teste ainsi le code réellement livré, pas une copie.
 */
import { register } from "node:module";

let cache = null;

export async function chargerMoteur() {
  if (cache) return cache;
  const racine = new URL("../../", import.meta.url);
  register(new URL("./alias-hooks.mjs", import.meta.url).href, racine);
  const engine = await import(new URL("src/lib/engine.ts", racine).href);
  const moteur = await import(new URL("src/lib/moteur.ts", racine).href);
  cache = { engine, moteur };
  return cache;
}
