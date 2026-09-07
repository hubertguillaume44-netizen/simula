/**
 * LA DÉLIVRANCE DU CODE D'ACCÈS — une fonction, zéro base de données.
 *
 * Revolut appelle cette URL à chaque paiement réussi et à chaque renouvellement.
 * La fonction : vérifie la signature du webhook (sans quoi n'importe qui se
 * délivrerait une licence), lit le plan et l'e-mail, calcule la date de fin,
 * SIGNE le code (Ed25519, déterministe — un webhook rejoué produit le même code,
 * l'idempotence est gratuite), et l'envoie par mail. Rien n'est stocké : pas de
 * session, pas de client en base, pas de code à retrouver. Un mail perdu se
 * renvoie à la main avec scripts/licence/signer.mjs — c'est le prix de l'absence
 * de base, et c'est un bon prix.
 *
 * Variables d'environnement (Netlify → Site settings → Environment variables) :
 *   LICENCE_CLE_PRIVEE      clé Ed25519 PKCS8 en base64 — sortie de generer-cles.mjs.
 *                           JAMAIS dans le dépôt ; la fonction refuse la clé de démo.
 *   REVOLUT_SIGNING_SECRET  le « signing secret » du webhook, donné par Revolut à la
 *                           création du webhook (commence par wsk_).
 *   PLAN_MENSUEL, PLAN_ANNUEL, PLAN_VIE
 *                           les identifiants Revolut des trois produits/plans. La durée
 *                           se déduit du PLAN, jamais du montant : un prix promotionnel
 *                           ne raccourcit pas une licence.
 *   RESEND_API_KEY          la clé de l'envoyeur transactionnel (un seul appel HTTP).
 *   LICENCE_EXPEDITEUR      l'adresse d'envoi, ex. "Sivula <code@votre-domaine.fr>".
 *
 * Journal : le type d'événement et le plan, RIEN d'autre — ni e-mail, ni code, ni
 * clé. La promesse « aucune donnée client stockée » vaut aussi pour les logs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { signerCode, finDePlan, publiqueDe } from "../../scripts/licence/licence-noyau.mjs";
import { CLE_DEMO_PUBLIQUE } from "../../scripts/licence/cle-demo.mjs";

/**
 * Signature Revolut : en-têtes `Revolut-Request-Timestamp` et `Revolut-Signature`
 * (une ou plusieurs valeurs `v1=<hmac hexa>`). Le HMAC-SHA256 porte sur la chaîne
 * `v1.{timestamp}.{corps brut}` avec le signing secret. Comparaison à temps
 * constant : une comparaison naïve laisse deviner la signature octet par octet.
 */
export function signatureRevolutValide(corpsBrut, entetes, secret) {
  const ts = entetes["revolut-request-timestamp"];
  const sigs = entetes["revolut-signature"];
  if (!ts || !sigs || !secret) return false;
  const attendu = createHmac("sha256", secret)
    .update("v1." + ts + "." + corpsBrut, "utf8").digest();
  for (const part of String(sigs).split(",")) {
    const m = /^\s*v1=([0-9a-f]+)\s*$/i.exec(part);
    if (!m) continue;
    const recu = Buffer.from(m[1], "hex");
    if (recu.length === attendu.length && timingSafeEqual(recu, attendu)) return true;
  }
  return false;
}

/**
 * Lecture du webhook. Les NOMS DE CHAMPS Revolut varient selon le produit (ordre
 * simple, abonnement) : on cherche aux endroits plausibles, et le premier webhook
 * de test réel dira lequel est le bon — c'est un ajustement d'une ligne, pas
 * d'architecture. Tout horodatage vient du webhook LUI-MÊME, jamais de Date.now() :
 * c'est ce qui rend le code identique quand Revolut rejoue l'événement.
 */
export function lireWebhook(evt) {
  const ordre = evt.order || evt.data || evt;
  const email = evt.email || (evt.customer && evt.customer.email)
    || (ordre.customer && ordre.customer.email) || ordre.customer_email || null;
  const article = (ordre.line_items && ordre.line_items[0]) || {};
  const planId = evt.plan_id || ordre.plan_id || article.product_id || article.plan_id
    || (evt.subscription && evt.subscription.plan_id) || null;
  const refMs = Date.parse(ordre.completed_at || evt.completed_at || ordre.created_at
    || evt.created_at || evt.timestamp || "");
  const periodeFinMs = Date.parse((evt.subscription && evt.subscription.current_period_end)
    || (ordre.subscription && ordre.subscription.current_period_end) || "");
  return { email, planId, refMs, periodeFinMs };
}

const EVENEMENTS_PAIEMENT = /COMPLETED|PAYMENT_SUCCEEDED|SUBSCRIPTION_RENEWED|PAYMENT_CAPTURED/i;

