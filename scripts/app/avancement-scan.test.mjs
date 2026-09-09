/**
 * LA PROGRESSION SE COMPTE EN COMBINAISONS, PAS EN INSTRUMENTS.
 *
 * Le défaut s'est révélé sur un scan à UN SEUL instrument : le grand nombre restait
 * à 0 jusqu'à la fin, la jauge aussi, et la barre n'affichait aucune durée. Compter
 * les instruments ne peut pas faire autrement — il n'y en a qu'un, et il n'est fini
 * qu'à la toute fin. Les workers, eux, rapportent par lots.
 *
 * Ce test verrouille les trois invariants, sur le code livré :
 *   1. la boucle de scan incrémente le compte de combinaisons à chaque lot revenu,
 *      dans le chemin parallèle ET dans le repli séquentiel ;
 *   2. `avancementScan` est le SEUL calcul : la barre, la jauge, le bandeau et le
 *      titre de l'onglet le lisent, aucun ne recalcule ;
 *   3. il n'existe jamais d'état sans durée — avant la première mesure c'est
 *      l'estimation du repos, après c'est le reste observé.
 * La méthode est extraite du fichier livré et exécutée ici, pas recopiée.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FICHIERS = ["Sivula.dc.html", "Sivula.solo.html"];
const source = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");

function methode(txt, entete) {
  const i = txt.indexOf(entete);
  assert.ok(i >= 0, "méthode introuvable : " + entete);
  let prof = 0, j = txt.indexOf("{", i);
  const debut = j;
  for (; j < txt.length; j++) {
    if (txt[j] === "{") prof++;
    else if (txt[j] === "}") { prof--; if (!prof) return txt.slice(debut, j + 1); }
  }
  assert.fail("accolades non refermées pour " + entete);
}

for (const f of FICHIERS) {
  test(f + " : les deux boucles comptent les combinaisons revenues", () => {
    const corps = methode(source(f), "  async lancerScan(force) {");
    const n = (corps.match(/this\.avancerCombis\(/g) || []).length;
    assert.equal(n, 2, "attendu un compteur dans le chemin parallèle ET dans le repli, vu " + n);
    const repli = corps.slice(corps.indexOf("repli séquentiel"));
    assert.match(repli, /this\.avancerCombis\(1\)/,
      "le repli séquentiel mesure une variante à la fois : il doit avancer d’une variante");
    // et plus aucun avancement fondé sur le compte d'instruments
    assert.doesNotMatch(corps, /majTitreScan\(Math\.round\(\(fait/,
      "le titre de l’onglet ne doit plus suivre le compte d’instruments");
  });

  test(f + " : un seul calcul d’avancement pour tout l’écran", () => {
    const txt = source(f);
    // la jauge de la barre et celle du bandeau lisent le même trou
    assert.equal((txt.match(/\{\{ scanPct \}\}/g) || []).length, 2,
      "la jauge de la barre et le filet du bandeau doivent lire le même pourcentage");
    // L'avancement est calculé UNE FOIS par rendu, dans une constante que les trois
    // consommateurs lisent. Appeler la méthode trois fois relirait l'horloge trois
    // fois : mesuré, la barre annonçait « reste ≈ 53 s » pendant que le bandeau
    // annonçait « 52 s », dans le même rendu.
    assert.match(txt, /const avance = this\.avancementScan\(s\);/,
      "l’avancement doit être calculé une fois par rendu");
    assert.match(txt, /scanPct: avance\.pct/, "la jauge doit lire la constante partagée");
    assert.match(txt, /scanCourtTxt: avance\.pct \+ ' % /, "le bandeau doit lire la constante partagée");
    assert.match(txt, /barDroite: enCours \? avance\.resteTxt/, "la barre doit lire la constante partagée");
    assert.match(txt, /barGros: enCours \? Number\(avance\.faites\)/, "le grand nombre doit lire la constante partagée");
    // un seul appel dans le chemin de rendu : celui qui remplit la constante. Le second
    // vit hors rendu, dans `avancerCombis`, pour le titre de l'onglet.
    const appels = (txt.match(/this\.avancementScan\(/g) || []).length;
    assert.equal(appels, 2, "attendu un appel dans le rendu et un hors rendu, vu " + appels);
    // et plus aucun ratio d'instruments dans la jauge
    assert.doesNotMatch(txt, /scanPct: \(s\.scanNbSym/, "la jauge ne doit plus compter les instruments");
    // aucune trace des deux textes d’attente que 3A laissait passer
    assert.doesNotMatch(txt, /estimation en cours/, "« estimation en cours… » ne doit plus exister");
    assert.doesNotMatch(txt, /derniers instruments/, "« derniers instruments » ne doit plus exister");
  });

  test(f + " : la pastille de fin a quitté l’en-tête", () => {
    const txt = source(f);
    for (const t of ["{{ scanFini }}", "{{ scanFiniCourtTxt }}", "{{ echecsCourtTxt }}", "{{ fermerBandeau }}"]) {
      assert.ok(!txt.includes(t), t + " est encore rendu dans l’en-tête");
    }
    // le compte des non-testés n’est pas perdu pour autant : il a suivi dans la barre
    assert.match(txt, /non testé/, "le compte des instruments non testés doit rester à l’écran");
  });

  test(f + " : rien ne peut déloger le sélecteur de compte", () => {
    const txt = source(f);
    const i = txt.indexOf('<header');
    const entete = txt.slice(i, txt.indexOf("</header>", i));
    const rang = entete.slice(entete.indexOf('<div style="display:flex;align-items:center;gap:12px'));
    assert.match(rang.slice(0, 120), /flex:none/,
      "le rang qui porte le sélecteur de compte doit être insécable");
    // l’avancement vit APRÈS les onglets, jamais à la place du sélecteur
    assert.ok(entete.indexOf("{{ scanCourtTxt }}") > entete.indexOf("groupesNav"),
      "l’annonce d’avancement doit se placer après les onglets");
  });
}

/** `avancementScan`, extraite du fichier livré et rendue exécutable ici. */
function fabriquer(etat) {
  const corps = methode(source("Sivula.dc.html"), "  avancementScan(etat) {");
  // eslint-disable-next-line no-new-func
  const f = new Function("return function avancementScan(etat) " + corps + ";")();
  return { avancementScan: f, state: etat,
    duree: (s) => (s < 60 ? Math.round(s) + " s" : Math.round(s / 60) + " min") };
}

