// ————— LA JAUGE DOIT LIRE LE NAVIGATEUR, PAS SE RECALCULER —————
//
// Mesuré chez l'utilisateur : `navigator.storage.estimate()` rendait usage 284 362 112
// et quota 304 012 710 — 93 % occupés — et le panneau affichait « 11 Mo sur 299 Mo ».
// Le quota était juste, l'occupation fausse d'un facteur 25 : elle venait de la somme
// des postes de l'inventaire, pas de `usage`.
//
// Un inventaire maison ne peut pas connaître le coût réel d'IndexedDB — surcoût par
// enregistrement, index, espace non encore rendu après suppression. Seul le navigateur
// le sait, et il le donne. La seule jauge que l'utilisateur regarde lui a dit qu'il
// avait 288 Mo de libre quand il en avait 19 : c'est ce chiffre qui a rendu la
// saturation incompréhensible toute une journée.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

function extraire(debut, fin) {
  const i = SOURCE.indexOf(debut);
  const j = SOURCE.indexOf(fin, i);
  assert.ok(i > 0 && j > i, `bloc introuvable : ${debut.slice(0, 40)}`);
  return SOURCE.slice(i, j);
}

/** Le corps d'une IIFE de renderVals, délimité par comptage d'accolades. */
function corpsIIFE(marqueur) {
  const m = SOURCE.indexOf(marqueur);
  assert.ok(m > 0, `marqueur introuvable : ${marqueur.slice(0, 40)}`);
  // remonter à l'ouverture `...(() => {` qui précède
  const ouvre = SOURCE.lastIndexOf("(() => {", m);
  assert.ok(ouvre > 0 && ouvre < m, "l’IIFE ne se délimite plus");
  let i = SOURCE.indexOf("{", ouvre + 7);
  let n = 0;
  for (let j = i; j < SOURCE.length; j++) {
    const c = SOURCE[j];
    if (c === "{") n++;
    else if (c === "}") { n--; if (n === 0) return SOURCE.slice(i + 1, j); }
  }
  throw new Error("accolade non refermée");
}

/** Le producteur réel du panneau, monté sur un faux composant. */
function panneau(place, etat = {}) {
  const corps = corpsIIFE("        const p = s.place;\n        if (!p) return { aPlace: false");
  const ctx = { Math, Number, String, JSON, Object, Proxy, Array, Date };
  vm.createContext(ctx);
  vm.runInContext(
    "var reel = {\n"
    + "  taille(o) { const n = Number(o || 0);\n"
    + "    if (n >= 1048576) return (Math.round(n / 1048576 * 10) / 10) + ' Mo';\n"
    + "    if (n >= 1024) return Math.round(n / 1024) + ' Ko';\n"
    + "    return n + ' o'; },\n"
    + "  cleGlobale() { return '.client'; },\n"
    + "  produire(s) {\n" + corps + "\n  },\n"
    + "};\n"
    // L'IIFE du panneau porte aussi les sections du tiroir, qui appellent une dizaine
    // d'autres méthodes. Les stuber une par une n'apprendrait rien : ce test ne juge que
    // la jauge, et tout le reste rend une valeur inoffensive.
    + "var faux = new Proxy(reel, { get(t, k) {\n"
    + "  if (k in t) return t[k];\n"
    + "  const f = function () { return null; }; f.slice = () => []; return f;\n"
    + "} });", ctx);
  return vm.runInContext("reel.produire.call(faux, " + JSON.stringify({ place, ...etat }) + ")", ctx);
}

// Les chiffres relevés chez l'utilisateur. Le formatage vient du `taille` du banc,
// pas de celui de l'application : ce qu'on juge ici est la VALEUR, pas sa mise en forme.
const RELEVE = {
  utilise: 284_362_112, quota: 304_012_710, part: 284_362_112 / 304_012_710,
  aNous: 11 * 1048576, integre: true,
  local: { octets: 2_115_006, cles: 47, plafond: 5 * 1048576, part: 2_115_006 / (5 * 1048576) },
};

test("le total affiché est `usage`, jamais une somme recalculée", () => {
  const r = panneau(RELEVE);
  // 271 Mo, le chiffre du navigateur — pas 11, la somme des postes
  assert.match(r.placeTxt, /271[,.]?\d* Mo utilisés/, `affiché : ${r.placeTxt}`);
  assert.match(r.placeTxt, /sur 289[,.]?\d* Mo/, `échelle : ${r.placeTxt}`);
  assert.ok(!/^11 Mo/.test(r.placeTxt), "la somme de l’inventaire ne doit plus faire le total");
  // et la barre suit le même chiffre
  assert.equal(r.placePart, "94%", `barre : ${r.placePart}`);
});

