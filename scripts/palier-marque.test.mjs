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

// ————— L'APPLICATION PORTE LE MÊME SIGNE QUE LE SITE —————
// Le fichier unique ne peut pas importer le composant : il doit rester autonome, donc
// les tracés y sont écrits en clair. Deux copies de la même géométrie existent donc, et
// une copie qui dérive serait une seconde marque. Ce test les tient appariées.

/** Les nombres d'un tracé, pour comparer « 6.00 » et « 6 » comme un même sommet. */
function sommets(trace) {
  return (trace.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Les trois tracés du composant, source unique de la géométrie. */
function tracesDuComposant() {
  const trouves = {};
  for (const m of lire(COMPOSANT).matchAll(/^ {2}(lg|md|sm): "([^"]+)",$/gm)) trouves[m[1]] = m[2];
  assert.equal(Object.keys(trouves).length, 3, "la table GRAISSES ne se lit plus");
  return trouves;
}

test("le signe de l’en-tête de l’application est le palier md du composant", () => {
  const app = lire("Vena.dc.html");
  // Le bouton est repéré par ce qu'il EST — le signe suivi du mot VÉNA — et non par le
  // gestionnaire qu'il porte. Il pointait vers `goAccueil` ; la page de présentation
  // ayant disparu, il ramène désormais à « Mes instruments », et ce test échouait pour
  // une raison sans rapport avec le palier du signe, qui est son seul objet.
  const entete = app.match(/<button type="button" onClick="\{\{ \w+ \}\}"[^>]*>(<svg[\s\S]*?<\/svg>)VÉNA<\/button>/);
  assert.ok(entete, "le signe n’est plus dans le bouton de marque de l’en-tête");
  const trace = entete[1].match(/\sd="([^"]+)"/);
  assert.ok(trace, "le signe de l’en-tête n’a pas de tracé");
  assert.deepEqual(sommets(trace[1]), sommets(tracesDuComposant().md),
    "le signe de l’en-tête a dérivé du palier md du composant");
  // il suit la couleur du texte : une couleur fixe le ferait disparaître sur fond sombre
  assert.match(entete[1], /fill="currentColor"/);
  assert.doesNotMatch(entete[1], /fill="(?!currentColor)/);
  // rendu à 24 px, la taille pour laquelle la règle prescrit `md`
  assert.match(entete[1], /width="24" height="24"/);
});

test("l’icône d’onglet de l’application est le palier sm, et ne cite aucun voisin", () => {
  const app = lire("Vena.dc.html");
  const icone = app.match(/<link rel="icon"[^>]*href="(data:image\/svg\+xml,[^"]+)"/);
  assert.ok(icone, "l’application ne déclare pas d’icône en data-URI");
  const svg = decodeURIComponent(icone[1].slice("data:image/svg+xml,".length));
  const trace = svg.match(/<path[^>]*\sd='([^']+)'/);
  assert.ok(trace, "l’icône n’a pas de tracé");
  assert.deepEqual(sommets(trace[1]), sommets(tracesDuComposant().sm),
    "l’icône d’onglet a dérivé du palier sm du composant");
  // les couleurs du produit, et rien d'autre
  assert.match(svg, /fill='#1c1e20'/);
  assert.match(svg, /fill='#f4f3ef'/);
});