test("avant la première mesure : l’estimation du repos, jamais un état sans durée", () => {
  const o = fabriquer({ scanTestes: 200000, scanCombis: 0, scanT0: Date.now() - 3000, scanEstim: 239 });
  const a = o.avancementScan();
  assert.equal(a.faites, 0);
  assert.equal(a.pct, 0);
  assert.equal(a.mesure, false);
  assert.equal(a.resteSec, 239, "l’estimation du repos doit être reprise telle quelle");
  assert.match(a.resteTxt, /^≈ /, "au repos la durée s’annonce comme une estimation");
  assert.ok(a.resteTxt.length > 2, "il ne doit jamais y avoir d’état sans durée");
});

test("dès qu’une combinaison est revenue : le reste vient de la cadence observée", () => {
  // 50 000 sur 200 000 en 10 s → il reste 3 × 10 s
  const o = fabriquer({ scanTestes: 200000, scanCombis: 50000, scanT0: Date.now() - 10000, scanEstim: 239 });
  const a = o.avancementScan();
  assert.equal(a.faites, 50000);
  assert.equal(a.pct, 25);
  assert.equal(a.mesure, true);
  assert.ok(Math.abs(a.resteSec - 30) < 1.5, "reste attendu ≈ 30 s, vu " + a.resteSec);
  assert.match(a.resteTxt, /^reste ≈ /);
});

test("un seul instrument : le compte avance quand même", () => {
  // c’est le cas qui a révélé le défaut : scanFait reste à 0 tout du long
  const o = fabriquer({ scanTestes: 207360, scanCombis: 55296, scanNbSym: 1, scanFait: 0,
    scanT0: Date.now() - 20000, scanEstim: 239 });
  const a = o.avancementScan();
  assert.ok(a.pct > 0, "le pourcentage doit avancer sur un scan à un instrument");
  assert.equal(a.faites, 55296);
  assert.equal(a.mesure, true, "le reste doit être calculé, pas estimé");
});

test("le compte ne dépasse jamais le total annoncé", () => {
  const o = fabriquer({ scanTestes: 1000, scanCombis: 4000, scanT0: Date.now() - 5000, scanEstim: 10 });
  const a = o.avancementScan();
  assert.equal(a.faites, 1000);
  assert.equal(a.pct, 100);
});
