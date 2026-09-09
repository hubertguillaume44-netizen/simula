/**
 * La vérification Ed25519 « en clair » de l'application, verrouillée sur node:crypto.
 *
 * Beaucoup de navigateurs n'exposent pas Ed25519 dans `crypto.subtle` : le code
 * d'accès y était refusé par « ce navigateur ne sait pas vérifier la signature »,
 * c'est-à-dire qu'un client venant de payer ne pouvait pas activer sa licence.
 * L'application porte donc un repli qui refait le calcul lui-même.
 *
 * Ce repli DOIT dire exactement ce que dit node : oui sur une vraie signature, non
 * sur tout le reste. Un « non » de trop ferme la porte à un client légitime ; un
 * « oui » de trop laisse forger des codes. Le code testé n'est pas recopié ici : il
 * est EXTRAIT de Vena.dc.html et de Vena.solo.html entre ses deux marques, et
 * exécuté tel quel — les deux fichiers doivent donc porter la même version.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign as signerNode, randomBytes } from "node:crypto";
import { signerCode } from "./licence-noyau.mjs";
import { CLE_DEMO_PRIVEE, CLE_DEMO_PUBLIQUE } from "./cle-demo.mjs";

const DEBUT = "// ————— DÉBUT Ed25519 EN CLAIR —————";
const FIN = "// ————— FIN Ed25519 EN CLAIR —————";

/** Le code du navigateur, pris dans le fichier livré et rendu exécutable ici. */
function extraire(fichier) {
  const txt = readFileSync(new URL("../../" + fichier, import.meta.url), "utf8");
  const i = txt.indexOf(DEBUT), j = txt.indexOf(FIN);
  assert.ok(i >= 0 && j > i, "les marques Ed25519 manquent dans " + fichier);
  const src = txt.slice(i, j + FIN.length);
  return { src, fn: new Function(src + "\nreturn { ed25519Verifie, edDecode };")() };
}

const deB64u = (t) => Buffer.from(t, "base64url");
/** Une paire Ed25519 de node, sous la forme brute que le navigateur reçoit. */
function paireNode() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { privee: privateKey, publique: new Uint8Array(spki.subarray(spki.length - 32)) };
}

test("la page et le fichier livré portent le MÊME code de vérification", () => {
  assert.equal(extraire("Vena.dc.html").src, extraire("Vena.solo.html").src,
    "Vena.solo.html n'a pas été régénéré après une modification du repli Ed25519");
});

test("il dit oui à 30 vraies signatures, sur des messages de toutes tailles", async () => {
  const { ed25519Verifie } = extraire("Vena.dc.html").fn;
  for (let i = 0; i < 30; i++) {
    const { privee, publique } = paireNode();
    const msg = new Uint8Array(randomBytes(i === 0 ? 0 : i * 7 + 1));
    const sig = new Uint8Array(signerNode(null, Buffer.from(msg), privee));
    assert.equal(await ed25519Verifie(sig, msg, publique), true,
      "signature valide refusée au tirage " + i);
  }
});

test("il dit non à tout le reste : signature, message, clé, canonicité", async () => {
  const { ed25519Verifie } = extraire("Vena.dc.html").fn;
  const { privee, publique } = paireNode();
  const msg = new Uint8Array(Buffer.from("le message qui compte", "utf8"));
  const sig = new Uint8Array(signerNode(null, Buffer.from(msg), privee));
  assert.equal(await ed25519Verifie(sig, msg, publique), true, "témoin : la vraie doit passer");

  // un bit retourné dans la signature, à chaque octet
  for (let o = 0; o < 64; o++) {
    const faux = sig.slice(); faux[o] ^= 1;
    assert.equal(await ed25519Verifie(faux, msg, publique), false, "signature altérée acceptée (octet " + o + ")");
  }
  // un bit retourné dans le message
  for (let o = 0; o < msg.length; o++) {
    const autre = msg.slice(); autre[o] ^= 1;
    assert.equal(await ed25519Verifie(sig, autre, publique), false, "message altéré accepté (octet " + o + ")");
  }
  // la clé publique d'un autre
  assert.equal(await ed25519Verifie(sig, msg, paireNode().publique), false, "clé étrangère acceptée");
  // S non canonique (S ≥ L) : refusé, comme node
  const nonCanon = sig.slice(); nonCanon[63] |= 0xf0;
  assert.equal(await ed25519Verifie(nonCanon, msg, publique), false, "scalaire non canonique accepté");
  // longueurs absurdes
  assert.equal(await ed25519Verifie(sig.slice(0, 63), msg, publique), false);
  assert.equal(await ed25519Verifie(sig, msg, publique.slice(0, 31)), false);
});

test("une clé publique qui n'est pas un point de la courbe est refusée", async () => {
  const { ed25519Verifie, edDecode } = extraire("Vena.dc.html").fn;
  let refusees = 0;
  for (let i = 0; i < 40; i++) {
    const brut = new Uint8Array(randomBytes(32));
    if (edDecode(brut) === null) {
      refusees++;
      assert.equal(await ed25519Verifie(new Uint8Array(64), new Uint8Array(1), brut), false);
    }
  }
  assert.ok(refusees > 5, "trop peu de clés hors courbe tirées : " + refusees + " sur 40");
});

test("un vrai code d'accès Véna passe le repli, un code trafiqué non", async () => {
  const { ed25519Verifie } = extraire("Vena.dc.html").fn;
  const code = signerCode({ email: "client@exemple.fr", plan: "vie", fin: null }, CLE_DEMO_PRIVEE);
  const [, p, sg] = code.split(".");
  const pub = new Uint8Array(deB64u(CLE_DEMO_PUBLIQUE));
  assert.equal(await ed25519Verifie(new Uint8Array(deB64u(sg)), new Uint8Array(deB64u(p)), pub), true);

  // le même jeton, un caractère de l'e-mail changé : la signature ne suit pas
  const trafique = Buffer.from(deB64u(p).toString("utf8").replace("client@", "cliont@"), "utf8");
  assert.equal(await ed25519Verifie(new Uint8Array(deB64u(sg)), new Uint8Array(trafique), pub), false);
});

test("vecteur RFC 8032 : la référence publique, pas seulement nos propres tirages", async () => {
  const h = (x) => new Uint8Array(Buffer.from(x, "hex"));
  // TEST 2 de la RFC 8032 §7.1 : message d'un octet (0x72)
  const pub = h("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c");
  const msg = h("72");
  const sig = h("92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da"
    + "085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00");
  const { ed25519Verifie } = extraire("Vena.dc.html").fn;
  assert.equal(await ed25519Verifie(sig, msg, pub), true, "le vecteur de la RFC est refusé");
  const faux = sig.slice(); faux[0] ^= 0x80;
  assert.equal(await ed25519Verifie(faux, msg, pub), false);
});
