// ————— UNE SEULE ADRESSE, À UN SEUL ENDROIT —————
//
// L'adresse de contact était écrite QUATRE fois : deux emplacements — l'encart « Espace
// client » et le pied de la page de vente — et à chacun le href du mailto puis le texte
// du lien. Une information qui vit à plusieurs endroits finit par diverger, et ici la
// divergence est MUETTE : le texte annonce une adresse, le lien en ouvre une autre, et
// personne ne s'en aperçoit avant qu'un client contrarié écrive dans le vide.
//
// La leçon dépasse l'adresse : un correctif qui ne corrige qu'une occurrence sur quatre
// laisse le défaut en place. D'où la constante, et ce test qui interdit d'en réécrire
// une cinquième.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RACINE = new URL("../../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, RACINE), "utf8");

// Un littéral d'adresse électronique. Volontairement large — on veut attraper toute
// adresse écrite en dur, pas seulement celle qu'on vient de retirer.
const ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Les adresses écrites en dur, avec leur ligne — hors ligne de la constante. */
function litteraux(source) {
  const out = [];
  source.split("\n").forEach((l, i) => {
    // LA ligne autorisée : la déclaration de la constante, et elle seule
    if (/const MAIL_CONTACT = '/.test(l)) return;
    for (const m of l.match(ADRESSE) || []) out.push({ ligne: i + 1, adresse: m, texte: l.trim().slice(0, 100) });
  });
  return out;
}

for (const fichier of ["Vena.dc.html", "Vena.solo.html"]) {
  test(`${fichier} : aucune adresse en dur hors de MAIL_CONTACT`, () => {
    const vus = litteraux(lire(fichier));
    assert.deepEqual(vus.map((v) => `l.${v.ligne} — ${v.adresse}`), [],
      "une adresse est écrite en dur : posez-la dans MAIL_CONTACT et lisez-la");
  });
}

test("la constante existe, et porte une adresse qui n’est pas un nom civil", () => {
  const src = lire("Vena.dc.html");
  const m = src.match(/const MAIL_CONTACT = '([^']+)';/);
  assert.ok(m, "MAIL_CONTACT a disparu : l’adresse est redevenue une copie parmi d’autres");
  assert.match(m[1], ADRESSE, `« ${m[1]} » n’est pas une adresse`);
  // ce qui devait partir, c'est le nom civil dans l'adresse — pas le fournisseur
  assert.ok(!/hubert|guillaume/i.test(m[1]), "l’adresse porte encore un nom civil");
});

test("le href ET le texte viennent de la même valeur", () => {
  const src = lire("Vena.dc.html");
  // Chaque lien lit les DEUX trous — jamais une adresse recopiée. On ne compte plus les
  // emplacements : un nombre en dur fait échouer le test le jour où l'adresse rend
  // service à un endroit de plus, pour une raison qui n'a rien à voir avec ce qu'il
  // éprouve. Ce qui compte, c'est qu'aucun lien ne porte une adresse écrite à la main.
  const liens = [...src.matchAll(/<a href="\{\{ mailContactHref \}\}">\{\{ mailContact \}\}<\/a>/g)];
  assert.ok(liens.length >= 1, "plus aucun lien de contact dans la page");
  const enDur = [...src.matchAll(/<a[^>]*href="mailto:[^"]*"/g)];
  assert.deepEqual(enDur.map((m) => m[0]), [],
    "une adresse est écrite en dur dans un lien au lieu de venir de la constante");
  // et les deux trous sortent bien de la constante, pas d'une chaîne réécrite
  assert.match(src, /mailContact: MAIL_CONTACT,/);
  assert.match(src, /mailContactHref: 'mailto:' \+ MAIL_CONTACT,/);
  // un seul mailto dans tout le fichier : celui-là
  const mailtos = [...src.matchAll(/mailto:/g)];
  assert.equal(mailtos.length, 1, `${mailtos.length} « mailto: » — un seul attendu`);
});

test("l’adresse n’est ni obfusquée ni remplacée par un formulaire", () => {
  const src = lire("Vena.dc.html");
  // un moissonneur sérieux n'est arrêté par aucune des deux, et l'une comme l'autre
  // retire le clic à quelqu'un qui a perdu sa clé — donc déjà contrarié
  assert.ok(!/&#\d+;@|\[at\]| chez .*point /i.test(src), "l’adresse est obfusquée");
  assert.match(src, /<a href="\{\{ mailContactHref \}\}">/, "le lien doit rester cliquable");
});

// ————— LES DEUX FAUX POSITIFS À NE PAS ATTRAPER —————

test("le champ du courriel d’achat existe encore, et n’est pas une adresse", () => {
  const src = lire("Vena.dc.html");
  // LE CHAMP DOIT CONTINUER D'EXISTER : ce test échouerait si on l'avait supprimé par
  // zèle en croyant retirer une adresse. Il n'est plus reconnu à son texte d'attente —
  // il porte désormais un LIBELLÉ, qui ne disparaît pas à la première frappe — mais à
  // son identifiant, qui est ce à quoi le libellé s'attache.
  assert.match(src, /<label for="tirLicEmail">Courriel de l['’]achat<\/label>/,
    "le champ du courriel d’achat a disparu — ce n’était pas une adresse");
  assert.match(src, /id="tirLicEmail"[^>]*type="email"/,
    "le champ doit rester un champ de courriel");
  // et l'intitulé n'est pas une adresse : c'est ce que le test principal éprouve déjà,
  // on le redit ici pour qu'un lecteur sache que sa présence n'est pas un oubli
  assert.ok(!/Courriel de l['’]achat[^<]*@/.test(src), "une adresse s’est glissée dans l’intitulé");
});

test("la mention nominative de licence porte l’adresse de l’ACHETEUR, pas la nôtre", () => {
  const src = lire("Vena.dc.html");
  // elle est là pour décourager le prêt d'un code : on n'y touche pas. La donnée est
  // saisie à l'exécution, donc elle n'est jamais un littéral du source.
  assert.match(src, /licenceMention\(\)/, "la mention nominative a disparu");
  assert.match(src, /'licence de ' \+ l\.email/,
    "la mention doit lire l’adresse de l’acheteur, jamais une constante");
  // et elle ne figure évidemment pas dans les littéraux : le test principal le prouve
  // déjà, mais on le dit ici pour qu’un lecteur sache que ce n’est pas un oubli
  assert.ok(!/const .*= 'licence de /.test(src));
});