test("l’écart entre les postes identifiés et `usage` est énoncé, pas masqué", () => {
  const r = panneau(RELEVE);
  assert.match(r.placeTxt, /dont 11 Mo identifiés poste par poste/, r.placeTxt);
  assert.match(r.placeTxt, /IndexedDB n’a pas encore rendu/);
});

test("un écart négligeable ne se dit pas : ce serait du bruit", () => {
  const r = panneau({ ...RELEVE, aNous: 284_000_000 });
  assert.ok(!/identifiés poste par poste/.test(r.placeTxt), r.placeTxt);
});

test("le petit tiroir a sa ligne, son plafond fixe et sa part", () => {
  const r = panneau(RELEVE);
  assert.ok(r.aPlaceLocale, "le petit tiroir n’est plus mesuré");
  // 2,02 Mo sur 5 Mo, 40 % — et ce plafond n'entre pas dans estimate()
  assert.match(r.placeLocaleTxt, /2[,.]?\d* Mo sur 5 Mo/, r.placeLocaleTxt);
  assert.match(r.placeLocaleTxt, /40 %/);
  assert.match(r.placeLocaleTxt, /47 clés/);
  assert.equal(r.placeLocalePart, "40%");
  // les deux jauges ne se mélangent plus : celle du navigateur est à 94 %, celle-ci à 40
  assert.notEqual(r.placePart, r.placeLocalePart);
});

test("la vue intégrée dit que le stockage est réduit et cloisonné", () => {
  const r = panneau(RELEVE);
  assert.ok(r.aPlaceIntegre, "rien ne signale la vue intégrée");
  assert.match(r.placeIntegreTxt, /RÉDUIT/);
  assert.match(r.placeIntegreTxt, /CLOISONNÉ/);
  assert.match(r.placeIntegreTxt, /plusieurs gigaoctets/);
  // et le quota réel y est nommé, pour que le chiffre se juge
  assert.match(r.placeIntegreTxt, /289[,.]?\d* Mo ici/);
});

test("hors vue intégrée, la phrase ne s’affiche pas", () => {
  const r = panneau({ ...RELEVE, integre: false });
  assert.equal(r.aPlaceIntegre, false);
});

