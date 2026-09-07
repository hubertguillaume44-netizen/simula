#!/usr/bin/env node
/**
 * Signe un code d'accès À LA MAIN — la délivrance manuelle du premier jour, et le
 * renvoi d'un mail perdu (rien n'est stocké, donc rien à retrouver : on re-signe,
 * et le code obtenu est LE MÊME si l'e-mail, le plan et la date sont les mêmes).
 *
 *   LICENCE_CLE_PRIVEE=... node scripts/licence/signer.mjs --email client@ex.fr --plan annuel
 *   ... --plan mensuel --fin 2026-11-14     # date de fin explicite
 *   ... --plan vie                          # sans date de fin
 *
 * Sans --fin : mensuel = aujourd'hui + 31 jours + 7 de grâce ; annuel = 13 mois.
 * La clé privée vient de LICENCE_CLE_PRIVEE ; sans elle, la clé de DÉMONSTRATION
 * du dépôt est utilisée et le code est marqué comme tel — bon pour essayer, pas
 * pour vendre.
 */
import { signerCode, finDePlan, PLANS } from "./licence-noyau.mjs";
import { CLE_DEMO_PRIVEE } from "./cle-demo.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) { args[a.slice(2)] = process.argv[i + 1]; i++; }
}
const email = args.email;
const plan = args.plan;
if (!email || !PLANS.includes(plan)) {
  console.error("Usage : node scripts/licence/signer.mjs --email x@y.fr --plan "
    + PLANS.join("|") + " [--fin AAAA-MM-JJ]");
  process.exit(1);
}
const fin = plan === "vie" ? null : (args.fin || finDePlan(plan, { refMs: Date.now() }));
const cle = process.env.LICENCE_CLE_PRIVEE || CLE_DEMO_PRIVEE;
const demo = !process.env.LICENCE_CLE_PRIVEE;

console.error("plan " + plan + (fin ? " · fin " + fin : " · sans date de fin")
  + (demo ? " · CLÉ DE DÉMONSTRATION (posez LICENCE_CLE_PRIVEE pour signer pour de vrai)" : ""));
console.log(signerCode({ email, plan, fin }, cle));
