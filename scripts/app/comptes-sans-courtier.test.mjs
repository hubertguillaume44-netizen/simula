// ————— LE COMPTE Nº 1 NE PORTE PLUS LE NOM D'UN COURTIER —————
//
// Le fichier publié ne sait pas chez qui son lecteur travaille. Il portait pourtant, en
// dur, le nom d'un courtier précis — celui de l'auteur — à quatre endroits : le libellé
// du compte nº 1, ses commissions, la date de son barème, et le suffixe à écrire dans un
// nom de fichier pour rattacher un second flux. Un client d'un autre courtier pouvait
// tout faire, mais rien ne le lui disait, et quatre écrans lui parlaient d'une maison qui
// n'est pas la sienne.
//
// ————— LE PIÈGE, ET POURQUOI CE FICHIER EXISTE AUSSI POUR LUI —————
//
// 'fxpro' n'est PAS un libellé : c'est une CLÉ DE STOCKAGE, cleGlobale(base) + '.' + compte.
// Des centaines de mégaoctets de bougies, de relevés et de scans sont déjà rangés dessous
// chez les utilisateurs. La renommer en 'compte1' les rendrait invisibles d'un coup, sans
// message d'erreur — on irait les chercher sous une clé qui n'a jamais rien reçu.
// Le dernier test de ce fichier est là pour cela : il relit un espace écrit sous '.fxpro'
// avec le code réel de composition des clés, et tombe si quelqu'un « corrige » la clé.
//
// ————— LA RÈGLE, SANS LISTE DE MARQUES —————
//
// Les libellés doivent avoir une FORME : « Compte nº N », ou le libellé du bac à sable.
// « FxPro MT5 » n'a pas cette forme et tombe, sans que le test ait à connaître le nom
// d'un seul courtier. Et hors commentaires, le jeton `fxpro` ne peut apparaître que tel
// quel — minuscules pour la clé, capitales pour l'alias de suffixe : jamais en casse
// mixte, jamais noyé dans une phrase. C'est précisément ce qui distingue une clé
// technique d'un nom de marque affiché.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const RACINE = new URL("../../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, RACINE), "utf8");
const SOURCE = lire("Vena.dc.html");

/** Le fichier sans ses commentaires : ne reste que ce qui s'exécute ou s'affiche. */
function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/[^\n]*$/gm, " ");
}

/** Un littéral de tableau JS délimité par crochets appariés, à partir d'un marqueur. */
function litteral(src, marqueur, ouvrant = "[", fermant = "]") {
  const i = src.indexOf(marqueur);
  assert.ok(i > 0, `« ${marqueur} » est introuvable : la forme a changé`);
  const deb = src.indexOf(ouvrant, i);
  let prof = 0;
  for (let j = deb; j < src.length; j++) {
    if (src[j] === ouvrant) prof++;
    else if (src[j] === fermant) { prof--; if (!prof) return src.slice(deb, j + 1); }
  }
  assert.fail(`« ${marqueur} » n’est pas refermé`);
}

/**
 * Évalue un littéral du source dans un bac à sable, puis le rapatrie par JSON.
 * LE RAPATRIEMENT N'EST PAS UNE COQUETTERIE : un objet né dans un contexte `vm` a un
 * `Object.prototype` différent, et `deepEqual` compare les prototypes — il refuse deux
 * objets identiques champ pour champ, avec un message qui montre deux valeurs égales.
 */
function valeur(texte) {
  const ctx = {};
  vm.createContext(ctx);
  return JSON.parse(vm.runInContext("JSON.stringify(" + texte + ")", ctx));
}

const COURTIERS = valeur(litteral(SOURCE, "\n  COURTIERS = ["));

// « Compte nº 3 » ou le bac à sable. Rien d'autre : un libellé qui ne rentre pas dans
// cette forme est un nom propre, et un nom propre dans le fichier publié est celui de
// quelqu'un.
const FORME = /^Compte nº \d+$|^Compte démo — données fictives$/;

