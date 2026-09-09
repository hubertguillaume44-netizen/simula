/**
 * LE RELAIS DU COMPTEUR D'USAGE — il transmet, il ne stocke rien.
 *
 * L'application n'envoie ici que ce que son bouton « voir ce qui part » affiche :
 * des comptes (scans, combinaisons, durées), l'unité, le nombre d'instruments, les
 * filtres balayés, la version, la famille de navigateur, les messages d'erreur.
 * Cette fonction VALIDE ce format, jette tout le reste, et relaie vers le service
 * de mesure sans cookies désigné par USAGE_CIBLE. Sans cible configurée, elle
 * répond 204 et la charge disparaît. Aucune adresse IP n'est conservée, rien n'est
 * écrit, et le journal ne porte que le NOMBRE d'événements — jamais leur contenu.
 */

const CHAMPS = ["type", "combinaisons", "duree_s", "unite", "instruments", "filtres",
  "erreur", "version", "navigateur"];

/** Ne laisse passer QUE les champs du contrat — une charge enrichie par un client
 *  modifié ne doit pas pouvoir transporter autre chose que le format annoncé. */
export function filtrerCharge(brut) {
  let b;
  try { b = JSON.parse(brut); } catch (e) { return null; }
  if (!b || (b.outil !== "vena" && b.outil !== "simula") || b.schema !== 1 || !Array.isArray(b.evenements)) return null;
  const evenements = b.evenements.slice(0, 100).map((e) => {
    const p = {};
    for (const c of CHAMPS) {
      if (e[c] === undefined) continue;
      if (c === "filtres") p[c] = Array.isArray(e[c]) ? e[c].slice(0, 12).map((x) => String(x).slice(0, 24)) : [];
      else if (typeof e[c] === "number") p[c] = e[c];
      else p[c] = String(e[c]).slice(0, 160);
    }
    return p;
  });
  return { outil: "vena", schema: 1, evenements };
}

export async function traiterUsage(corpsBrut, env, expedier) {
  const charge = filtrerCharge(corpsBrut);
  if (!charge) return { statut: 400, corps: { erreur: "format inattendu" } };
  console.log("usage :", charge.evenements.length, "événement(s) relayé(s)");
  if (!env.USAGE_CIBLE) return { statut: 204, corps: null };
  try {
    const r = await (expedier || ((url, corps) => fetch(url, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: corps })))(
      env.USAGE_CIBLE, JSON.stringify(charge));
    return { statut: r && r.ok ? 204 : 502, corps: null };
  } catch (e) {
    return { statut: 502, corps: null };
  }
}

export default async (req) => {
  if (req.method !== "POST") return new Response("méthode refusée", { status: 405 });
  const r = await traiterUsage(await req.text(), process.env);
  return new Response(r.corps ? JSON.stringify(r.corps) : null, { status: r.statut });
};

export const config = { path: "/api/usage" };