/**
 * Le traitement, séparé du transport HTTP pour être testable tel quel.
 * `envoyerMail` est injectable : les tests capturent l'envoi au lieu d'appeler Resend.
 */
export async function traiter(corpsBrut, entetes, env, envoyerMail) {
  if (!env.LICENCE_CLE_PRIVEE || !env.REVOLUT_SIGNING_SECRET) {
    return { statut: 500, corps: { erreur: "fonction non configurée" } };
  }
  // la clé de démonstration est dans le dépôt : signer avec elle rendrait les codes
  // forgeables par quiconque lit le code source
  if (publiqueDe(env.LICENCE_CLE_PRIVEE) === CLE_DEMO_PUBLIQUE) {
    console.error("licence : la clé privée est la clé de DÉMONSTRATION — générez une vraie paire (scripts/licence/generer-cles.mjs)");
    return { statut: 500, corps: { erreur: "clé de démonstration refusée" } };
  }
  if (!signatureRevolutValide(corpsBrut, entetes, env.REVOLUT_SIGNING_SECRET)) {
    return { statut: 401, corps: { erreur: "signature du webhook invalide" } };
  }
  let evt;
  try { evt = JSON.parse(corpsBrut); } catch (e) {
    return { statut: 400, corps: { erreur: "corps illisible" } };
  }
  const type = String(evt.event || evt.type || "");
  if (!EVENEMENTS_PAIEMENT.test(type)) {
    console.log("licence : événement ignoré —", type || "(sans type)");
    return { statut: 200, corps: { ignore: true } };
  }
  const { email, planId, refMs, periodeFinMs } = lireWebhook(evt);
  const PLANS_ENV = { [env.PLAN_MENSUEL]: "mensuel", [env.PLAN_ANNUEL]: "annuel", [env.PLAN_VIE]: "vie" };
  const plan = planId && PLANS_ENV[planId];
  if (!plan) {
    console.error("licence : plan inconnu —", planId || "(absent)");
    return { statut: 400, corps: { erreur: "plan inconnu" } };
  }
  if (!email || !/@/.test(email)) {
    console.error("licence : e-mail absent du webhook");
    return { statut: 400, corps: { erreur: "e-mail absent" } };
  }
  if (plan !== "vie" && !Number.isFinite(refMs)) {
    console.error("licence : horodatage absent du webhook");
    return { statut: 400, corps: { erreur: "horodatage absent" } };
  }
  const fin = finDePlan(plan, { refMs, periodeFinMs: Number.isFinite(periodeFinMs) ? periodeFinMs : undefined });
  const code = signerCode({ email, plan, fin }, env.LICENCE_CLE_PRIVEE);
  const NOMS = { mensuel: "abonnement mensuel", annuel: "formule annuelle", vie: "licence à vie" };
  const texte = [
    "Bonjour,",
    "",
    "Voici votre code d'accès Sivula (" + NOMS[plan]
      + (fin ? ", valable jusqu'au " + fin.split("-").reverse().join("/") : ", sans date de fin") + ") :",
    "",
    code,
    "",
    "Où le coller : dans Sivula, page d'accueil, cadre « J'ai déjà un code » —",
    "votre e-mail d'achat puis le code. La vérification se fait dans votre",
    "navigateur, rien n'est envoyé nulle part.",
    "",
    "Ce code est personnel : il est lié à cette adresse e-mail.",
    "",
    "Sivula",
  ].join("\n");
  const r = await envoyerMail({ a: email, sujet: "Votre code d'accès Sivula", texte });
  if (!r || !r.ok) {
    // 502 : Revolut réessaiera, et la signature déterministe renverra LE MÊME code
    console.error("licence : envoi du mail refusé (" + ((r && r.statut) || "?") + ")");
    return { statut: 502, corps: { erreur: "envoi du mail refusé" } };
  }
  console.log("licence : code envoyé —", type, "·", plan);
  return { statut: 200, corps: { envoye: true, plan } };
}

/** L'envoi réel : Resend, un POST. Remplaçable par Postmark ou Brevo en dix lignes. */
async function envoyerParResend({ a, sujet, texte }, env) {
  const rep = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.LICENCE_EXPEDITEUR, to: [a], subject: sujet, text: texte }),
  });
  return { ok: rep.ok, statut: rep.status };
}

export default async (req) => {
  if (req.method !== "POST") return new Response("méthode refusée", { status: 405 });
  const corps = await req.text();
  const entetes = {};
  for (const [k, v] of req.headers) entetes[k.toLowerCase()] = v;
  const env = process.env;
  const r = await traiter(corps, entetes, env, (m) => envoyerParResend(m, env));
  return new Response(JSON.stringify(r.corps), {
    status: r.statut, headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/api/licence" };
