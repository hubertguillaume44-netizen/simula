// ————— L'ÉTANCHÉITÉ SE POSE À LA FRONTIÈRE D'ÉCRITURE, PAS CHEZ LE PRODUCTEUR —————
//
// La première garde vérifiait que le GÉNÉRATEUR n'écrit nulle part. Elle passait, et la
// fuite était ailleurs : `ecrireCouv` réécrivait la carte de couverture qu'il venait de
// lire — exemples compris. Un producteur propre ne prouve rien sur ce que le reste du
// programme fait de ce qu'il produit.
//
// Ces gardes font tourner LE VRAI CODE contre un faux stockage, dans les trois espaces
// étanches, et vérifient qu'aucune série engendrée n'entre jamais dans le navigateur.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const APP = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

/** Le corps d'une méthode de la classe, de sa signature à sa fermeture. */
function methode(signature) {
  const i = APP.indexOf("  " + signature);
  assert.ok(i > 0, `« ${signature} » a disparu`);
  const j = APP.indexOf("\n  }", i);
  assert.ok(j > i, `la fermeture de « ${signature} » ne se trouve plus`);
  return APP.slice(i, j + "\n  }".length).replace(/^  /, "");
}

/** Un faux navigateur : localStorage en mémoire, et un magasin de blocs. */
function faireStockage(depart = {}) {
  const ls = new Map(Object.entries(depart));
  return {
    ls,
    localStorage: {
      get length() { return ls.size; },
      key: (i) => [...ls.keys()][i],
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => { ls.set(k, String(v)); },
      removeItem: (k) => { ls.delete(k); },
    },
  };
}

/** Monte une méthode de la classe sur un faux composant, dans un contexte isolé. */
function monter(corps, faux, extra = {}) {
  const ctx = Object.assign({ JSON, Array, Object, String, Number, Math, Date, Promise,
    estExemple: (x) => /^VX-/.test(x) }, extra);
  vm.createContext(ctx);
  vm.runInContext("var faux = " + JSON.stringify({}) + ";", ctx);
  ctx.faux = faux;
  vm.runInContext("faux.__m = async function () { return null; };", ctx);
  vm.runInContext("faux.__pose = function (src) { faux.__fn = src; };", ctx);
  vm.runInContext("faux.__fn = (function (o) { o." + corps + "\nreturn o; })({});", ctx);
  return ctx;
}

// ————— A5 : LA MIGRATION QUI RETIRE LE COMPTE DE DÉCOUVERTE —————

const ESPACES = [".perso", ".client", ".essai"];

/** Le stockage d'un utilisateur d'avant : un compte démo peuplé dans chaque espace. */
function stockageAvant() {
  const d = {};
  for (const esp of ESPACES) {
    d["vena.series.v1" + esp + ".demo"] = JSON.stringify(["DEMO-TECH", "DEMO-CRYPTO"]);
    d["vena.bareme.v1" + esp + ".demo"] = '{"DEMO-TECH":{}}';
    d["vena.semis.v" + esp + ".demo"] = "2";
    // ce qui doit SURVIVRE : les autres comptes, les autres espaces, et surtout un
    // compte que l'utilisateur aurait nommé « demo-perso » — une recherche de « demo »
    // non ancrée en fin de clé l'aurait emporté avec le reste
    d["vena.series.v1" + esp + ".fxpro"] = JSON.stringify(["AAPL.US"]);
    d["vena.series.v1" + esp + ".demo-perso"] = JSON.stringify(["MON.SYM"]);
    d["vena.scan.v1" + esp + ".compte2"] = "{}";
  }
  d["autrechose.demo"] = "pas à nous";
  return d;
}