test("`mesurerPlace` lit usage ET quota de estimate(), et pèse le tiroir à part", () => {
  const corps = extraire("  async mesurerPlace() {", "\n  }\n  // Inventaire du stockage");
  assert.match(corps, /const p = \{ utilise: e\.usage, quota: e\.quota, part: e\.usage \/ e\.quota,/);
  assert.match(corps, /local: this\.poidsLocal\(\)/);
  assert.match(corps, /integre: this\.dansIframe\(\)/);
});

test("le petit tiroir se pèse sur le stockage RÉEL, jamais à travers la façade", () => {
  const corps = extraire("  poidsLocal() {", "  async mesurerPlace() {");
  assert.match(corps, /STOCK_BRUT\.key\(i\)/);
  assert.match(corps, /\* 2;/, "le stockage compte en UTF-16 : deux octets par caractère");
  // le plafond est une constante nommée, pas un nombre perdu dans une phrase
  assert.match(SOURCE, /PLAFOND_LOCAL = 5 \* 1024 \* 1024;/);
});

test("la pastille dit DE QUEL tiroir elle parle", () => {
  // « mémoire presque pleine » au-dessus d’un panneau annonçant 288 Mo de libre :
  // deux jauges qui se contredisent ne valent aucune jauge
  assert.ok(!/'mémoire presque pleine'/.test(SOURCE), "la pastille ne nomme pas son tiroir");
  assert.match(SOURCE, /'stockage du navigateur presque plein'/);
});

// ————— LA SORTIE DE LA VUE INTÉGRÉE CHANGE DE COFFRE —————
//
// « Ouvrez Véna dans un onglet à part » est le bon conseil pour le stockage : la page
// cesse d'être cloisonnée et le quota passe à plusieurs gigaoctets. Mais une iframe
// cloisonnée et un onglet de premier plan sont DEUX PARTITIONS : les données ne suivent
// pas. Suivre ce conseil sans exporter, c'est perdre son travail une seconde fois.
//
// D'où la séquence : tant qu'aucun export du jour n'existe, l'export porte le bouton
// plein. L'ouverture n'est jamais bloquée — c'est l'évidence du geste qui change.

/** Le producteur du rang permanent, monté sur un faux composant. */
function rangIntegre({ integre = true, quota = 304012710, export_ = null } = {}) {
  const corps = corpsIIFE("            if (!this.dansIframe()) {");
  const ctx = { Math, Number, String, JSON, Object, Date };
  vm.createContext(ctx);
  vm.runInContext(
    "var reel = {\n"
    + "  dansIframe() { return " + JSON.stringify(integre) + "; },\n"
    + "  lireSauvInfo() { return { t: " + JSON.stringify(export_ || 0) + " }; },\n"
    + "  quandCourt(t) { return 'auj. 16:16'; },\n"
    + "  taille(o) { return Math.round(Number(o || 0) / 1048576) + ' Mo'; },\n"
    + "  produire(s) {\n" + corps + "\n  },\n"
    + "};", ctx);
  return vm.runInContext("reel.produire({ place: { quota: " + quota + " } })", ctx);
}

test("hors vue intégrée, le rang n’existe pas", () => {
  assert.equal(rangIntegre({ integre: false }).aVueIntegre, false);
});

test("le rang nomme le quota réel et dit le prix AVANT le clic", () => {
  const r = rangIntegre();
  assert.ok(r.aVueIntegre);
  assert.match(r.vueIntegreTxt, /réduit et cloisonné/);
  assert.match(r.vueIntegreTxt, /290 Mo ici/, r.vueIntegreTxt);
  // le prix, en toutes lettres, dans le texte du rang — pas dans une infobulle
  assert.match(r.vueIntegreTxt, /SON PROPRE COFFRE/);
  assert.match(r.vueIntegreTxt, /les données d’ici n’y seront pas/);
});

test("sans export du jour, c’est l’export qui porte le bouton plein", () => {
  const r = rangIntegre({ export_: 0 });
  assert.equal(r.vueIntegreExportCls, "btn btn-primary");
  assert.equal(r.vueIntegreOuvrirCls, "btn btn-ghost");
  assert.equal(r.vueIntegreExportTxt, "Aucun export aujourd’hui");
  // et l'infobulle de l'ouverture dit pourquoi elle est en second
  assert.match(r.vueIntegreOuvrirAide, /Exportez d’abord/);
});

test("avec un export du jour, les deux boutons s’inversent", () => {
  const r = rangIntegre({ export_: Date.now() - 3600000 });
  assert.equal(r.vueIntegreExportCls, "btn btn-ghost");
  assert.equal(r.vueIntegreOuvrirCls, "btn btn-primary");
  assert.match(r.vueIntegreExportTxt, /Export du jour/);
  assert.ok(!/Exportez d’abord/.test(r.vueIntegreOuvrirAide));
});

test("un export d’avant-hier ne couvre pas : le compte se fait en 24 h", () => {
  const r = rangIntegre({ export_: Date.now() - 3 * 86400000 });
  assert.equal(r.vueIntegreExportCls, "btn btn-primary");
  assert.equal(r.vueIntegreExportTxt, "Aucun export aujourd’hui");
});

test("la date vient de lireSauvInfo, pas d’un drapeau nouveau", () => {
  // deux mémoires de la même chose finissent par diverger : celle-ci est déjà celle
  // qu’affiche « Dernier export »
  const corps = corpsIIFE("            if (!this.dansIframe()) {");
  assert.match(corps, /let t = this\.lireSauvInfo\(\)\.t;/);
  assert.match(corps, /if \(s\.sauvDate\) t = Math\.max\(t, s\.sauvDate\);/);
  assert.ok(!/vena\.integre|integreVu|CLE_INTEGRE/.test(SOURCE), "un drapeau nouveau est apparu");
});

test("l’ouverture n’est jamais bloquée, et n’emporte rien avec elle", () => {
  const i = SOURCE.indexOf("ouvrirOngletPropre: () => {");
  assert.ok(i > 0, "le bouton d’ouverture a disparu");
  const corps = SOURCE.slice(i, SOURCE.indexOf("},", i) + 2);
  assert.match(corps, /window\.open\(location\.href, '_blank', 'noopener'\)/);
  // aucune condition : le but est que le geste sûr soit le plus évident, pas que
  // l’autre soit interdit
  assert.ok(!/if \(|couvert|return;/.test(corps.replace(/catch[\s\S]*/, "")),
    "l’ouverture ne doit être soumise à aucune condition");
});