test("aucun libellé de compte ne nomme un courtier", () => {
  const fautifs = COURTIERS.filter(([, nom]) => !FORME.test(nom)).map(([cle, nom]) => `${cle} → « ${nom} »`);
  assert.deepEqual(fautifs, [],
    "un libellé nomme une maison précise : le fichier publié ne sait pas chez qui son "
    + "lecteur travaille. Le client nomme ses comptes lui-même (renommerCompte).");
});

test("hors commentaires, le jeton de la clé n’apparaît jamais en nom de marque", () => {
  const net = sansCommentaires(SOURCE);
  const vus = [...new Set((net.match(/fxpro/gi) || []))];
  // 'fxpro' : la clé de stockage. FXPRO : l'alias de suffixe historique. Rien d'autre.
  const mauvais = vus.filter((v) => v !== "fxpro" && v !== "FXPRO");
  assert.deepEqual(mauvais, [],
    `casse mixte relevée (${mauvais.join(", ")}) : une clé technique s’écrit tout d’une `
    + "casse. Une casse mixte est un nom qu’on affiche.");
  // et jamais collé à un mot : « FxPro MT5 », « courtier fxpro »… sont des libellés
  const colle = [...net.matchAll(/[A-Za-z0-9]fxpro|fxpro[A-Za-z0-9]/gi)].map((m) => m[0]);
  assert.deepEqual(colle, [], "le jeton est noyé dans un mot : ce n’est plus une clé");
});

test("les commissions par défaut valent zéro, tous comptes confondus", () => {
  const comm = valeur(litteral(SOURCE, "\n    comm: {", "{", "}"));
  const comptes = Object.keys(comm);
  assert.ok(comptes.length >= 5, `${comptes.length} comptes tarifés, cinq attendus au moins`);
  const nonNuls = [];
  for (const [cle, t] of Object.entries(comm)) {
    for (const [k, v] of Object.entries(t)) if (Number(v) !== 0) nonNuls.push(`${cle}.${k} = ${v}`);
  }
  assert.deepEqual(nonNuls, [],
    "un tarif de courtier est présumé : faux chez tout le monde sauf chez son auteur, et "
    + "faux EN SILENCE, alors qu’il entre dans chaque résultat chiffré. Zéro est un "
    + "manque visible ; un tarif inventé ne se remarque pas.");
});

test("aucune devise de commission n’est présumée", () => {
  const dev = valeur(litteral(SOURCE, "\n    commDev: {", "{", "}"));
  assert.deepEqual(Object.keys(dev), [],
    "une devise est présumée par compte : commDevise() retombe déjà sur EUR quand la clé "
    + "manque, et le choix appartient au client.");
});

test("aucune date de barème n’est livrée avec l’application", () => {
  const d = valeur(litteral(SOURCE, "\n  DATES_BAREME = {", "{", "}"));
  assert.deepEqual(Object.keys(d), [],
    "une date de barème est écrite en dur : c’est la date de l’export de son auteur, "
    + "affichée avec autorité chez quelqu’un qui n’a rien déposé ce jour-là. La date vient "
    + "du relevé déposé (this.dateBareme) ou n’existe pas.");
});