/** Fait tourner la vraie migration contre un faux stockage. */
async function migrer(store, blocs) {
  const corps = methode("async retirerCompteDemo() {");
  const src = "(async function () {\n"
    + "  const self = { CLE_SERIES: 'vena.series.v1', MARQUE_SANS_DEMO: 'vena.migr.demo.v1',\n"
    + "    grosSet: async (cle) => { supprimes.push(cle); return true; } };\n"
    + "  const f = " + corps.replace(/^async retirerCompteDemo\(\)/, "async function ()") + ";\n"
    + "  return await f.call(self);\n"
    + "})()";
  const ctx = { JSON, Array, Object, String, Number, Math, Date, Promise,
    localStorage: store.localStorage, supprimes: blocs,
    estCleApp: (k) => !!k && k.startsWith("vena."), console };
  vm.createContext(ctx);
  return await vm.runInContext(src, ctx);
}

test("A5 — la migration retire le compte démo des trois espaces, et lui seul", async () => {
  const store = faireStockage(stockageAvant());
  const blocs = [];
  const n = await migrer(store, blocs);
  assert.ok(n > 0, "la migration n’a rien retiré");

  // les clés du compte démo sont parties, dans les TROIS espaces
  for (const esp of ESPACES) {
    for (const base of ["vena.series.v1", "vena.bareme.v1", "vena.semis.v"]) {
      assert.equal(store.ls.has(base + esp + ".demo"), false,
        `${base}${esp}.demo est resté`);
    }
    // et les voisines sont intactes
    assert.ok(store.ls.has("vena.series.v1" + esp + ".fxpro"), `le compte 1 de ${esp} a disparu`);
    assert.ok(store.ls.has("vena.series.v1" + esp + ".demo-perso"),
      `« demo-perso » de ${esp} a été emporté : la sélection n’est pas ancrée en fin de clé`);
    assert.ok(store.ls.has("vena.scan.v1" + esp + ".compte2"), `un scan de ${esp} a disparu`);
  }
  assert.ok(store.ls.has("autrechose.demo"), "une clé qui n’est pas à nous a été touchée");

  // les blocs de bougies sont allés avec, et ils ont été trouvés PAR l'index —
  // effacer l'index d'abord les rendrait inatteignables pour toujours
  assert.equal(blocs.length, ESPACES.length * 2,
    `${blocs.length} blocs retirés, ${ESPACES.length * 2} attendus — l’index a-t-il été lu avant d’être effacé ?`);
  for (const esp of ESPACES) {
    assert.ok(blocs.includes("vena.series.v1" + esp + ".demo|DEMO-TECH"));
  }

  // la marque est posée
  assert.ok(store.ls.has("vena.migr.demo.v1"), "la marque n’a pas été posée");
});

test("A5 — LA SONDE D’IDEMPOTENCE : deux passages, un seul effet", async () => {
  // Une migration qui se rejuge à « il ne reste rien à faire » rebalaye tout le stockage
  // à chaque chargement. Pire : si un jour elle écrivait au lieu d'effacer, un second
  // passage doublerait ce qu'elle pose. La marque tranche les deux.
  const store = faireStockage(stockageAvant());
  const blocs1 = [], blocs2 = [];
  const n1 = await migrer(store, blocs1);
  const apres1 = JSON.stringify([...store.ls.entries()].sort());

  const n2 = await migrer(store, blocs2);
  const apres2 = JSON.stringify([...store.ls.entries()].sort());

  assert.ok(n1 > 0, "le premier passage n’a rien fait");
  assert.equal(n2, 0, "le second passage a retravaillé : la marque ne le retient pas");
  assert.equal(blocs2.length, 0, "le second passage a rebalayé les blocs de bougies");
  assert.equal(apres1, apres2, "le stockage a changé au second passage");
});

test("A5 — une marque déjà posée arrête la migration avant tout balayage", async () => {
  // Le cas d'un utilisateur qui repeuplerait par hasard une clé finissant par « .demo » :
  // la migration ne doit PAS la reprendre. Elle a fait son office une fois, elle ne
  // surveille pas le stockage à vie.
  const depart = stockageAvant();
  depart["vena.migr.demo.v1"] = "1";
  const store = faireStockage(depart);
  const blocs = [];
  const n = await migrer(store, blocs);
  assert.equal(n, 0);
  assert.ok(store.ls.has("vena.series.v1.perso.demo"),
    "la migration est repassée alors que sa marque était posée");
});

