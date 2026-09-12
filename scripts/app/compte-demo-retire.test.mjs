// ————— LE COMPTE DE DÉCOUVERTE A RENDU SA PLACE —————
//
// Il était le SIXIÈME compte d'un sélecteur qui en offre cinq, avec ses bougies écrites
// dans le navigateur, son relevé de frais à lui, et un semis versionné pour les refaire
// quand le générateur changeait. Trois défauts, et aucun n'était cosmétique :
//
//   · il occupait une place de compte que l'utilisateur ne pouvait pas récupérer ;
//   · ses bougies pesaient dans la jauge et partaient dans « Exporter mes données »,
//     alors que personne n'a besoin de sauvegarder des séries reproductibles ;
//   · ses frais appartenaient au COMPTE : le spread d'une série changeait selon
//     l'onglet depuis lequel on la regardait.
//
// Les dix séries d'exemple vivent maintenant en mémoire, visibles depuis n'importe quel
// compte, et leurs frais viennent de la table du générateur.
//
// CE QUE CES GARDES TIENNENT : qu'aucune de ces trois propriétés ne se reperde en
// silence. Aucune ne porte sur un libellé.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RACINE = new URL("../../", import.meta.url);
const APP = readFileSync(new URL("Vena.dc.html", RACINE), "utf8");

/** Le corps d'une méthode, de sa signature à la borne donnée. */
function bloc(debut, fin) {
  const i = APP.indexOf(debut);
  assert.ok(i > 0, `« ${debut} » a disparu`);
  const j = APP.indexOf(fin, i);
  assert.ok(j > i, `la fin « ${fin} » ne se trouve plus après « ${debut} »`);
  return APP.slice(i, j);
}