test("le suffixe de flux se dérive du nom du compte, et garde son alias historique", () => {
  const alias = valeur(litteral(SOURCE, "\n  ALIAS_FLUX = {", "{", "}"));
  assert.deepEqual(alias, { FXPRO: "fxpro" },
    "l’alias historique a changé : les fichiers déjà nommés « …-FXPRO_H1.csv » cesseraient "
    + "d’être rattachés à leur compte.");
  // le suffixe réel se calcule ; il n'est plus une constante
  assert.match(SOURCE, /suffixeFlux\(cle\)\s*\{/, "suffixeFlux() a disparu");
  // et le message d'aide cite le suffixe du compte COURANT, jamais une marque
  assert.match(SOURCE, /\+ this\.suffixeFlux\(this\.compteActif === 'tous'/,
    "le message d’aide ne cite plus le suffixe réel du compte courant");
});

test("le champ de nom est rendu, pas seulement produit", () => {
  // nomSaisi / renommer / aRenommer existaient depuis longtemps ; AUCUN gabarit ne les
  // lisait. Un mécanisme complet et invisible est un mécanisme absent.
  assert.match(SOURCE, /<sc-if value="\{\{ aInviteNom \}\}"/, "l’invitation n’est pas rendue");
  assert.match(SOURCE, /value="\{\{ nomSaisi \}\}" onChange="\{\{ renommer \}\}"/,
    "le champ ne lit pas le nom saisi, ou ne l’écrit pas");
  assert.match(SOURCE, /\{\{ suffixeCompte \}\}/,
    "le suffixe du compte n’est pas annoncé là où le nom se saisit — il en découle");
});

test("sur un profil vierge, le menu n’annonce aucun nom de courtier", () => {
  // le producteur RÉEL du menu, monté sur la vraie table des comptes
  const i = SOURCE.indexOf("        const conf = this.comptesConfigures();");
  assert.ok(i > 0, "le producteur du menu ne se délimite plus");
  const j = SOURCE.indexOf("\n        };\n      })(),", i);
  const corps = SOURCE.slice(i, j + "\n        };".length);
  const ctx = { Array, Object, String, Number, JSON };
  vm.createContext(ctx);
  vm.runInContext("var faux = {\n"
    + "  COURTIERS: " + JSON.stringify(COURTIERS) + ",\n"
    + "  compteActif: 'fxpro',\n"
    // profil vierge : rien de déposé, aucun nom saisi, seul le bac à sable porte le sien
    + "  comptesConfigures() { return { demo: true }; },\n"
    + "  nomCourtier(cle) { var c = this.COURTIERS.find(function (l) { return l[0] === cle; });"
    + "    return c ? c[1] : 'vos comptes'; },\n"
    + "  changerCompte() {},\n"
    + "  produire(s) {\n" + corps + "\n  },\n};", ctx);
  const r = vm.runInContext("faux.produire({ menuComptes: false })", ctx);

  // même rapatriement que `valeur()` : ce tableau vient d'un autre realm
  const tete = JSON.parse(vm.runInContext(
    "JSON.stringify(faux.produire({ menuComptes: false }).comptesTete.map("
    + "function (x) { return { cle: x.cle, nom: x.nom }; }))", ctx));
  const libelles = tete.map((x) => x.nom);
  assert.ok(libelles.length >= 2, `${libelles.length} entrées au menu, deux attendues`);
  for (const l of libelles) {
    // « — aucun relevé » est un état, pas un nom : on l'ôte avant de juger la forme
    assert.match(l.replace(/ — aucun relevé$/, ""), FORME, `« ${l} » nomme une maison`);
  }
  assert.match(r.compteTeteTxt, FORME, `le bouton annonce « ${r.compteTeteTxt} »`);

  // et le bac à sable est le SEUL compte porteur de données sur un profil vierge
  const avecDonnees = tete.filter((x) => !/ — aucun relevé$/.test(x.nom));
  assert.deepEqual(avecDonnees.map((x) => x.cle), ["demo"],
    "un compte autre que la démo porte des données sur un profil vierge");
});

// ————— LE TEST QUI PROTÈGE LES DONNÉES DÉJÀ ÉCRITES —————

test("un espace écrit sous « .fxpro » est toujours celui qu’on relit", () => {
  assert.equal(COURTIERS[0][0], "fxpro",
    "la clé du compte nº 1 a changé : tout ce qui est rangé sous « .fxpro » chez les "
    + "utilisateurs devient invisible, sans message d’erreur. Une migration doit être "
    + "écrite AVANT — voir le commentaire de COURTIERS.");

  // on relit avec le code réel de composition, pas avec une reconstitution
  const cle = litteral(SOURCE, "\n  cle(base) {", "{", "}");
  const cleGlobale = litteral(SOURCE, "\n  cleGlobale(base) {", "{", "}");
  const ctx = { Array, Object, String };
  vm.createContext(ctx);
  vm.runInContext("var faux = {\n"
    + "  COURTIERS: " + JSON.stringify(COURTIERS) + ",\n"
    + "  compteActif: 'tous', essai: false, state: { deverrouille: false },\n"
    + "  cle: function (base) " + cle + ",\n"
    + "  cleGlobale: function (base) " + cleGlobale + ",\n};", ctx);

  // la vue d'ensemble range dans le compte nº 1 : c'est là que vivent les données
  // historiques, celles d'avant le cloisonnement par compte
  assert.equal(vm.runInContext("faux.cle('vena.series.v1')", ctx), "vena.series.v1.client.fxpro");
  vm.runInContext("faux.compteActif = 'compte2'", ctx);
  assert.equal(vm.runInContext("faux.cle('vena.series.v1')", ctx), "vena.series.v1.client.compte2");
  vm.runInContext("faux.essai = true; faux.compteActif = 'tous'", ctx);
  assert.equal(vm.runInContext("faux.cle('vena.series.v1')", ctx), "vena.series.v1.essai.fxpro");
});

// ————— fluxDe() EST APPELÉE SUR CHAQUE SYMBOLE, PARTOUT —————
//
// Le motif s'est élargi : il ne cherchait qu'un mot, il cherche maintenant n'importe quel
// suffixe de compte. Un symbole coupé à tort changerait sa base, donc sa clé de série,
// donc la série qu'on croit lire. Ces cas sont ceux qui traversent réellement le moteur.

/** fluxDe() réelle, montée sur une fausse table de comptes. */
function flux(noms = {}) {
  const corps = (nom) => litteral(SOURCE, "\n  " + nom + "(", "{", "}");
  const ctx = { Object, String, Array };
  vm.createContext(ctx);
  vm.runInContext("var faux = {\n"
    + "  COURTIERS: " + JSON.stringify(COURTIERS) + ",\n"
    + "  ALIAS_FLUX: " + JSON.stringify(valeur(litteral(SOURCE, "\n  ALIAS_FLUX = {", "{", "}"))) + ",\n"
    + "  _noms: " + JSON.stringify(noms) + ",\n"
    + "  nomCourtier: function (cle) { if (this._noms[cle]) return this._noms[cle];\n"
    + "    var c = this.COURTIERS.find(function (l) { return l[0] === cle; });\n"
    + "    return c ? c[1] : 'vos comptes'; },\n"
    + "  suffixeFlux: function (cle) " + corps("suffixeFlux") + ",\n"
    + "  tableFlux: function () " + corps("tableFlux") + ",\n"
    + "  fluxDe: function (sym) " + corps("fluxDe") + ",\n};", ctx);
  return (sym) => JSON.parse(vm.runInContext(
    "JSON.stringify(faux.fluxDe(" + JSON.stringify(sym) + "))", ctx));
}

test("fluxDe : les symboles ordinaires ne sont jamais coupés", () => {
  const f = flux();
  // LE POINT EST UN CODE DE PLACE, PAS UN COMPTE. C'est le cas qui casserait le plus de
  // choses en silence : « AAPL.US » réduit à « AAPL » n'aurait plus ni série ni frais.
  for (const sym of ["AAPL.US", "BNP.FR", "ADSd.DE", "AUS200.cash", "EURUSD",
    "XAUUSD", "US500", "BTCUSD", "DEMO-TECH", "DEMO-CRYPTO", "TTE.US", "#Germany40"]) {
    assert.equal(f(sym).base, sym, `« ${sym} » a été coupé : sa base devient « ${f(sym).base} »`);
    assert.equal(f(sym).courtier, null);
  }
});

test("fluxDe : l’alias historique coupe toujours au même endroit", () => {
  const f = flux();
  // des fichiers portent déjà ces noms sur des disques : le comportement ne bouge pas
  assert.equal(f("AAPL.US-FXPRO").base, "AAPL.US");
  assert.equal(f("AAPL.US-FXPRO").courtier, "fxpro");
  assert.equal(f("GOLD-fxpro").courtier, "fxpro", "l’alias reste insensible à la casse");
  assert.equal(f("GOLD.FXPRO").courtier, "fxpro", "le point reste admis POUR L’ALIAS");
});

test("fluxDe : le suffixe d’un compte est celui de son nom", () => {
  const f = flux();
  assert.equal(f("GOLD-C2").courtier, "compte2", "« Compte nº 2 » doit donner le suffixe C2");
  assert.equal(f("GOLD-C2").base, "GOLD");
  // et il SUIT le nom : renommer le compte renomme le suffixe
  const g = flux({ compte2: "Pepperstone" });
  assert.equal(g("GOLD-PEPPERSTONE").courtier, "compte2");
  assert.equal(g("GOLD-PEPPERSTONE").label, "Pepperstone", "le libellé du flux suit le nom saisi");
  assert.equal(g("GOLD-C2").courtier, null, "l’ancien suffixe ne doit plus rien capter");
});

test("fluxDe : un compte mal nommé ne peut pas couper les titres américains", () => {
  // quelqu'un baptise un compte « US ». « AAPL.US » ne doit PAS devenir « AAPL ».
  const f = flux({ compte3: "US" });
  assert.equal(f("AAPL.US").base, "AAPL.US", "le point reste réservé à l’alias : c’est la garde");
  assert.equal(f("AAPL.US").courtier, null);
});

// ————— LA CONVENTION MT5 N'APPARTIENT À AUCUN COMPTE —————
//
// La table qui traduit GER40 → #Germany40 et XAUUSD → GOLD décrit le vocabulaire du
// catalogue MT5, pas le catalogue d'une maison : le « # » devant les indices et leur nom
// par pays sont une convention de place. Elle était pourtant indexée par clé de compte —
// ALIAS_COURTIER.fxpro — et lue partout sous cette forme. Un client sur son propre compte
// héritait donc d'une table qui semblait décrire « le courtier nº 1 », et son deuxième
// compte n'en profitait pas alors que son terminal suit la même convention.

const CONVENTIONS = valeur(litteral(SOURCE, "\n  CONVENTIONS_MT5 = {", "{", "}"));

test("la table de conventions n’est plus rangée sous une clé de compte", () => {
  // hors commentaires : le commentaire de la table RACONTE l'ancien rangement, et doit
  // pouvoir le nommer — c'est ce qui empêche quelqu'un de le refaire par ignorance.
  // L'interdit porte sur l'identifiant qui s'exécute, pas sur la mémoire de ce qu'il fut.
  assert.equal(sansCommentaires(SOURCE).includes("ALIAS_COURTIER"), false,
    "la table est encore nommée d’après un courtier, ou lue par clé de compte");
  // à plat : les valeurs sont des symboles, jamais des sous-tables par compte
  const parCompte = Object.entries(CONVENTIONS)
    .filter(([, v]) => typeof v !== "string")
    .map(([k]) => k);
  assert.deepEqual(parCompte, [],
    `« ${parCompte.join(", ")} » est un niveau de compte : la convention MT5 ne dépend pas `
    + "du compte qu’on regarde.");
  assert.ok(Object.keys(CONVENTIONS).length > 80,
    `${Object.keys(CONVENTIONS).length} entrées : la table a maigri au passage`);
});

test("les trois lectures consultent la table sans clé de compte", () => {
  // le pont inverse (cleFiche), la résolution de barème (chercherLigneCourtier) et la
  // lecture de frais par flux (fraisDe) — plus aucune n’indexe par compte
  const lectures = [...SOURCE.matchAll(/this\.CONVENTIONS_MT5/g)];
  assert.equal(lectures.length, 4, `${lectures.length} lectures, quatre attendues`);
  assert.equal(SOURCE.includes("CONVENTIONS_MT5["), true);
  // aucune ne passe par une variable de compte avant d’atteindre la table
  const indexee = [...SOURCE.matchAll(/CONVENTIONS_MT5\[\s*(cle|src|compte|c)\s*\]/g)];
  assert.deepEqual(indexee.map((m) => m[0]), [],
    "une lecture indexe encore la table par compte");
  // et la clé de compte a quitté la signature : la garder aurait continué de laisser
  // croire que la convention dépend du compte
  assert.match(SOURCE, /chercherLigneCourtier\(tb, sym\)/,
    "chercherLigneCourtier porte encore une clé de compte");
  const appels = [...SOURCE.matchAll(/chercherLigneCourtier\(([^)]*)\)/g)]
    .map((m) => m[1].split(",").length);
  assert.deepEqual([...new Set(appels)], [2],
    "un appel passe encore trois arguments : le troisième serait lu comme le symbole");
});

test("les appariements connus tiennent, et l’inconnu ressort inchangé", () => {
  // ce que la table doit continuer de résoudre, quel que soit le compte
  const attendus = { XAUUSD: "GOLD", GER40: "#Germany40", JP225: "#Japan225",
    NAS100: "#USNDAQ100", IBEX35: "#Spain35", US30: "#US30", "BNP.FR": "BNPP.PA" };
  for (const [de, vers] of Object.entries(attendus)) {
    assert.equal(CONVENTIONS[de], vers, `« ${de} » ne s’apparie plus à « ${vers} »`);
  }
  // et rien n'est inventé pour ce qui n'y est pas
  for (const inconnu of ["AUDCAD", "0700.HK", "STLAM.MI", "005930.KS", "EURUSD"]) {
    assert.equal(CONVENTIONS[inconnu], undefined,
      `« ${inconnu} » a gagné un alias : ce qui n’est pas connu doit ressortir inchangé`);
  }
});

test("la table est atteignable depuis un compte autre que le nº 1", () => {
  // c'est TOUT le sens du changement : on monte la vraie fonction et on l'interroge avec
  // le barème d'un second compte, sur un symbole que seule la table sait résoudre
  const corps = litteral(SOURCE, "\n  chercherLigneCourtier(tb, sym) {", "{", "}");
  const ctx = { Object, String, Array, RegExp };
  vm.createContext(ctx);
  vm.runInContext("var faux = {\n"
    + "  CONVENTIONS_MT5: " + JSON.stringify(CONVENTIONS) + ",\n"
    + "  FRAIS_SYM: {},\n"
    + "  chercherLigneCourtier: function (tb, sym) " + corps + ",\n};", ctx);
  const cherche = (tb, sym) => JSON.parse(vm.runInContext(
    "JSON.stringify(faux.chercherLigneCourtier(" + JSON.stringify(tb) + ", "
    + JSON.stringify(sym) + ") || null)", ctx));

  // un relevé quelconque, déposé sur n'importe quel compte : il nomme l'indice à la
  // façon du catalogue MT5, le client l'appelle GER40
  const releve = { "#Germany40": { sym: "#Germany40", bid: 1 }, GOLD: { sym: "GOLD", bid: 2 } };
  assert.equal(cherche(releve, "GER40").sym, "#Germany40",
    "l’alias ne se résout plus : la table n’est plus atteignable");
  assert.equal(cherche(releve, "XAUUSD").sym, "GOLD");
  assert.equal(cherche(releve, "GER40.cash").sym, "#Germany40",
    "le suffixe de contrat doit se retirer avant l’alias");
  // ce que la table ne connaît pas ne trouve rien — silence, jamais une estimation
  assert.equal(cherche(releve, "AUDCAD"), null,
    "un symbole absent doit échouer en silence, pas s’apparier de force");
  // et l'appariement flou reste interdit entre familles
  assert.equal(cherche({ "US500.cash": { sym: "US500.cash" } }, "SPX500.US"), null,
    "un indice et une action ne doivent jamais s’apparier");
});