// ————— LA FRONTIÈRE D'ÉCRITURE, DANS LES TROIS ESPACES —————

test("aucune série d’exemple ne franchit la frontière d’écriture", async () => {
  // `garderSerie` est le SEUL chemin par lequel des bougies entrent dans le navigateur.
  // Le refus y est posé avant que la clé ne soit construite : il vaut donc pour les
  // trois espaces et les cinq comptes sans qu'on ait à les énumérer.
  const corps = methode("async garderSerie(sym, brut) {");
  const iRefus = corps.indexOf("if (estExemple(sym)) return false;");
  const iEcrit = corps.indexOf("this.grosSet(");
  assert.ok(iRefus > 0, "le refus a disparu de garderSerie");
  assert.ok(iRefus < iEcrit, "le refus doit précéder l’écriture, pas la suivre");

  // et il tient à l'exécution, dans chaque espace
  for (const esp of ESPACES) {
    const ecrits = [];
    const src = "(async function () {\n"
      + "  const self = { CLE_SERIES: 'vena.series.v1',\n"
      + "    cle: (b) => b + '" + esp + ".fxpro',\n"
      + "    grosSet: async (c) => { ecrits.push(c); return true; },\n"
      + "    compacter: (x) => x, couvertureSerie: () => null, noterCouv: () => {},\n"
      + "    planifierAuto: () => {} };\n"
      + "  const f = " + corps.replace(/^async garderSerie\(sym, brut\)/, "async function (sym, brut)") + ";\n"
      + "  return [await f.call(self, 'VX-EUR', {}), await f.call(self, 'AAPL.US', {})];\n"
      + "})()";
    const ctx = { JSON, Array, Object, String, Number, Math, Date, Promise, ecrits,
      estExemple: (x) => /^VX-/.test(x),
      localStorage: faireStockage().localStorage };
    vm.createContext(ctx);
    const [exemple, vraie] = await vm.runInContext(src, ctx);
    assert.equal(exemple, false, `une série d’exemple a été acceptée dans ${esp}`);
    assert.equal(vraie, true, `une vraie série a été refusée dans ${esp}`);
    assert.deepEqual(ecrits, ["vena.series.v1" + esp + ".fxpro|AAPL.US"],
      `ce qui a été écrit dans ${esp} : ${JSON.stringify(ecrits)}`);
  }
});

test("la couverture d’une série d’exemple ne s’enregistre pas non plus", () => {
  // Deux frontières, parce que la couverture a son propre chemin d'écriture — c'est
  // précisément celui par lequel la fuite était passée.
  const noter = methode("noterCouv(sym, couv) {");
  assert.match(noter, /if \(estExemple\(sym\)\) return;/,
    "noterCouv accepte encore les séries d’exemple");
  const ecrire = methode("ecrireCouv(m) {");
  assert.match(ecrire, /!estExemple\(k\)/,
    "ecrireCouv réécrit la carte qu’il a lue : sans filtre, les exemples s’y déposent");
});

// ————— AUCUN MOT RELATIF SUR UNE FENÊTRE FIGÉE —————

test("l’indicateur de régime se date en absolu sur les séries d’exemple", () => {
  // Leur fenêtre est écrite dans le générateur : « hier » y désigne la veille de CETTE
  // date, pas la veille d'aujourd'hui, et l'écart grandit à chaque jour qui passe. Au
  // bout de six mois, « hier » annonce une veille vieille de six mois.
  assert.match(APP, /\n      surExemples,\n/,
    "le régime ne dit plus s’il a été mesuré sur les séries d’exemple");
  assert.match(APP, /const abs = rz && rz\.surExemples;/);
  assert.match(APP, /'au ' \+ jourPlein\(rz\.veille\.jour\) \+ ' '/,
    "la veille doit être datée en toutes lettres quand la fenêtre est figée");
  assert.match(APP, /rz\.surExemples \? ' au ' \+ heure\(rz\.tFin\) : ' aujourd\\u2019hui'/,
    "la frise annonce encore « aujourd’hui » sur une fenêtre figée");
});

