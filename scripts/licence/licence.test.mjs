/**
 * LA LICENCE SIGNÉE — les invariants que la vente ne doit jamais perdre.
 *
 *   1. Un code signé se vérifie ; un caractère changé le tue ; un autre e-mail le
 *      refuse en le disant ; une date passée le fait expirer en le disant.
 *   2. La durée vient du PLAN, jamais du montant — le webhook n'en transmet
 *      d'ailleurs aucun à finDePlan.
 *   3. Un webhook Revolut valide produit un code accepté ; REJOUÉ, il produit
 *      octet pour octet LE MÊME code (Ed25519 est déterministe) ; sans signature
 *      valide, 401 ; plan inconnu, 400 ; clé de démonstration, refus.
 *   4. La clé privée n'est ni dans la page source, ni dans le fichier livré.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { signerCode, verifierCode, finDePlan, genererCles, empreinteEmail } from "./licence-noyau.mjs";
import { traiter, signatureRevolutValide } from "../../netlify/functions/licence.mjs";
import { CLE_DEMO_PRIVEE } from "./cle-demo.mjs";

const CLES = genererCles();
const EMAIL = "client@exemple.fr";

test("signer puis vérifier : les trois plans, l'e-mail EN CLAIR et la date", async () => {
  const an = signerCode({ email: EMAIL, plan: "annuel", fin: "2027-10-07" }, CLES.privee);
  assert.deepEqual(verifierCode(an, CLES.publique, { email: EMAIL }),
    { ok: true, plan: "annuel", fin: "2027-10-07", email: EMAIL });
  const vie = signerCode({ email: EMAIL, plan: "vie" }, CLES.privee);
  assert.deepEqual(verifierCode(vie, CLES.publique, { email: EMAIL }),
    { ok: true, plan: "vie", fin: null, email: EMAIL });
  // la licence est NOMINATIVE : l'e-mail est EN CLAIR dans le jeton (v2), et la
  // vérification le rend — c'est lui que l'application affiche et écrit partout
  const rv = verifierCode(an, CLES.publique, { email: EMAIL });
  assert.equal(rv.email, EMAIL, "l'e-mail du jeton v2 n'est pas rendu");
  assert.ok(Buffer.from(an.split(".")[1], "base64url").toString("utf8").includes(EMAIL),
    "l'e-mail n'est pas en clair dans le payload v2");
  // la casse et les espaces de l'e-mail ne comptent pas
  assert.equal(verifierCode(an, CLES.publique, { email: "  Client@Exemple.FR " }).ok, true);
  // un jeton v1 (empreinte seule) émis hier se vérifie toujours
  const payloadV1 = '{"v":1,"e":"' + empreinteEmail(EMAIL) + '","p":"annuel","f":"2027-10-07"}';
  const { sign, createPrivateKey } = await import("node:crypto");
  const sigV1 = sign(null, Buffer.from(payloadV1, "utf8"),
    createPrivateKey({ key: Buffer.from(CLES.privee, "base64url"), format: "der", type: "pkcs8" }));
  const v1 = "SIV1." + Buffer.from(payloadV1, "utf8").toString("base64url") + "." + Buffer.from(sigV1).toString("base64url");
  assert.deepEqual(verifierCode(v1, CLES.publique, { email: EMAIL }),
    { ok: true, plan: "annuel", fin: "2027-10-07", email: undefined });
  assert.equal(verifierCode(v1, CLES.publique, { email: "autre@exemple.fr" }).motif, "email");
});

test("un caractère changé tue le code ; un autre e-mail est nommé ; l'expiration est datée", () => {
  const code = signerCode({ email: EMAIL, plan: "annuel", fin: "2027-10-07" }, CLES.privee);
  // chaque position altérée doit être refusée — signature ou forme, jamais ok
  for (const i of [6, Math.floor(code.length / 2), code.length - 2]) {
    const autre = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
    assert.equal(verifierCode(autre, CLES.publique, { email: EMAIL }).ok, false,
      "code altéré en position " + i + " accepté");
  }
  assert.equal(verifierCode(code, CLES.publique, { email: "autre@exemple.fr" }).motif, "email");
  const passe = signerCode({ email: EMAIL, plan: "mensuel", fin: "2026-01-15" }, CLES.privee);
  const r = verifierCode(passe, CLES.publique, { email: EMAIL, maintenant: Date.parse("2026-02-01T00:00:00Z") });
  assert.equal(r.motif, "expire");
  assert.equal(r.fin, "2026-01-15");
  // la journée de fin est comprise
  assert.equal(verifierCode(passe, CLES.publique,
    { email: EMAIL, maintenant: Date.parse("2026-01-15T22:00:00Z") }).ok, true);
  // un code signé avec la clé de démonstration ne passe pas la vraie clé
  const forge = signerCode({ email: EMAIL, plan: "vie" }, CLE_DEMO_PRIVEE);
  assert.equal(verifierCode(forge, CLES.publique, { email: EMAIL }).motif, "signature");
});

test("la durée vient du plan : mensuel = période + 7 jours, annuel = 13 mois, vie = jamais", () => {
  const ref = Date.parse("2026-09-07T12:00:00Z");
  assert.equal(finDePlan("mensuel", { refMs: ref }), "2026-10-15"); // +31 j +7 j
  assert.equal(finDePlan("mensuel", { refMs: ref, periodeFinMs: Date.parse("2026-10-07T12:00:00Z") }),
    "2026-10-14"); // fin de période fournie + 7 j de grâce
  assert.equal(finDePlan("annuel", { refMs: ref }), "2027-10-07");
  assert.equal(finDePlan("vie", {}), null);
});

// ————— le webhook, de bout en bout —————
const ENV = {
  LICENCE_CLE_PRIVEE: CLES.privee,
  REVOLUT_SIGNING_SECRET: "wsk_secret_de_test",
  PLAN_MENSUEL: "plan_m", PLAN_ANNUEL: "plan_a", PLAN_VIE: "plan_v",
  RESEND_API_KEY: "x", LICENCE_EXPEDITEUR: "Véna <code@exemple.fr>",
};
const corpsDe = (planId) => JSON.stringify({
  event: "ORDER_COMPLETED", order_id: "ord_1",
  order: { completed_at: "2026-09-07T10:00:00Z", customer: { email: EMAIL },
    line_items: [{ product_id: planId }] },
});
const entetesDe = (corps, secret = ENV.REVOLUT_SIGNING_SECRET, ts = "1757200000") => ({
  "revolut-request-timestamp": ts,
  "revolut-signature": "v1=" + createHmac("sha256", secret)
    .update("v1." + ts + "." + corps, "utf8").digest("hex"),
});
const capteur = () => {
  const vus = [];
  return { vus, envoyer: async (m) => { vus.push(m); return { ok: true }; } };
};

test("webhook valide → un code accepté, avec le bon plan et la bonne date", async () => {
  const corps = corpsDe("plan_a");
  const { vus, envoyer } = capteur();
  const r = await traiter(corps, entetesDe(corps), ENV, envoyer);
  assert.equal(r.statut, 200);
  assert.equal(vus.length, 1);
  assert.equal(vus[0].a, EMAIL);
  const code = vus[0].texte.match(/SIV1\.[A-Za-z0-9_.-]+/)[0];
  assert.deepEqual(verifierCode(code, CLES.publique, { email: EMAIL }),
    { ok: true, plan: "annuel", fin: "2027-10-07", email: EMAIL });
  assert.ok(vus[0].texte.includes("07/10/2027"), "la date de fin manque au mail");
  assert.ok(vus[0].texte.includes("personnel"), "la mention « personnel » manque au mail");
});

test("le même webhook rejoué produit exactement le même code", async () => {
  const corps = corpsDe("plan_m");
  const a = capteur(), b = capteur();
  await traiter(corps, entetesDe(corps), ENV, a.envoyer);
  await traiter(corps, entetesDe(corps, ENV.REVOLUT_SIGNING_SECRET, "1757999999"), ENV, b.envoyer);
  const codeDe = (v) => v.vus[0].texte.match(/SIV1\.[A-Za-z0-9_.-]+/)[0];
  assert.equal(codeDe(a), codeDe(b), "deux codes différents pour le même paiement : l'idempotence est perdue");
});

test("sans signature Revolut valide : 401, et rien n'est envoyé", async () => {
  const corps = corpsDe("plan_a");
  const { vus, envoyer } = capteur();
  for (const entetes of [{}, entetesDe(corps, "mauvais_secret"),
    { "revolut-request-timestamp": "1", "revolut-signature": "v1=abcd" }]) {
    const r = await traiter(corps, entetes, ENV, envoyer);
    assert.equal(r.statut, 401);
  }
  assert.equal(vus.length, 0);
  assert.equal(signatureRevolutValide(corps, entetesDe(corps), ENV.REVOLUT_SIGNING_SECRET), true);
});

test("plan inconnu 400 · événement non-paiement ignoré · clé de démonstration refusée", async () => {
  const { vus, envoyer } = capteur();
  const inconnu = corpsDe("plan_inconnu");
  assert.equal((await traiter(inconnu, entetesDe(inconnu), ENV, envoyer)).statut, 400);
  const autre = JSON.stringify({ event: "ORDER_CANCELLED" });
  assert.equal((await traiter(autre, entetesDe(autre), ENV, envoyer)).statut, 200);
  const corps = corpsDe("plan_a");
  const r = await traiter(corps, entetesDe(corps), { ...ENV, LICENCE_CLE_PRIVEE: CLE_DEMO_PRIVEE }, envoyer);
  assert.equal(r.statut, 500, "la fonction signe avec la clé de démonstration du dépôt");
  assert.equal(vus.length, 0);
});

test("la clé privée n'est ni dans la page, ni dans le fichier livré ; la page porte le miroir", () => {
  const morceau = CLE_DEMO_PRIVEE.slice(20, 44);
  // La clé publique n'est PAS figée sur celle de démonstration : le jour où
  // generer-cles.mjs pose la vraie paire, ce test doit continuer à protéger sans
  // qu'on ait à le rouvrir. Ce qu'il garantit : les deux fichiers portent une clé
  // publique bien formée, et c'est la MÊME — un solo régénéré après la rotation,
  // sinon l'application livrée refuserait tous les codes émis.
  const cles = new Set();
  for (const f of ["Vena.dc.html", "Vena.solo.html"]) {
    const txt = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    assert.ok(!txt.includes(morceau), "la clé privée de démonstration est dans " + f);
    const m = /CLE_PUB_LICENCE = '([A-Za-z0-9_-]{43})'/.exec(txt);
    assert.ok(m, "la clé publique manque, ou est mal formée, dans " + f);
    cles.add(m[1]);
    // le miroir WebCrypto : même préfixe de format, même algorithme, mêmes motifs
    for (const attendu of ["SIV1\\.", "Ed25519", "'expire'", "'email'", "'signature'"]) {
      assert.ok(txt.includes(attendu), f + " ne porte plus « " + attendu + " »");
    }
  }
  assert.equal(cles.size, 1,
    "la page et le fichier livré ne portent pas la même clé publique : régénérez le solo");
  // l'empreinte du jeton n'est pas réversible : 16 octets de SHA-256, pas l'e-mail
  assert.equal(empreinteEmail("a@b.c").length, 22);
});
