/**
 * LES TROIS PORTES — ce qui doit rester vrai.
 *
 *   1. Le chiffrement de la sauvegarde : AES-GCM + PBKDF2, en-tête versionné —
 *      un aller-retour restitue l'octet près, une phrase fausse échoue SANS indice,
 *      et le même chemin WebCrypto que la page (miroir Node) le prouve.
 *   2. Le relais d'usage : il ne laisse passer que le format annoncé, jette les
 *      champs inconnus, et répond 204 sans cible — rien n'est stocké nulle part.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { filtrerCharge, traiterUsage } from "../../netlify/functions/usage.mjs";

// ————— miroir Node du chiffrement de la page (mêmes primitives WebCrypto) —————
const cleDePhrase = async (phrase, sel, iter) => {
  const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase),
    "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sel, iterations: iter, hash: "SHA-256" },
    mat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};
const ITER = 600000;

test("sauvegarde chiffrée : aller-retour exact, phrase fausse refusée sans indice", async () => {
  const clair = JSON.stringify({ outil: "vena", version: 1,
    donnees: { "vena.portefeuilles.v1.client": '{"pfs":[1,2,3]}' } });
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await cleDePhrase("une phrase assez longue", sel, ITER);
  const chiffre = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle,
    new TextEncoder().encode(clair));
  const bonne = await cleDePhrase("une phrase assez longue", sel, ITER);
  const dechiffre = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, bonne, chiffre);
  assert.equal(new TextDecoder().decode(dechiffre), clair);
  const mauvaise = await cleDePhrase("une phrase presque longue", sel, ITER);
  await assert.rejects(() => crypto.subtle.decrypt({ name: "AES-GCM", iv }, mauvaise, chiffre),
    undefined, "une phrase fausse déchiffre quand même");
});

test("la page porte l'en-tête versionné et les mêmes constantes", () => {
  for (const f of ["Vena.dc.html", "Vena.solo.html"]) {
    const txt = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    // le marqueur ÉCRIT est le neuf ; l'ancien reste accepté à la lecture, sans date
    // limite — quelqu'un réimportera dans deux ans un fichier exporté aujourd'hui
    for (const attendu of ["vena_chiffre: 1", "PBKDF2-SHA256", "CHIFFRE_ITER = 600000",
      "Perdre la phrase", "vena_chiffre === 1", "b.sivula_chiffre === 1"]) {
      assert.ok(txt.includes(attendu), f + " ne porte plus « " + attendu + " »");
    }
    // le compteur est éteint par défaut, et rien n'est accumulé éteint
    assert.ok(txt.includes("actif: false, tampon: []"), f + " : le compteur n'est plus éteint par défaut");
    assert.ok(txt.includes("if (!u.actif) return;"), f + " : le compteur accumule même éteint");
  }
});

test("le robot exporté est nominatif — jamais dans les commentaires d'ordre", async () => {
  const { genererMQ5 } = await import("../../robot-mt5.js");
  const cfg = { sym: "T", entree: "croisement", ligne: "mediane", periode: 15, sl: 0.5,
    rr: 2, n: 1, total: 1, heures_entree: { debut: 0, fin: 0 } };
  const t = genererMQ5(cfg, { ut: "D1", magic: 1,
    licence: { email: "client@exemple.fr", plan: "formule annuelle", fin: "2027-10-07" } });
  assert.ok(/\|  Licence         : client@exemple\.fr/.test(t), "l'en-tête du robot ne porte pas le nom");
  assert.ok(/Print\("Licence : client@exemple/.test(t), "l'empreinte OnInit ne porte pas le nom");
  assert.ok(/# licence : client@exemple/.test(t), "le journal de conformité ne porte pas le nom");
  // la marque d'ordre envoyée au courtier ne porte JAMAIS l'e-mail
  const marque = t.match(/marque des ordres : (\S+)/);
  assert.ok(marque && !marque[1].includes("@"), "l'e-mail fuit dans la marque d'ordre");
  assert.ok(!/SetString\([^)]*@|Comment[^\n]*client@/.test(t), "l'e-mail approche un commentaire d'ordre");
  const sans = genererMQ5(cfg, { ut: "D1", magic: 1 });
  assert.ok(/Licence         : sans licence \(essai\)/.test(sans), "sans licence, le robot doit le dire");
});

test("le relais d'usage ne laisse passer que le format annoncé", async () => {
  assert.equal(filtrerCharge("pas du json"), null);
  assert.equal(filtrerCharge('{"outil":"autre","schema":1,"evenements":[]}'), null);
  const brut = JSON.stringify({ outil: "vena", schema: 1, evenements: [
    { type: "scan", combinaisons: 15120, duree_s: 12, unite: "H1", instruments: 3,
      filtres: ["rsi", "adx"], version: "260905", navigateur: "Chrome",
      // un client modifié glisse des champs en plus : ils doivent tomber
      email: "fuite@exemple.fr", serie: [1, 2, 3], sym: "GOLD" },
  ]});
  const filtre = filtrerCharge(brut);
  assert.equal(filtre.evenements.length, 1);
  const e = filtre.evenements[0];
  assert.equal(e.combinaisons, 15120);
  assert.deepEqual(e.filtres, ["rsi", "adx"]);
  assert.ok(!("email" in e) && !("serie" in e) && !("sym" in e),
    "des champs hors contrat traversent le relais");
  // sans cible : 204, la charge disparaît
  assert.equal((await traiterUsage(brut, {})).statut, 204);
  // avec cible : relayé tel quel (filtré), rien d'autre
  const vus = [];
  const r = await traiterUsage(brut, { USAGE_CIBLE: "https://mesure.exemple" },
    async (url, corps) => { vus.push({ url, corps }); return { ok: true }; });
  assert.equal(r.statut, 204);
  assert.equal(vus.length, 1);
  assert.ok(!vus[0].corps.includes("fuite@exemple.fr"), "le relais transmet un champ hors contrat");
  assert.equal((await traiterUsage("nimporte", {})).statut, 400);
});
