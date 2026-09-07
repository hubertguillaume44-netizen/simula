/**
 * Le NOYAU de la licence : format du code, signature, vérification, durées.
 *
 * Le code n'est pas une entrée dans une base : c'est une LICENCE SIGNÉE. Le jeton
 * porte l'e-mail de l'acheteur, le plan et la date de fin ; la signature Ed25519
 * se vérifie hors ligne avec la seule clé publique.
 * Personne ne peut forger un code sans la clé privée, l'application n'appelle
 * jamais l'extérieur, et rien n'est stocké nulle part.
 *
 * Ed25519 et non ECDSA : la signature est DÉTERMINISTE. Le même webhook rejoué
 * produit octet pour octet le même code — l'idempotence est gratuite, aucun état
 * à garder côté fonction. (ECDSA tire un aléa à chaque signature : deux appels
 * identiques donneraient deux codes différents.)
 *
 * Format : SIV1.<base64url(payload JSON)>.<base64url(signature 64 octets)>
 * Payload v2, clés dans CET ordre (le JSON est signé tel quel, l'ordre en fait partie) :
 *   {"v":2,"m":"<e-mail EN CLAIR>","p":"mensuel|annuel|vie","f":"AAAA-MM-JJ"}
 *   — « f » absent pour la licence à vie.
 * La licence est NOMINATIVE : l'e-mail de l'acheteur est dans le jeton en clair,
 * l'application l'affiche et le porte dans tout ce qui sort — la signature empêche
 * de fabriquer un code, le nom rend le prêt visible et sans intérêt. Les jetons v1
 * (empreinte seule) restent vérifiables : un code émis hier ne meurt pas.
 *
 * Ce fichier est du Node pur (fonction serverless, CLI, tests). L'application
 * embarque son propre miroir de `verifier` en WebCrypto : les deux sont verrouillés
 * l'un sur l'autre par scripts/licence/licence.test.mjs.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, generateKeyPairSync } from "node:crypto";

export const PLANS = ["mensuel", "annuel", "vie"];

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const deB64u = (txt) => Buffer.from(txt, "base64url");

/** L'e-mail n'entre jamais en clair dans le jeton : empreinte SHA-256, 16 octets. */
export function empreinteEmail(email) {
  const norme = String(email || "").trim().toLowerCase();
  return b64u(createHash("sha256").update(norme, "utf8").digest().subarray(0, 16));
}

/** Le payload signé — une chaîne construite à la main : l'ordre des clés est le contrat. */
export function payloadDe({ email, plan, fin }) {
  if (!PLANS.includes(plan)) throw new Error("plan inconnu : " + plan);
  const f = plan === "vie" ? "" : ',"f":"' + fin + '"';
  if (plan !== "vie" && !/^\d{4}-\d{2}-\d{2}$/.test(String(fin))) {
    throw new Error("date de fin attendue AAAA-MM-JJ, reçu : " + fin);
  }
  const norme = String(email || "").trim().toLowerCase();
  if (!/@/.test(norme)) throw new Error("e-mail requis : la licence est nominative");
  return '{"v":2,"m":' + JSON.stringify(norme) + ',"p":"' + plan + '"' + f + "}";
}

/** Signe un code. `clePrivee` : PKCS8 en base64 (la variable d'environnement) ou un KeyObject. */
export function signerCode({ email, plan, fin }, clePrivee) {
  const cle = typeof clePrivee === "string"
    ? createPrivateKey({ key: deB64u(clePrivee), format: "der", type: "pkcs8" })
    : clePrivee;
  const payload = payloadDe({ email, plan, fin });
  const sig = sign(null, Buffer.from(payload, "utf8"), cle);
  return "SIV1." + b64u(Buffer.from(payload, "utf8")) + "." + b64u(sig);
}

/**
 * Vérifie un code. `clePublique` : les 32 octets bruts en base64url — exactement ce
 * que la page embarque. Retour : { ok, plan, fin } ou { ok:false, motif }, avec
 * motif ∈ 'forme' (mal recopié), 'signature' (forgé ou altéré), 'email' (destiné à
 * un autre e-mail), 'expire' (avec la date), 'plan'.
 */
