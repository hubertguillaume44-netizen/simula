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

/** Exécute la vraie licVerifier sur un faux composant, et rend ce qu'elle a fait. */
async function valider(resultat) {
  const trace = { etats: [], garde: [], sessions: 0 };
  const ctx = { console, Promise, String, Object };
  vm.createContext(ctx);
  ctx.trace = trace;
  vm.runInContext(
    "var faux = {\n"
    + "  ENTREE: " + JSON.stringify(destination()) + ",\n"
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
  assert.match(SOURCE, /licCodeSaisi: undefined,\n\s*\.\.\.this\.ENTREE \}/,
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

test("le code ne se saisit qu’à un seul endroit : l’accueil", async () => {
  // C'EST L'INVARIANT QUI REND LE SAUT LÉGITIME. Entrer dans l'application est le bon
  // geste parce qu'on ne peut coller un code que depuis la vitrine. Poser un second champ
  // ailleurs — dans l'Intendance, par exemple — ferait sauter quelqu'un qui est DÉJÀ
  // dedans, et il faudrait alors une condition. Ce test le rappellera.
  const champs = [...SOURCE.matchAll(/id="champCle"/g)];
  assert.equal(champs.length, 1, `${champs.length} champs de code, un seul attendu`);
  const boutons = [...SOURCE.matchAll(/onClick="\{\{ licVerifier \}\}"/g)];
  assert.equal(boutons.length, 1, `${boutons.length} boutons de validation, un seul attendu`);
});
