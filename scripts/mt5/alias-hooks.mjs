/**
 * Résolution des imports `@/…` du projet (alias tsconfig) pour Node.
 * Permet d'exécuter le moteur TypeScript du dépôt tel quel, sans build,
 * en s'appuyant sur le type-stripping natif de Node 22.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));
const EXT = [".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

function fixe(base) {
  if (existsSync(base) && !existsSync(path.join(base, "."))) return base;
  for (const e of EXT) if (existsSync(base + e)) return base + e;
  return base;
}

export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) {
    return next(pathToFileURL(fixe(path.join(SRC, spec.slice(2)))).href, ctx);
  }
  if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
    const abs = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    if (!path.extname(abs)) {
      const f = fixe(abs);
      if (f !== abs) return next(pathToFileURL(f).href, ctx);
    }
  }
  return next(spec, ctx);
}
