/**
 * PROTECTION TEMPORAIRE DU SITE — une authentification de base, le temps du chantier.
 *
 * ————— COMMENT L'ENLEVER, LE JOUR DU LANCEMENT —————
 * Supprimer le bloc `[[edge_functions]]` de `netlify.toml` (une ligne de `function`,
 * une de `path`). Ce fichier peut rester : sans déclaration, il ne s'exécute pas.
 * C'est le seul geste. Voir PASSATION.md, section « La protection temporaire du site ».
 *
 * ————— POURQUOI UNE FONCTION ET PAS UN EN-TÊTE —————
 * Netlify sait poser une authentification de base par un en-tête `Basic-Auth` déclaré
 * dans ce même `netlify.toml`. Deux raisons de ne pas s'en servir ici :
 *   1. Le mot de passe y serait écrit EN CLAIR, versionné dans un dépôt. Un secret
 *      versionné n'est plus un secret — et le retirer plus tard ne l'efface pas de
 *      l'historique.
 *   2. Un `.toml` est une donnée, pas un programme : il ne lit pas de variable
 *      d'environnement. Une fonction, si.
 * Une fonction de périphérie lit `Netlify.env`, décide, et rend un 401 conforme.
 *
 * ————— CE QUI ÉCHOUE, ET DANS QUEL SENS —————
 * Si la variable est ABSENTE, cette fonction ferme au lieu d'ouvrir. Une protection qui
 * disparaît quand sa configuration manque ne protège rien : le jour où quelqu'un renomme
 * la variable, le site serait public sans que rien ne le signale. Elle rend donc un 503
 * qui dit ce qui manque — visible, réparable, et jamais silencieusement ouvert.
 */

// ————— CE QUI RESTE OUVERT —————
//
// `/api/licence` EST LA SEULE ENTRÉE QUI NE PEUT PAS DEMANDER UN MOT DE PASSE.
//
// C'est le webhook du paiement : Revolut l'appelle de serveur à serveur, sans navigateur,
// sans personne devant l'écran. Il n'a aucun moyen de présenter des identifiants. Derrière
// la protection il recevait 401, et un 401 sur un webhook ne se voit pas — l'argent est
// encaissé, la licence n'est jamais délivrée, et c'est le client qui le découvre.
//
// Le laisser ouvert n'affaiblit rien : la fonction `licence.mjs` ne signe que ce qu'elle a
// vérifié, et la clé privée n'est ni ici ni dans le dépôt. La protection de ce fichier
// couvre une VITRINE en construction, pas un secret.
//
// À PRÉVOIR : le jour où un lien de paiement Revolut renverra vers une page de
// confirmation, cette page devra figurer ici aussi — un client qui vient de payer ne peut
// pas se heurter à un mot de passe. Les quatre adresses sont dans le tableau de bord
// Revolut ; elles ne s'inventent pas. Exemple, à compléter le moment venu :
//   "/merci", "/paiement/confirme",
const OUVERTS = ["/api/licence"];

// Le nom de la variable à créer dans Netlify. Format : « identifiant:motdepasse ».
const VARIABLE = "VENA_ACCES";

/** Comparaison à durée constante : une comparaison naïve fuit la longueur du préfixe juste. */
function memeSecret(a, b) {
  const A = new TextEncoder().encode(a);
  const B = new TextEncoder().encode(b);
  if (A.length !== B.length) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i];
  return d === 0;
}

const refuser = () =>
  new Response("Authentification requise.", {
    status: 401,
    headers: {
      // Le `realm` s'affiche dans la boîte du navigateur, mais il voyage dans un EN-TÊTE
      // HTTP, qui ne transporte que du Latin-1. « Véna — site en préparation » y jette :
      // le tiret cadratin vaut 8212, et chaque 401 devenait un 500. Sans accent, donc —
      // c'est la même raison que la règle du dépôt : un accent casse au transport.
      // `charset="UTF-8"` ne concerne que les identifiants saisis, pas ce libellé.
      "WWW-Authenticate": 'Basic realm="Vena - site en preparation", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      // une page protégée ne doit pas rester dans un cache partagé
      "cache-control": "no-store",
    },
  });

export default async (request, context) => {
  const chemin = new URL(request.url).pathname;
  if (OUVERTS.some((p) => chemin === p || chemin.startsWith(p + "/"))) return context.next();

  const attendu = Netlify.env.get(VARIABLE);
  if (!attendu || !attendu.includes(":")) {
    return new Response(
      "Protection mal configurée : la variable d'environnement " + VARIABLE
        + " est absente ou ne contient pas « identifiant:motdepasse ».\n"
        + "Elle se pose dans Netlify (Site configuration > Environment variables).\n"
        + "Tant qu'elle manque, le site reste fermé — une protection ne doit pas "
        + "disparaître avec sa configuration.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const entete = request.headers.get("authorization") || "";
  if (!entete.toLowerCase().startsWith("basic ")) return refuser();
  let fourni;
  try {
    fourni = atob(entete.slice(6).trim());
  } catch {
    return refuser();
  }
  if (!memeSecret(fourni, attendu)) return refuser();

  return context.next();
};

// Le chemin est déclaré dans `netlify.toml`, et NULLE PART AILLEURS : une seconde
// déclaration ici survivrait à la suppression du bloc, et la consigne de retrait
// écrite en tête serait fausse.
