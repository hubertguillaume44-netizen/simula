// ————— LE PALIER DU SIGNE SUIT LA RÈGLE, PAS UN LITTÉRAL —————
// L'en-tête du site rendait le signe à 24 px en demandant le palier `lg`, alors que
// `palierPour(24)` répond `md`. La règle et l'usage s'étaient contredits sans que rien
// ne le dise : à 24 px, le jambage fin du palier `lg` fait 1,44 px et grisonne hors
// écran retina.
//
// Ce test tient la CIBLE et non la forme : pour chaque usage de VenaMark, il calcule la
// taille de rendu depuis les classes, puis vérifie que le palier demandé est celui que
// la règle prescrit. Les seuils sont LUS dans le composant — les redire ici créerait
// une seconde règle, exactement le défaut qu'on corrige.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RACINE = new URL("../", import.meta.url).pathname;
const COMPOSANT = "src/components/vena-mark.tsx";
const lire = (rel) => readFileSync(path.join(RACINE, rel), "utf8");

/** Les seuils de `palierPour`, extraits de son corps. */
function reglePalier() {
  const corps = lire(COMPOSANT).match(
    /export function palierPour\([^)]*\)[^{]*\{([\s\S]*?)\n\}/,
  );
  assert.ok(corps, "palierPour introuvable — sa forme a changé, relire l’extraction");
  const seuils = [...corps[1].matchAll(/px >= (\d+)\) return "(\w+)"/g)]
    .map((m) => [Number(m[1]), m[2]]);
  const defaut = corps[1].match(/\n\s*return "(\w+)";/);
  assert.ok(seuils.length >= 1 && defaut, "les seuils de palierPour ne se lisent plus");
  return (px) => (seuils.find(([mini]) => px >= mini) ?? [0, defaut[1]])[1];
}

/** Tailwind : `h-6` vaut 24 px (l’échelle est en quarts de rem), `h-[32px]` se lit tel quel. */
function pixelsDe(classes) {
  const arbitraire = classes.match(/\bh-\[(\d+)px\]/);
  if (arbitraire) return Number(arbitraire[1]);
  const echelle = classes.match(/\bh-(\d+)\b/);
  return echelle ? Number(echelle[1]) * 4 : null;
}

/** Tous les fichiers de src/ susceptibles de rendre le signe. */
function sources(dir = path.join(RACINE, "src"), out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx$/.test(e)) out.push(p);
  }
  return out;
}

test("chaque usage de VenaMark demande le palier que la règle prescrit", () => {
  const prescrit = reglePalier();
  const usages = [];
  for (const fichier of sources()) {
    const src = readFileSync(fichier, "utf8");
    for (const m of src.matchAll(/<VenaMark\b([^>]*?)\/>/gs)) {
      const attributs = m[1];
      // le composant lui-même n'est pas un usage
      if (fichier.endsWith("vena-mark.tsx")) continue;
      usages.push({ fichier: fichier.slice(RACINE.length), attributs });
    }
  }
  assert.ok(usages.length > 0, "aucun usage de VenaMark trouvé — le motif a changé");

  for (const { fichier, attributs } of usages) {
    const classes = attributs.match(/className="([^"]*)"/)?.[1] ?? "";
    const px = pixelsDe(classes);
    assert.ok(px, `${fichier} : la taille de rendu ne se lit pas dans « ${classes} »`);

    const parLaRegle = attributs.match(/taille=\{palierPour\((\d+)\)\}/);
    if (parLaRegle) {
      // forme préférée : le palier est calculé. Reste à vérifier qu'il l'est pour LA
      // taille à laquelle le signe est vraiment rendu.
      assert.equal(
        Number(parLaRegle[1]), px,
        `${fichier} : palierPour(${parLaRegle[1]}) alors que le signe est rendu à ${px} px`,
      );
      continue;
    }
    const litteral = attributs.match(/taille="(\w+)"/);
    assert.ok(litteral, `${fichier} : ni palierPour(), ni palier littéral`);
    assert.equal(
      litteral[1], prescrit(px),
      `${fichier} : palier « ${litteral[1]} » à ${px} px, la règle prescrit « ${prescrit(px)} »`,
    );
  }
});

test("le palier par défaut du composant reste celui des grandes tailles", () => {
  // `taille = "lg"` par défaut : un usage qui oublie l'attribut prend le palier des
  // grands rendus, jamais un palier réépaissi posé sur un signe de 80 px
  const src = lire(COMPOSANT);
  assert.match(src, /taille = "lg"/);
  assert.equal(reglePalier()(80), "lg");
});