test("le compte de découverte n’est plus un compte", () => {
  const table = bloc("COURTIERS = [", "];");
  assert.ok(!/'demo'/.test(table), "le compte démo est revenu dans la table des comptes");
  assert.equal((table.match(/\['compte|\['fxpro/g) || []).length, 5,
    "le sélecteur doit offrir cinq comptes, ni plus ni moins");
});

test("le compte actif est validé par une LISTE BLANCHE, pas par une liste noire", () => {
  // Une session enregistrée désigne peut-être encore `ongCourtier: 'demo'`. Une liste
  // noire — « si c'est démo, retomber sur le nº 1 » — ne protège que du cas qu'on a
  // pensé ; la prochaine clé morte rendra l'écran vide sans un mot, exactement comme le
  // jour où la page d'accueil a été retirée sans garder la porte.
  const corps = bloc("  get compteActif() {", "\n  }");
  assert.match(corps, /this\.COURTIERS\.some\(/,
    "compteActif doit vérifier que la clé existe dans la table, pas nommer celles qui n’existent plus");
  assert.ok(!/=== 'demo'/.test(corps), "une liste noire est revenue");
});

test("les frais d’une série d’exemple suivent l’instrument, pas l’onglet ouvert", () => {
  const corps = bloc("  ligneCourtier(cle, symBrut) {", "\n  }");
  const iEx = corps.indexOf("estExemple(symBrut)");
  const iTable = corps.indexOf("this.baremes");
  assert.ok(iEx > 0, "ligneCourtier ne connaît plus les séries d’exemple");
  assert.ok(iEx < iTable,
    "le relevé d’exemple doit répondre AVANT la table du compte : lu après, il dépendrait du compte");
});

test("le relevé d’exemple est déjà chiffré — pas un export brut à convertir", () => {
  // Écrit en points, il restait « coût non chiffrable » tant qu'une conversion de prix
  // n'était pas passée. Mesuré à l'écran : « spread 0,000 % » sur les dix.
  const corps = bloc("function baremeExemples() {", "\n}");
  assert.match(corps, /mt4: false/, "un relevé marqué MT4 attend un prix pour devenir lisible");
  assert.match(corps, /chiffre: true/);
  assert.match(corps, /spread_pct: spreadPct/,
    "le spread doit être en pour-cent du notionnel, comme un relevé retraité");
});

test("les séries d’exemple n’entrent jamais dans le stockage", () => {
  const poser = bloc("  poserExemples() {", "\n  }");
  assert.ok(!/garderSerie|grosSet|localStorage/.test(poser),
    "poserExemples écrit quelque part : un exemple n’est pas une donnée");
  // et la couverture, qui est la seule chose qu'elles produisent, est retirée à l'écriture
  const ecrire = bloc("  ecrireCouv(m) {", "\n  }");
  assert.match(ecrire, /!estExemple\(k\)/,
    "la carte de couverture lue est celle qu’on réécrit : sans filtre, les exemples s’y enregistrent");
});

test("elles ne comptent ni dans le palier gratuit ni dans « rien de déposé »", () => {
  // Deux comptages, deux conséquences différentes, et aucun ne doit les voir : le palier
  // fermerait la mesure à quelqu'un qui n'a rien déposé, et le bandeau d'arrivée —
  // la seule porte visible vers le champ de clé — disparaîtrait au premier chargement.
  assert.match(APP, /const persos = new Set\(\[\.\.\.\(this\.state\.deposes \|\| \[\]\), \.\.\.ajoutes\]\s*\n\s*\.filter\(\(x\) => !estExemple\(x\)\)\);/);
  assert.match(APP, /aCompteVide: !\(this\.state\.deposes \|\| \[\]\)\.filter\(\(x\) => !estExemple\(x\)\)\.length,/);
});

test("la migration ne touche QUE les clés du compte retiré, et une seule fois", () => {
  const corps = bloc("  async retirerCompteDemo() {", "\n  }");
  // un SUFFIXE, jamais un fragment : « demo » cherché n'importe où aurait emporté la
  // clé d'un utilisateur ayant nommé un compte « demo-perso »
  assert.match(corps, /\/\\\.demo\$\//, "la sélection des clés doit être ancrée en fin de clé");
  assert.ok(!/includes\('demo'\)|indexOf\('demo'\)/.test(corps),
    "une recherche non ancrée emporterait des clés voisines");
  // idempotente PAR UNE MARQUE : « il ne reste rien à faire » rebalaye tout le stockage
  // à chaque chargement pour rien
  assert.match(corps, /this\.MARQUE_SANS_DEMO/);
  const iMarqueLue = corps.indexOf("getItem(this.MARQUE_SANS_DEMO)");
  const iMarqueEcrite = corps.indexOf("setItem(this.MARQUE_SANS_DEMO");
  assert.ok(iMarqueLue >= 0 && iMarqueEcrite > iMarqueLue, "la marque doit être lue avant d’être posée");
  // et les index sont lus AVANT d'être retirés, sinon les blocs de bougies restent
  // orphelins pour toujours — la panne qui a déjà laissé 147 séries et 97 Mo derrière
  const iLitIndex = corps.indexOf("blocs.push");
  const iSupprIndex = corps.indexOf("localStorage.removeItem");
  assert.ok(iLitIndex > 0 && iLitIndex < iSupprIndex,
    "l’index doit être lu avant d’être effacé, sinon ses blocs deviennent inatteignables");
});

test("masquer les séries d’exemple est réversible, et ne prétend pas les supprimer", () => {
  // Il n'y a RIEN à supprimer : elles sont engendrées à chaque ouverture. Un bouton
  // « supprimer » mentirait sur ce qu'il fait.
  const corps = bloc("  retirerExemples() {", "\n  }");
  assert.ok(!/grosSet|localStorage|removeItem/.test(corps),
    "retirer une série d’exemple ne doit rien effacer : il n’y a rien d’écrit");
  assert.match(APP, /basculerExemples: \(\) => \{/);
  assert.match(APP, /if \(cache\) this\.retirerExemples\(\); else this\.poserExemples\(\);/,
    "l’interrupteur doit poser ET reposer : un geste qui ne se défait pas n’est pas un masque");
});

test("la provenance est un filtre à part, pas une variante du filtre des bougies", () => {
  // « Avec bougies » demande ce qui est mesurable ; la provenance demande d'où ça vient.
  // Les fondre en un seul segment rendrait impossible « mes instruments qui ont des
  // bougies », qui est la vue de travail.
  assert.match(APP, /name="filtreProv"/);
  assert.match(APP, /name="filtreBougies"/);
  assert.match(APP, /if \(pv === 'vous' && estExemple\(sym\)\) return false;/);
  assert.match(APP, /if \(pv === 'exemple' && !estExemple\(sym\)\) return false;/);
});

test("l’univers d’exemple monte, et l’application le dit", () => {
  // C'est le seul point que le code ne peut pas corriger : sur ces trois ans, la médiane
  // des dix familles finit à +39 %. Un balayage y trouvera facilement un résultat
  // flatteur, et l'utilisateur l'attribuera à son idée. Rechoisir la graine jusqu'à ce
  // qu'elle tombe bien serait un réglage du marché ; le dire coûte une ligne.
  const n = (APP.match(/cet univers[^<]*monte/gi) || []).length
    + (APP.match(/univers d\\u2019exemple MONTE/g) || []).length;
  assert.ok(n >= 2,
    `l’avertissement n’apparaît que ${n} fois — il doit être là où les séries s’expliquent`);
});
