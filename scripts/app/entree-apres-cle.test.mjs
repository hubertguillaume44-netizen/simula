// ————— UNE CLÉ VALIDÉE DOIT OUVRIR LA PORTE, PAS SEULEMENT LA DÉCRIRE —————
//
// La validation posait la licence et laissait l'utilisateur sur l'accueil. L'écran
// annonçait le plan souscrit et l'import ouvert — un DROIT — sans donner d'ACCÈS. Quelqu'un qui vient de coller son code a fait exactement ce qu'on lui
// demandait ; le laisser devant un message est une impasse, et elle est invisible à la
// relecture : celui qui a écrit l'écran sait déjà où cliquer ensuite.
//
// Ce test monte la VRAIE fonction de validation et regarde ce qu'elle fait, plutôt que de
// chercher une chaîne dans le source. Il tient trois choses : on entre quand le code est
// bon, on N'ENTRE PAS quand il est mauvais, et on entre par la même porte que le bouton
// « Ouvrir avec mes données » — deux portes finiraient par mener à deux endroits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

/** LA destination d'entrée, telle qu'elle est écrite dans le source. */
function destination() {
  const m = /ENTREE = \{ tab: '([a-z]+)', vue: '([a-z]+)' \};/.exec(SOURCE);
  assert.ok(m, "ENTREE a disparu, ou a changé de forme");
  return { tab: m[1], vue: m[2] };
}

/** Le corps de licVerifier, délimité par accolades appariées. */
function corpsVerifier() {
  const i = SOURCE.indexOf("          licVerifier: async () => {");
  assert.ok(i > 0, "licVerifier ne se délimite plus");
  const deb = SOURCE.indexOf("{", SOURCE.indexOf("async () =>", i));
  let prof = 0;
  for (let j = deb; j < SOURCE.length; j++) {
    if (SOURCE[j] === "{") prof++;
    else if (SOURCE[j] === "}") { prof--; if (!prof) return SOURCE.slice(deb + 1, j); }
  }
  assert.fail("licVerifier n’est pas refermée");
}

/**
 * Exécute la vraie licVerifier sur un faux composant, et rend ce qu'elle a fait.
 * `tab` est la PROVENANCE — d'où l'on colle. Depuis l'accueil on est encore dehors et
 * la clé fait entrer ; depuis n'importe quelle page de l'outil on y est déjà, et
 * sauter éjecterait quelqu'un de son travail.
 */
async function valider(resultat, tab = "accueil") {
  const trace = { etats: [], garde: [], sessions: 0 };
  const ctx = { console, Promise, String, Object };
  vm.createContext(ctx);
  ctx.trace = trace;
  vm.runInContext(
    "var faux = {\n"
    + "  ENTREE: " + JSON.stringify(destination()) + ",\n"
    + "  state: { tab: " + JSON.stringify(tab) + " },\n"
    + "  verifierLicence: async function () { return " + JSON.stringify(resultat) + "; },\n"
    + "  garderLicence: function (l) { trace.garde.push(l); },\n"
    + "  setState: function (o, apres) { trace.etats.push(o); if (apres) apres(); },\n"
    + "  ecrireSession: function () { trace.sessions++; },\n"
    + "  licenceMotifTexte: function (r) { return 'refus:' + r.motif; },\n"
    + "};\n"
    + "var faire = function (s, lic) { return (async () => {" + corpsVerifier() + "}); };\n"
    + "var fn = faire.call(faux, { licEmailSaisie: 'a@b.c', licCodeSaisi: 'SIV1.x.y' }, null);",
    ctx);
  await vm.runInContext("fn()", ctx);
  return trace;
}

test("un code valide fait ENTRER dans l’application", async () => {
  const t = await valider({ ok: true, plan: "vie", fin: null, email: "a@b.c" });
  const etat = Object.assign({}, ...t.etats);
  assert.equal(etat.tab, "court",
    "la validation reste sur l’accueil : elle confirme un droit sans donner d’accès");
  assert.equal(t.sessions, 1,
    "la session n’est pas écrite : un rechargement ramènerait sur l’accueil");
  assert.equal(t.garde.length, 1, "la licence doit être mémorisée localement");
  assert.equal(t.garde[0].email, "a@b.c");
});

test("coller depuis le tiroir ne déplace personne", async () => {
  // Le tiroir s'ouvre depuis les trois pages de l'outil. Quelqu'un qui colle sa clé
  // pendant qu'il travaille sur ses scans doit rester sur ses scans : la clé ouvre ce
  // qui était fermé, elle ne décide pas où l'on va.
  const t = await valider({ ok: true, plan: "annuel", fin: "2027-03-14", email: "a@b.c" }, "court");
  const etat = Object.assign({}, ...t.etats);
  assert.equal(etat.tab, undefined, "coller depuis l’outil ne doit pas changer d’onglet");
  assert.equal(etat.vue, undefined, "ni de vue");
  assert.equal(t.garde.length, 1, "la licence doit quand même être mémorisée");
  assert.equal(t.sessions, 1, "et la session écrite");
});

test("un code refusé ne fait entrer nulle part", async () => {
  const t = await valider({ ok: false, motif: "signature" });
  const etat = Object.assign({}, ...t.etats);
  assert.equal(etat.tab, undefined, "un code refusé ouvre quand même l’application");
  assert.equal(t.sessions, 0, "un refus ne doit rien écrire dans la session");
  assert.equal(t.garde.length, 0, "un code refusé ne doit pas être mémorisé");
  assert.match(etat.licMsg.txt, /^refus:signature$/, "le motif du refus doit être dit");
});