test("l’indicateur choisit son univers sur un RÉSULTAT, jamais sur une intention", () => {
  // DEUX CORRECTIONS SUCCESSIVES AU MÊME ENDROIT, et la première déplaçait le défaut.
  //
  //   · `this.essai` : payer sans rien importer donnait l'univers réel, dont aucune
  //     série n'est livrée — zéro mesure, indicateur muet. PAYER DONNAIT MOINS.
  //   · « ai-je des séries à moi » : vrai dès UN dépôt, même un instrument absent de la
  //     carte sectorielle. L'indicateur se taisait pour quelqu'un qui en avait un la
  //     veille. DÉPOSER DONNAIT MOINS — et la régression venait du geste qu'on demande.
  //
  // Les deux demandaient une INTENTION pour prédire un RÉSULTAT. On mesure d'abord.
  // SANS LES COMMENTAIRES. Le commentaire qui raconte les deux gardes précédentes les
  // NOMME — il doit les nommer, c'est son travail. Un test qui lirait le fichier brut
  // échouerait dessus, exactement comme l'analyseur de gabarit qui empilait un <select>
  // cité dans une note. Ce qu'on interdit, c'est le CODE, pas le récit du code.
  const corps = methode("async calcRegime(zone) {").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/this\.essai/.test(corps), "la licence décide encore de l’univers");
  assert.ok(!/const aMoi =/.test(corps), "une intention décide encore de l’univers");

  // le premier relevé porte sur l'univers réel, le repli sur les exemples vient APRÈS
  const iReel = corps.indexOf("await relever(Object.keys(carte), this.ZONES[z].indices);");
  const iRepli = corps.indexOf("if (!mesures.length) { surExemples = true; await relever([...SYM_EXEMPLES], []); }");
  assert.ok(iReel > 0, "le relevé de l’univers réel a disparu");
  assert.ok(iRepli > iReel,
    "le repli doit suivre le relevé : décidé avant, il redevient une intention");
});

test("une série d’exemple ne porte jamais un verdict qu’on ne peut pas lever", () => {
  // QUAND L'EXPLICATION DOIT CONTREDIRE L'ÉTIQUETTE, C'EST L'ÉTIQUETTE QUI EST LE
  // DÉFAUT. Le premier correctif gardait « périmée » et ajoutait en dessous « il n'y a
  // rien à réexporter ». Une étiquette est actionnable par construction : « périmée »
  // veut dire refais ton export. À partir du 27 octobre 2026 il y en aurait eu dix, sur
  // le premier écran, pour toujours — et toute capture faite après aurait montré dix
  // alertes que personne ne peut lever.
  const corps = methode("async calcRegime(zone) {"); // simple vérification que le fichier est lisible
  assert.ok(corps.length > 0);

  // le verdict, et les DEUX encres d'alerte qui le suivaient sans le dire
  assert.match(APP, /vieux \? \(estExemple\(sel\) \? \['fenêtre fixe', 'tag tag-outline'\]/,
    "une série d’exemple porte encore « périmée »");
  const encres = [...APP.matchAll(/\(!la \|\| nTrous \|\| \(vieux && !estExemple\(sel\)\)\)/g)];
  assert.equal(encres.length, 2,
    `${encres.length} encres suivent le verdict, deux attendues — `
    + "fTrouCouleur et fBndBougiesCoul passaient en accent-900 sur `vieux` seul, "
    + "donc les dix exemples auraient porté la couleur d’alerte sans porter le mot");

  // et le seuil lui-même n'est PAS exempté : il ne pilote aucun comportement, c'est le
  // verdict qui change, pas la mesure
  assert.match(APP, /const vieux = cv \? \(Date\.now\(\) - cv\.t1\) > 45 \* 86400000 : false;/,
    "le seuil a été modifié : c’était le verdict qu’il fallait renommer, pas la mesure");
});
