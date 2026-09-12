// ————— LA CLÉ PUBLIÉE N'EST PLUS CELLE DE DÉMONSTRATION —————
//
// CLE_PUB_LICENCE a longtemps valu la clé de démonstration, dont la PRIVÉE est en clair
// dans cle-demo.mjs — un fichier du dépôt, donc connu de quiconque le lit. N'importe qui
// pouvait se signer une licence à vie. Sans objet tant que rien n'est en vente ; mortel
// une minute après.
//
// CE QUE CE TEST PROTÈGE : qu'un retour en arrière, une régénération ratée, ou un
// `git checkout` malheureux ne ramène pas cette valeur SANS QUE PERSONNE NE LE VOIE. Une
// clé publique reste une clé publique bien formée : rien à l'écran ne distingue la vraie
// de celle de démonstration, et l'application continuerait de fonctionner — en acceptant
// les codes du monde entier.
//
// LA VALEUR INTERDITE N'EST PAS RECOPIÉE ICI : elle est LUE dans cle-demo.mjs. La recopier
// aurait créé une deuxième vérité à tenir à jour, et ce fichier aurait menti le jour où la
// paire de démonstration changerait — en laissant passer, précisément, ce qu'il interdit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLE_DEMO_PUBLIQUE, CLE_DEMO_PRIVEE } from "./cle-demo.mjs";

const RACINE = new URL("../../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, RACINE), "utf8");
const LIVRES = ["Vena.dc.html", "Vena.solo.html"];

const pubDe = (txt) => {
  const m = /CLE_PUB_LICENCE = '([A-Za-z0-9_-]{43})'/.exec(txt);
  assert.ok(m, "CLE_PUB_LICENCE manque, ou est mal formée");
  return m[1];
};

for (const f of LIVRES) {
  test(`${f} : la clé publiée n’est pas celle de démonstration`, () => {
    assert.notEqual(pubDe(lire(f)), CLE_DEMO_PUBLIQUE,
      "la clé de démonstration est redevenue la clé du produit : sa privée est en clair "
      + "dans le dépôt, donc n’importe quel lecteur peut se signer une licence à vie. "
      + "Relancez node scripts/licence/generer-cles.mjs, puis npm run app:solo.");
  });
}

test("la clé privée de démonstration n’est dans aucun fichier livré", () => {
  // le cœur du secret, jamais le tout : un extrait suffit à repérer une recopie, et ce
  // fichier n'a pas besoin d'en porter davantage
  const morceau = CLE_DEMO_PRIVEE.slice(20, 44);
  for (const f of LIVRES) {
    assert.ok(!lire(f).includes(morceau), `une clé privée est recopiée dans ${f}`);
  }
});

test("aucun repli sur une autre clé dans le vérificateur", () => {
  // un repli silencieux annulerait tout : la page doit vérifier avec UNE seule clé, la
  // sienne. Les deux chemins — WebCrypto et le repli JS pour les navigateurs sans
  // Ed25519 — lisent la MÊME constante ; le second est un repli d'ALGORITHME, pas de clé.
  const txt = lire("Vena.dc.html");
  const lectures = [...txt.matchAll(/deB64u\(this\.CLE_PUB_LICENCE\)/g)];
  assert.equal(lectures.length, 2,
    `${lectures.length} lectures de la clé, deux attendues (WebCrypto et repli JS)`);
  assert.ok(!/CLE_DEMO|cle-demo/.test(txt),
    "le fichier livré nomme la clé de démonstration : il ne doit pas la connaître");
  // et un échec de signature est un échec, jamais un passage en force
  assert.match(txt, /if \(!valide\) return \{ ok: false, motif: 'signature' \};/,
    "une signature invalide ne se solde plus par un refus net");
});

test("la clé du dépôt et celle du fichier livré sont la même", () => {
  // une rotation sans `npm run app:solo` laisserait l'application publiée sur l'ancienne
  // clé : elle refuserait tous les codes émis avec la nouvelle, sans rien expliquer
  const [a, b] = LIVRES.map((f) => pubDe(lire(f)));
  assert.equal(a, b, "le solo n’a pas été régénéré après la rotation de la clé");
});