test("on entre par la MÊME porte que « Ouvrir avec mes données »", async () => {
  // deux chemins vers deux destinations finiraient par diverger sans que rien ne le
  // signale : celui qui change l'une ne pense pas à l'autre. D'où UNE constante, lue par
  // les deux — le test vérifie qu'aucun des deux ne la contourne.
  assert.match(SOURCE, /goCourt: \(e\) => \{[^}]*this\.entrer\(\); \}/,
    "le bouton n’appelle plus entrer() : il a sa propre destination");
  assert.match(SOURCE, /entrer\(\) \{ this\.setState\(\{ \.\.\.this\.ENTREE \}, \(\) => this\.ecrireSession\(\)\); \}/,
    "entrer() ne lit plus ENTREE, ou n’écrit plus la session");
  assert.match(SOURCE, /licCodeSaisi: undefined,\n\s*\.\.\.\(dehors \? this\.ENTREE : \{\}\) \}/,
    "la clé validée n’utilise plus ENTREE : elle a sa propre destination");
  const t = await valider({ ok: true, plan: "vie", fin: null, email: "a@b.c" });
  const etat = Object.assign({}, ...t.etats);
  assert.deepEqual({ tab: etat.tab, vue: etat.vue }, destination(),
    "la clé ne mène pas où ENTREE le dit");
});

test("on arrive sur « Mes instruments », pas sur les conclusions", async () => {
  // LA VRAIE EXIGENCE N'EST PAS UNE CHAÎNE, C'EST UN GROUPE D'ONGLETS. On atterrissait sur
  // « Mes décisions » parce que l'état initial porte vue: 'marche'. Or on n'entre pas dans
  // un outil de mesure par ses conclusions : le premier jour, il n'y en a aucune. Le test
  // lit donc la table des groupes dans le source et vérifie à quel groupe mène ENTREE —
  // renommer une vue ne le trompera pas, déplacer une vue d'un groupe à l'autre non plus.
  const i = SOURCE.indexOf("        const GROUPES = [");
  assert.ok(i > 0, "la table des groupes ne se délimite plus");
  const bloc = SOURCE.slice(i, SOURCE.indexOf("\n        ];", i));
  const groupes = [...bloc.matchAll(/\['[a-z]+', '([^']+)', '[^']*',\s*\[([\s\S]*?)\]\]/g)]
    .map((m) => ({ nom: m[1], vues: [...m[2].matchAll(/\['([a-z]+)',/g)].map((v) => v[1]) }));
  assert.ok(groupes.length >= 3, `${groupes.length} groupes lus, trois attendus`);
  const g = groupes.find((x) => x.vues.includes(destination().vue));
  assert.ok(g, `« ${destination().vue} » n’appartient à aucun groupe d’onglets`);
  assert.equal(g.nom, "Mes instruments",
    `on entre sur « ${g.nom} » : c’est là qu’on dépose le relevé et les bougies qu’il faut`);
});

test("le code se saisit à deux endroits, et le saut est gardé", () => {
  // ————— L'INVARIANT A CHANGÉ, ET LA GARDE L'A REMPLACÉ —————
  //
  // Il n'y avait qu'un champ, sur l'accueil : entrer dans l'application après une clé
  // valide était donc toujours le bon geste. Le tiroir en porte maintenant un second,
  // pour le client qui revient sur une machine neuve et cherche où coller — et sauter
  // depuis là éjecterait quelqu'un de son travail vers Mes instruments.
  //
  // Ce test ne compte plus les champs : il vérifie que le saut est CONDITIONNEL, et
  // qu'il l'est sur la provenance. C'est la garde que l'ancien commentaire annonçait.
  const champs = [...SOURCE.matchAll(/onClick="\{\{ licVerifier \}\}"/g)];
  assert.ok(champs.length >= 1, "aucun bouton de validation de clé");

  assert.match(SOURCE, /const dehors = this\.state\.tab === 'accueil';/,
    "la provenance doit être lue au moment du clic, pas figée dans le producteur");
  assert.match(SOURCE, /\.\.\.\(dehors \? this\.ENTREE : \{\}\)/,
    "le saut vers l’entrée doit être conditionnel : depuis le tiroir, on reste où l’on est");
  // et l'inconditionnel d'avant ne doit pas revenir par un chemin voisin
  assert.ok(!/licCodeSaisi: undefined,\s*\n\s*\.\.\.this\.ENTREE \}/.test(SOURCE),
    "le saut est redevenu inconditionnel");
});

test("la section licence du tiroir porte les deux besoins d’un client qui revient", () => {
  // coller sa clé, et la retrouver. Pas de mot de passe, pas de compte : il n'y en a
  // pas, et c'est l'argument de vente — voir le commentaire de la section.
  const i2 = SOURCE.indexOf('<sc-if value="{{ aSecLic }}"');
  assert.ok(i2 > 0, "la section licence du tiroir ne se délimite plus");
  const sec = SOURCE.slice(i2, SOURCE.indexOf("</sc-if>", SOURCE.indexOf("espacesTiroir", i2)));
  assert.match(sec, /id="tirLicEmail"/, "le courriel de l’achat doit se saisir dans le tiroir");
  assert.match(sec, /id="tirLicCode"/, "la clé doit se coller dans le tiroir");
  assert.match(sec, /onClick="\{\{ licVerifier \}\}"/, "le tiroir doit pouvoir ouvrir la clé");
  assert.match(sec, /\{\{ mailContactHref \}\}/, "retrouver sa clé passe par l’adresse de contact");
  // le prix est POINTÉ, jamais écrit : le site vend, l'application travaille
  assert.match(sec, /href="\/tarifs"/, "un lien discret vers les tarifs du site");
  assert.ok(!/\d+,\d\d\s*€/.test(sec), "aucun montant ne s’écrit dans l’outil");
});
