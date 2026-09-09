// « À ranger » : le rangement se fait ligne par ligne, dans le portefeuille de son choix.
// L'action groupée finit le tri, elle ne le fait pas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FICHIERS = ["Sivula.dc.html", "Sivula.solo.html"];
const cache = new Map();
const source = (f) => {
  if (!cache.has(f)) cache.set(f, readFileSync(new URL("../../" + f, import.meta.url), "utf8"));
  return cache.get(f);
};
/** le tableau « À ranger » seul — celui du Portefeuille a ses propres colonnes */
const sectionARanger = (txt) => {
  const i = txt.indexOf("{{ aRanger }}");
  assert.ok(i > 0, "le tableau « À ranger » doit exister");
  return txt.slice(i, txt.indexOf("</table>", i));
};

for (const f of FICHIERS) {
  test(f + " : chaque ligne à ranger porte son propre choix de destination", () => {
    const bloc = sectionARanger(source(f));
    assert.match(bloc, /value="\{\{ vl\.rangerVal \}\}" onChange="\{\{ vl\.ranger \}\}"/,
      "la ligne doit porter un sélecteur de destination");
    assert.match(bloc, /\{\{ vl\.rangerOpts \}\}/, "il doit lister les portefeuilles");
    // la rangée entière porte la sélection : ouvrir la liste ne doit pas la cocher
    assert.match(bloc, /onClick="\{\{ vl\.stopper \}\}"/,
      "le clic sur la liste doit être arrêté avant la rangée");
  });

  test(f + " : la liste porte « Ranger dans… » et sait créer un portefeuille", () => {
    const txt = source(f);
    assert.match(txt, /nom: 'Ranger dans\\u2026'/, "l’invite tant que rien n’est choisi");
    // créer sans quitter l’écran, sur la ligne comme sur le lot
    const neufs = txt.match(/nom: '\+ Nouveau portefeuille' \}\] : \[\]\)/g) || [];
    assert.equal(neufs.length, 2,
      "la création à la volée doit être offerte par les deux sélecteurs, vu " + neufs.length);
    // le plafond de six portefeuilles vaut aussi pour la création à la volée
    const gardes = txt.match(/if \(pfListe\.length >= 6\) return;/g) || [];
    assert.ok(gardes.length >= 2, "le plafond doit être gardé aux deux endroits");
  });

  test(f + " : l’action groupée vise le reste, et nomme sa cible", () => {
    const txt = source(f);
    // plus de portefeuille imposé : ni le bouton, ni la liste qui le désignait de loin
    assert.ok(!txt.includes("Tout ranger dans {{ pfNom }}"),
      "le bouton au portefeuille imposé doit avoir disparu");
    assert.ok(!txt.includes("{{ pfChoisi }}"),
      "la liste « Cible de… » posée en bas de page n’a plus rien à piloter");
    assert.match(txt, /value="\{\{ rangerResteVal \}\}" onChange="\{\{ rangerReste \}\}"/,
      "l’action groupée doit porter son propre sélecteur de destination");
    // son intitulé compte le reste, donc il suit le rangement ligne par ligne
    assert.match(txt, /'Ranger ' \+ \(restants\.length > 1 \? 'les ' \+ restants\.length \+ ' restantes' : 'la restante'\)/,
      "l’intitulé doit compter les lignes restantes");
    assert.match(txt, /!restants\.length \? 'Rien à ranger'/,
      "à zéro, il ne doit plus proposer de ranger une ligne qui n’existe plus");
    // le reste, c’est ce qui n’appartient à aucun portefeuille — jamais ce qui est rangé
    assert.match(txt, /const restants = \[\.\.\.new Set\(this\.normValides\(s\.valides\)\s*\n?\s*\.map\(\(v\) => v\.sym\)\.filter\(\(x\) => !dedans\.has\(x\)\)\)\]/,
      "le reste ne doit compter que les lignes sans portefeuille");
  });

  test(f + " : l’export quitte la ligne, le hasard et l’écart restent", () => {
    const bloc = sectionARanger(source(f));
    assert.ok(!bloc.includes("{{ vl.faireTxt }}"),
      "l’action de fin de ligne — le plus souvent « Robot MT5 » — doit quitter ces lignes");
    // l’export garde ses deux points d’entrée, dont la colonne du Portefeuille
    assert.equal((source(f).match(/\{\{ vl\.faireTxt \}\}/g) || []).length, 1,
      "il doit rester exactement une action de fin de ligne, celle du Portefeuille");
    // le contrôle du hasard garde sa cellule
    assert.match(bloc, /\{\{ vl\.hasTxt \}\}/, "le contrôle du hasard reste sur la ligne");
    // écarter et ranger sont les deux issues d’un tri
    assert.match(bloc, /onClick="\{\{ vl\.retirer \}\}">×</,
      "le × de fin de ligne doit rester");
  });

  test(f + " : le compteur de l’en-tête compte les lignes sans portefeuille", () => {
    const txt = source(f);
    // il se déduit du tableau, donc il décroît tout seul à chaque ligne rangée
    assert.match(txt, /const aRanger = this\.trierDec\(toutes\.filter\(\(x\) => dans\(x\.ticker \|\| x\.sym\) < 0\)\);/,
      "« à ranger » doit se définir comme l’absence de portefeuille");
    assert.match(txt, /aRangerCourt: aRanger\.length\s*\n?\s*\? this\.pl\(aRanger\.length, 'ligne', 'lignes'\) \+ ' sans portefeuille'/,
      "le compteur doit lire la longueur de ce même tableau");
  });

  test(f + " : plus de pastilles muettes sur la ligne à ranger", () => {
    const bloc = sectionARanger(source(f));
    // elles lisaient `cb3.ab` et `cb3.basculer` quand le producteur donne `nom` et
    // `placer` : une étiquette vide et un clic sans effet
    assert.ok(!bloc.includes("{{ cb3.ab }}"),
      "les pastilles d’abréviation, muettes et sans effet, doivent quitter cette ligne");
  });
}
