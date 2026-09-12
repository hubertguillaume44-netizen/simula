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
  // deux chemins vers deux onglets différents finiraient par diverger sans que rien ne
  // le signale : le bouton mènerait quelque part, la clé ailleurs
  const m = /goCourt: this\.go\('([a-z]+)'\)/.exec(SOURCE);
  assert.ok(m, "goCourt a disparu ou a changé de forme");
  const t = await valider({ ok: true, plan: "vie", fin: null, email: "a@b.c" });
  const etat = Object.assign({}, ...t.etats);
  assert.equal(etat.tab, m[1],
    `la clé mène à « ${etat.tab} », le bouton à « ${m[1] }» : deux portes, deux endroits`);
  // et go() écrit la session : la clé doit faire pareil, sinon les deux chemins ne
  // laissent pas le même souvenir
  assert.match(SOURCE, /go\(tab\) \{ return \(e\) => \{[^}]*this\.setState\(\{ tab \}, \(\) => this\.ecrireSession\(\)\)/);
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