export function verifierCode(code, clePublique, { email, maintenant = Date.now() } = {}) {
  const brut = String(code || "").replace(/\s+/g, "");
  const m = /^SIV1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(brut);
  if (!m) return { ok: false, motif: "forme" };
  let payload, sig, jeton;
  try {
    payload = deB64u(m[1]);
    sig = deB64u(m[2]);
    jeton = JSON.parse(payload.toString("utf8"));
  } catch (e) {
    return { ok: false, motif: "forme" };
  }
  if (sig.length !== 64 || !jeton || (jeton.v !== 1 && jeton.v !== 2)) return { ok: false, motif: "forme" };
  let clePub;
  try {
    // SPKI Ed25519 = un préfixe DER fixe de 12 octets + la clé brute de 32 octets
    const spki = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"), deB64u(clePublique)]);
    clePub = createPublicKey({ key: spki, format: "der", type: "spki" });
  } catch (e) {
    return { ok: false, motif: "cle" };
  }
  if (!verify(null, payload, clePub, sig)) return { ok: false, motif: "signature" };
  if (!PLANS.includes(jeton.p)) return { ok: false, motif: "plan" };
  // v2 : l'e-mail est en clair dans le jeton ; v1 : seule l'empreinte y est
  if (jeton.v === 2) {
    if (typeof jeton.m !== "string" || !/@/.test(jeton.m)) return { ok: false, motif: "forme" };
    if (email !== undefined
        && String(email).trim().toLowerCase() !== jeton.m) {
      return { ok: false, motif: "email" };
    }
  } else if (email !== undefined && jeton.e !== empreinteEmail(email)) {
    return { ok: false, motif: "email" };
  }
  if (jeton.p !== "vie") {
    // la journée de fin est comprise : un code « 2026-10-14 » vit jusqu'à minuit UTC
    const finMs = Date.parse(jeton.f + "T23:59:59Z");
    if (!Number.isFinite(finMs)) return { ok: false, motif: "forme" };
    if (maintenant > finMs) return { ok: false, motif: "expire", plan: jeton.p, fin: jeton.f, email: jeton.v === 2 ? jeton.m : undefined };
  }
  return { ok: true, plan: jeton.p, fin: jeton.p === "vie" ? null : jeton.f,
    email: jeton.v === 2 ? jeton.m : undefined };
}

const jourUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * La date de fin, déduite du PLAN — jamais du montant : un prix promotionnel ne
 * raccourcit pas une licence. Tout part des horodatages du webhook lui-même, pour
 * qu'un webhook rejoué recalcule exactement la même date.
 *   mensuel : fin de la période payée (fournie, sinon paiement + 31 j) + 7 jours de
 *             grâce — l'abonnement résilié s'éteint tout seul, rien à révoquer.
 *   annuel  : treize mois après le paiement.
 *   vie     : sans date de fin.
 */
export function finDePlan(plan, { refMs, periodeFinMs } = {}) {
  if (plan === "vie") return null;
  if (!Number.isFinite(refMs)) throw new Error("horodatage du paiement manquant");
  if (plan === "mensuel") {
    const finPeriode = Number.isFinite(periodeFinMs) ? periodeFinMs : refMs + 31 * 86400000;
    return jourUTC(finPeriode + 7 * 86400000);
  }
  if (plan === "annuel") {
    const d = new Date(refMs);
    return jourUTC(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 13, d.getUTCDate()));
  }
  throw new Error("plan inconnu : " + plan);
}

/** Paire de clés neuve. privee : PKCS8 base64 (pour la variable d'environnement) ;
 *  publique : 32 octets bruts en base64url (pour la page). */
export function genererCles() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  return {
    privee: b64u(privateKey.export({ format: "der", type: "pkcs8" })),
    publique: b64u(spki.subarray(spki.length - 32)),
  };
}

/** La clé publique dérivée d'une clé privée (contrôle anti-clé-de-démo de la fonction). */
export function publiqueDe(clePriveeB64) {
  const cle = createPrivateKey({ key: deB64u(clePriveeB64), format: "der", type: "pkcs8" });
  const spki = createPublicKey(cle).export({ format: "der", type: "spki" });
  return b64u(spki.subarray(spki.length - 32));
}
