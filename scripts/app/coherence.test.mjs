// Passe de cohérence : une seule source par information affichée.
// Ces tests portent sur des INVARIANTS, pas sur l'apparence — ce qui n'est pas
// verrouillé revient.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FICHIERS = ["Vena.dc.html", "Vena.solo.html"];
const cache = new Map();
const source = (f) => {
  if (!cache.has(f)) cache.set(f, readFileSync(new URL("../../" + f, import.meta.url), "utf8"));
  return cache.get(f);
};

for (const f of FICHIERS) {
  // ————— 1 · le nombre d'instruments —————
  test(f + " : durée et combinaisons comptent les mêmes instruments", () => {
    const txt = source(f);
    // la durée estimée lisait `s.univers` brut quand les combinaisons filtrent par
    // compte : deux chiffres voisins qui ne pouvaient pas être vrais ensemble
    assert.match(txt, /const retenus = this\.universDuCompte\(s\.univers\);\s*\n\s*const n = retenus\.length \|\| 1;/,
      "la durée estimée doit compter les instruments du compte");
    assert.match(txt, /const aCharger = retenus\.filter/,
      "le chargement des CSV doit se compter sur la même liste");
    // `dureeEstimee` ne doit plus toucher la liste brute
    const i = txt.indexOf("dureeEstimee: (() => {");
    assert.ok(i > 0, "dureeEstimee doit exister");
    const bloc = txt.slice(i, txt.indexOf("})(),", i));
    assert.ok(!/s\.univers\.length/.test(bloc) && !/s\.univers\.filter/.test(bloc),
      "dureeEstimee ne doit plus lire la liste non filtrée");
  });

  // ————— 2 · les renvois —————
  test(f + " : aucun renvoi ne nomme un onglet qui n’existe pas", () => {
    const txt = source(f);
    // « Symboles dispos » était le nom d’un onglet renommé « Mes instruments ». Trois
    // phrases y renvoyaient encore, dont une infobulle et un message d’erreur.
    assert.ok(!txt.includes("Symboles dispos"),
      "aucun texte ne doit nommer l’onglet « Symboles dispos », renommé « Mes instruments »");
    // tout renvoi appuyé nomme une ancre qui existe VRAIMENT dans le document
    const CONNUS = new Set([
      "Mes instruments", "Mes scans", "Mes décisions",       // le rang des onglets
      "Portefeuille", "Marché", "Journal", "Backtest", "Historique", "Nouveau scan",
      "Bougies H1", "Bougies M1", "Relevé",                  // les zones de dépôt
      "Barres",                                              // un onglet de MT5, pas de Véna
    ]);
    const vus = [...txt.matchAll(/(?:onglet|zone|bouton|colonne|cadre) <strong>([^<]+)<\/strong>/g)]
      .map((m) => m[1].trim());
    assert.ok(vus.length > 0, "le balayage doit trouver des renvois");
    for (const v of vus) {
      assert.ok(CONNUS.has(v), "renvoi vers un élément inconnu : « " + v + " »");
    }
  });

  test(f + " : le mode d’emploi d’import est annoncé là où il se trouve", () => {
    const txt = source(f);
    // il était annoncé dans le Backtest ; le cadre est dans « Mes instruments »
    // on cherche le TITRE du cadre, pas une mention : le renvoi lui-même nomme le
    // cadre, et il est écrit plus haut dans le fichier
    const cadre = txt.search(/<strong[^>]*>Produire ces fichiers depuis MT5<\/strong>/);
    assert.ok(cadre > 0, "le titre du cadre d’import doit exister");
    const debutInstr = txt.indexOf('<sc-if value="{{ vueCourtiers }}"');
    assert.ok(debutInstr > 0 && cadre > debutInstr,
      "le cadre doit bien vivre dans la vue « Mes instruments »");
    assert.match(txt, /Le mode d'emploi d'import se trouve dans l'onglet <strong>Mes instruments<\/strong>/,
      "le renvoi doit nommer « Mes instruments »");
    // et le champ de dépôt n’est pas « en haut de l’écran »
    assert.ok(!txt.includes("zone de dépôt en haut de l'écran"),
      "le renvoi ne doit pas situer le champ sur une page où il n’est pas");
  });

  // ————— 3 · la licence —————
  test(f + " : un seul dictionnaire de formules commerciales", () => {
    const txt = source(f);
    // il en existait cinq — dont celui du robot exporté, où un nom qui diverge part
    // dans un fichier .mq5 qui circule
    for (const nom of ["abonnement mensuel", "formule annuelle", "licence à vie"]) {
      const n = (txt.match(new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      assert.equal(n, 1, "« " + nom + " » doit n’être écrit qu’une fois, vu " + n);
    }
    assert.match(txt, /PLANS = \{\s*\n\s*mensuel: \{ long: 'abonnement mensuel'/,
      "la table des formules doit être la source unique");
    assert.match(txt, /plan: this\.nomPlan\(l\.plan\), fin: l\.fin/,
      "le robot exporté doit lire la table, pas une copie");
    assert.match(txt, /this\.nomPlan\(l\.plan, 'court'\)/,
      "le résumé replié doit lire la forme courte de la table");
    assert.match(txt, /this\.nomPlan\(this\.PLAN_ACHETE\[k\], 'defini'\)/,
      "la page de vente doit lire la forme avec article de la table");
  });

  test(f + " : licEtatTxt nomme le titulaire sans refaire la phrase", () => {
    const txt = source(f);
    // il NOMME, c’est une décision — mais il ne reconstruit plus
    assert.match(txt, /licEtatTxt: \(\(\) => \{\s*\n\s*const m = this\.licenceMention\(\);/,
      "licEtatTxt doit demander la phrase à licenceMention()");
    assert.ok(!/licEtatTxt: lic && lic\.ok/.test(txt),
      "licEtatTxt ne doit plus reconstruire la phrase à partir de `lic`");
    // et il continue de nommer : le nom vient de la mention, qui porte le courriel
    assert.match(txt, /return 'licence de ' \+ l\.email \+ ', ' \+ this\.nomPlan\(l\.plan\)/,
      "licenceMention doit rester la seule à composer la phrase nominative");
    // le format de date PROPRE À licEtatTxt a disparu avec lui : il n’en garde plus.
    // (Trois formateurs de date de licence subsistent ailleurs — hors du périmètre
    // de cette passe, inventoriés pour la suivante.)
    const i = txt.indexOf("licEtatTxt:");
    const bloc = txt.slice(i, i + 600);
    assert.ok(!/split\('-'\)/.test(bloc),
      "licEtatTxt ne doit plus formater lui-même l’échéance");
  });

  // ————— 4 · le poids —————
  test(f + " : une seule façon d’écrire un poids", () => {
    const txt = source(f);
    const i = txt.indexOf("  taille(o) {");
    assert.ok(i > 0, "le formateur unique doit exister");
    const fin = txt.indexOf("\n  }", i);
    const dedans = txt.slice(i, fin);
    const hors = txt.slice(0, i) + txt.slice(fin);
    // aucun appelant ne recolle une unité : c’est ainsi qu’un octet s’écrivait
    // « 1 Mo » sur un écran et « 1,5 Mo » sur un autre
    for (const u of ["' Mo'", "' Go'", "' Ko'"]) {
      assert.ok(!hors.includes(u), "une unité de poids est recollée à la main : " + u);
    }
    // et le seuil du Go ne vit plus que là : ailleurs, un quota de 2 Go redevenait 2048 Mo
    assert.ok(!hors.includes("1073741824"), "le seuil du Go doit être dans le formateur seul");
    assert.ok(!/const mo2? = \(o\)/.test(txt), "aucun formateur local ne doit subsister");
    // la règle annoncée : décimale sous 10 Mo, entier au-dessus, Go partout
    assert.match(dedans, /o >= 1073741824/, "le Go doit être traité");
    assert.match(dedans, /o >= 10485760\) return Math\.round/, "au-dessus de 10 Mo, un entier");
    assert.match(dedans, /o >= 1048576\) return virgule/, "sous 10 Mo, une décimale");
  });

  test(f + " : le poids s’écrit selon la règle annoncée", () => {
    // la fonction est extraite du fichier livré et exécutée : un test sur la forme du
    // code ne dirait pas ce qu’un octet devient à l’écran
    const txt = source(f);
    const i = txt.indexOf("  taille(o) {");
    const corps = txt.slice(i + "  taille(o) {".length, txt.indexOf("\n  }", i));
    // eslint-disable-next-line no-new-func
    const taille = new Function("o", corps);
    const cas = [
      [0, "0 Ko"], [-5, "0 Ko"], [1, "1 Ko"], [16384, "16 Ko"], [1048575, "1024 Ko"],
      [1572864, "1,5 Mo"], [1048576, "1,0 Mo"], [10485759, "10,0 Mo"],
      [13631488, "13 Mo"], [1073741824, "1,0 Go"], [1288490188, "1,2 Go"],
    ];
    for (const [o, attendu] of cas) {
      assert.equal(taille(o), attendu, o + " octets doivent s’écrire « " + attendu + " »");
    }
    assert.equal(taille(NaN), "?", "une mesure absente ne doit pas s’écrire comme un poids");
    assert.equal(taille(undefined), "?");
  });

  // ————— 5 · l’état de protection —————
  test(f + " : un seul jeu de libellés pour l’état de protection", () => {
    const txt = source(f);
    assert.match(txt, /ETATS_PERSISTANCE = \{/, "la table des états doit exister");
    // les quatre états y sont, fallback compris : « pas encore mesurée » est celui
    // qu’on voit le plus souvent au début, il ne peut pas vivre dans un `||`
    for (const e of ["accordee:", "refusee:", "indisponible:", "inconnu:"]) {
      assert.ok(txt.includes("    " + e), "l’état " + e + " doit figurer dans la table");
    }
    // chaque libellé n’est écrit qu’une fois
    for (const l of ["Stockage protégé — le navigateur ne supprimera pas",
                     "Le navigateur ne purgera pas ce site",
                     "Protection indisponible dans ce navigateur"]) {
      const n = (txt.split(l).length - 1);
      assert.equal(n, 1, "« " + l + " » doit n’être écrit qu’une fois, vu " + n);
    }
    // les deux consommateurs lisent la table, ils ne rebâtissent plus
    assert.match(txt, /tirRisqueTitre: this\.etatPersistance\('titre'\)/);
    assert.match(txt, /tirRisquePhrase: this\.etatPersistance\('phrase'\)/);
    assert.match(txt, /persistNom: this\.etatPersistance\('court'\)/);
    assert.match(txt, /persistSous: this\.etatPersistance\('sous'\)/);
    // le jeu mort ne doit pas repousser
    for (const m of ["persistCls:", "persistTxt:", "persistPhrase:"]) {
      assert.ok(!txt.includes(m), "producteur mort ressuscité : " + m);
    }
    // aucune sélection d’état ne se fait plus par cascade de ternaires
    assert.ok(!/\}\[s\.persistEtat\]/.test(txt),
      "plus aucune table anonyme indexée par l’état ne doit subsister");
  });

  // ————— 6 · la date du dernier export —————
  test(f + " : une seule phrase de dernier export, dans un seul ordre", () => {
    const txt = source(f);
    // l’amorce et le contenu ne s’écrivent qu’une fois : le pied et le tiroir les
    // composaient chacun de son côté, et les deux nombres s’y lisaient à l’envers
    const tete = (txt.match(/'Dernier export : '/g) || []).length;
    assert.equal(tete, 1, "« Dernier export : » doit être écrit une fois, vu " + tete);
    const contenu = (txt.match(/nb\(info\.nS \|\| 0, 'série', 'séries'\)/g) || []).length;
    assert.equal(contenu, 1, "le contenu doit être composé une fois, vu " + contenu);
    // l’ordre est fixé : séries PUIS configurations
    assert.match(txt, /nb\(info\.nS \|\| 0, 'série', 'séries'\) \+ ', ' \+ nb\(info\.nC, 'configuration', 'configurations'\)/,
      "l’ordre doit être séries puis configurations");
    assert.ok(!/nb\(info\.nC, 'configuration', 'configurations'\) \+ ', ' \+ nb\(info\.nS/.test(txt),
      "l’ordre inverse ne doit plus exister");
    // les deux points lisent les mêmes morceaux
    assert.match(txt, /sauvExpTxt: !reduit \? '' : expTete/);
    assert.match(txt, /sauvExpSuite: !reduit \? '' : expSuite/);
    assert.match(txt, /tirExportTxt: t > 0 \? expTete \+ quand \+ expSuite/);
    // la clause de fin est celle de `depuis`, plus une copie
    assert.ok(!txt.includes("'Rien de mesuré depuis.'"),
      "la clause recopiée du tiroir ne doit plus exister");
  });

  // ————— 8 · le nom du bouton d’export —————
  test(f + " : le bouton d’export porte le nom que les messages lui donnent", () => {
    const txt = source(f);
    // six phrases renvoient à « Exporter mes données » par son nom
    const renvois = (txt.match(/« Exporter mes données »/g) || []).length;
    assert.ok(renvois >= 5, "les renvois nominatifs doivent exister, vu " + renvois);
    assert.match(txt, /sansSauvBouton: \(reduit \|\| integre\) \? 'Exporter mes données'/,
      "le bouton doit porter ce nom dans tout état où il exporte");
    assert.ok(!txt.includes("'Exporter à nouveau'\n"),
      "le nom variable de l’état « déjà exporté » ne doit plus exister");
    // …et le troisième état garde le sien : il est le seul chemin vers la sauvegarde
    // automatique, le renommer supprimerait la fonction
    assert.match(txt, /: 'Choisir le fichier de sauvegarde',/,
      "l’état qui n’exporte pas doit garder son nom propre");
    // AU MOINS deux, et non exactement deux. Ce garde-fou est là pour qu'un chemin ne
    // DISPARAISSE pas ; en figer le nombre interdisait d'en ouvrir un nouveau, alors que
    // le défaut d'origine était justement que la sauvegarde automatique n'était
    // atteignable que depuis un tiroir. La proposition au premier import réel en ajoute
    // un troisième.
    const chemins = (txt.match(/this\.choisirFichierAuto\(\)/g) || []).length;
    assert.ok(chemins >= 2, "le chemin vers la sauvegarde automatique doit survivre, vu " + chemins);
  });

  test(f + " : un seul calcul du reste, en combinaisons", () => {
    const txt = source(f);
    // il en existait trois : celui de `avancementScan`, un mort dans la boucle de scan,
    // et un vivant dans l'infobulle du bandeau — ce dernier comptait en INSTRUMENTS
    assert.ok(!/const reste = fait > 0/.test(txt),
      "aucun reste ne doit plus se calculer hors de `avancementScan`");
    assert.match(txt, /this\.duree\(avance\.ecoule\) \+ ' \\u00e9coul\\u00e9es'/,
      "l’infobulle doit lire l’écoulé de la constante partagée");
    assert.match(txt, /avance\.mesure && avance\.resteSec > 1/,
      "l’infobulle doit lire le reste de la constante partagée");
    // une seule division qui fabrique une durée restante dans tout le fichier
    const divisions = (txt.match(/ecoule \/ faites \* \(total - faites\)/g) || []).length;
    assert.equal(divisions, 1, "le reste doit se calculer à un seul endroit, vu " + divisions);
  });
}

// ————— 7 · l’index de l’aide —————
// Il vit dans aide-index.json, fabriqué depuis la page : il se teste une fois, pas
// une fois par fichier livré.
test("aide-index : aucun terme n’est un morceau de phrase voisine", async () => {
  const { readFileSync: lire } = await import("node:fs");
  const idx = JSON.parse(lire(new URL("../../aide-index.json", import.meta.url), "utf8"));
  assert.ok(idx.entrees.length > 100, "l’index doit être peuplé");
  for (const e of idx.entrees) {
    const t = (e.terme || "").trim();
    assert.ok(t.length > 0, "terme vide pour : " + (e.texte || "").slice(0, 50));
    // « fermer Unité », « fermer Depuis » : le grattage arrière ramassait le lien de
    // fermeture du panneau précédent. Dix entrées portaient ce préfixe.
    assert.ok(!/^fermer\b/i.test(t), "terme happé sur un panneau voisin : « " + t + " »");
    // « sur » : le libellé était « {{ n }} sur {{ total }} », il n’en restait que la
    // préposition. Un terme d’un seul mot outil ne nomme rien.
    assert.ok(!/^(sur|de|du|des|le|la|les|et|à|au|aux|un|une)$/i.test(t),
      "terme réduit à un mot outil : « " + t + " »");
    // « unité de creux reste faire » : quatre mots ramassés dans trois cellules voisines
    assert.ok(!/^[a-zà-ÿ]/.test(t) || t.length > 3,
      "terme commençant en minuscule et trop court : « " + t + " »");
    assert.ok(!/[:·—–]$/.test(t), "terme finissant sur une ponctuation : « " + t + " »");
  }
});

// Pas de test sur le BALISAGE ici : dix-sept autres libellés sont des trous, et ils
// donnent pourtant de bons termes depuis que la légende du groupe sert de repli. Exiger
// un mot fixe partout ferait changer dix-sept libellés à l’écran pour un défaut qui
// n’existe plus. L’invariant qui compte est celui de l’index, juste au-dessus.

// ————— 4.3 · les producteurs morts —————
for (const f of FICHIERS) {
  test(f + " : aucun producteur ne décrit un mécanisme retiré", () => {
    const txt = source(f);
    // `validesTxt` décrivait les pastilles d’abréviation, retirées de la ligne « À
    // ranger ». Aucun trou ne le lisait : réparer un producteur mort n’a pas de sens,
    // il redeviendrait faux le jour où quelqu’un rebranche son trou.
    for (const mort of ["validesTxt:", "aRangerTxt:"]) {
      assert.ok(!txt.includes(mort), "producteur mort ressuscité : " + mort);
    }
    assert.ok(!txt.includes("cliquez l’abr"),
      "aucune phrase ne doit décrire les pastilles d’abréviation retirées");
  });
}
