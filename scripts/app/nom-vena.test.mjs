// ————— LE RENOMMAGE, ET SA MIGRATION —————
// « Véna » partout où un humain lit, « vena » partout où une machine lit. L'ancien nom
// n'a le droit de survivre qu'à DEUX endroits : le code de migration du stockage, et
// l'acceptation d'une sauvegarde ancienne. Partout ailleurs, il est un défaut.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RACINE = new URL("../../", import.meta.url).pathname;
const IGNORE = new Set(["node_modules", ".git", "dist", "build", ".netlify", "public"]);
/** tous les fichiers texte du dépôt, sauf les artefacts et le journal d'aide généré */
function fichiers(dir = RACINE, out = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORE.has(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (/\.(mjs|js|ts|tsx|json|html|md|mq5|sql|py)$/.test(e)) out.push(p);
  }
  return out;
}
const relatif = (p) => p.slice(RACINE.length);
// les mots français « simulation », « simulateur », « simuler » ne sont pas la marque
const ANCIEN = /sivula|simula(?!t|nt)/i;

test("l’ancien nom ne survit que dans la migration et l’import de sauvegarde", () => {
  const permis = [
    // la migration du stockage : elle DOIT nommer l'ancien préfixe, c'est son objet
    /PREFIXE_ANCIEN|MIGRATION DU STOCKAGE|migrerCle\(|DB_ANCIEN|MIGRATION DE LA BASE|MIGRATION « simula/,
    /'simula\.spreads\.entree\.v1\.client\.fxpro'/,        // l'exemple du commentaire
    /"simula\.runs\.v1"|"simula\.onb\.v1"|"simula\.uploads\.v1"/,
    // l'import d'une sauvegarde ancienne, sans date limite
    /b\.outil !== 'simula'|b\.outil !== "simula"|sivula_chiffre|\.vena,\.sivula/,
    // le repli du script MT5 sur l'ancien dossier
    /Sivula\\\\symboles\.txt|ancien dossier Sivula|liste dans Sivula/,
    // l'adresse du dépôt GitHub, qui n'est pas renommable depuis ici
    /hubertguillaume44-netizen\/simula/,
  ];
  const fautes = [];
  for (const p of fichiers()) {
    const r = relatif(p);
    // l'artefact et l'index sont régénérés : ils suivent la source, on les teste à part
    if (r === "Vena.solo.html" || r === "aide-index.json") continue;
    // ce test énonce la règle, et CLAUDE.md l'écrit : tous deux doivent pouvoir nommer
    // l'ancien nom pour dire où il a le droit de survivre
    if (r === "scripts/app/nom-vena.test.mjs" || r === "CLAUDE.md") continue;
    const lignes = readFileSync(p, "utf8").split("\n");
    lignes.forEach((l, i) => {
      if (!ANCIEN.test(l)) return;
      if (permis.some((re) => re.test(l))) return;
      fautes.push(r + ":" + (i + 1) + " — " + l.trim().slice(0, 90));
    });
  }
  assert.deepEqual(fautes, [], "l’ancien nom subsiste hors des deux endroits permis");
});

test("aucun accent dans un nom de fichier, une clé ou un chemin", () => {
  const fautes = [];
  // un « é » dans un chemin ou une clé casse au premier transfert entre Windows et Mac :
  // les deux systèmes ne normalisent pas le même Unicode
  const suspects = [
    /['"][^'"\n]*V[éÉ]na[^'"\n]*\.(json|csv|txt|zip|mq5|ex5|png|html)['"]/g,
    /['"][^'"\n]*V[éÉ]na[\\/][^'"\n]*['"]/g,
    /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(['"][^'"]*[éèêàçÉÈÊÀÇ]/g,
    /indexedDB\.open\(['"][^'"]*[éèêàçÉÈÊÀÇ]/g,
    /download = ['"][^'"]*[éèêàçÉÈÊÀÇ]/g,
  ];
  for (const p of fichiers()) {
    const r = relatif(p);
    if (r === "Vena.solo.html" || r === "aide-index.json") continue;
    if (r.startsWith("scripts/app/nom-vena.test.mjs")) continue;
    const txt = readFileSync(p, "utf8");
    for (const re of suspects) {
      for (const m of txt.matchAll(re)) fautes.push(r + " — " + m[0].slice(0, 70));
    }
  }
  assert.deepEqual(fautes, [], "un accent s’est glissé dans un identifiant machine");
});

test("aucun fichier du dépôt ne porte l’ancien nom", () => {
  const mauvais = fichiers().map(relatif).filter((r) => /sivula|simula/i.test(path.basename(r)));
  assert.deepEqual(mauvais, [], "des fichiers portent encore l’ancien nom");
});

// ————— CE QUI EST GELÉ —————
test("le numéro magique ne dépend pas du nom de l’application", () => {
  const src = readFileSync(path.join(RACINE, "Vena.dc.html"), "utf8");
  // il identifie les positions ouvertes chez le courtier : un robot qui perd son magique
  // perd la trace de ses propres positions
  assert.match(src, /cleMagic\(v\) \{ return \[v\.sym, v\.entree, v\.ligne, v\.periode, v\.sl, v\.rr, v\.sens\]\.join\('\|'\); \}/,
    "la clé du magique ne doit porter que la configuration");
  assert.match(src, /magicDe\(v\) \{ return this\.hachMagic\(this\.cleMagic\(v\) \+ '\|' \+ this\.compteDesFichiers\(\)\); \}/,
    "le magique ne doit hacher que la configuration et le compte");
  const i = src.indexOf("hachMagic(cle) {");
  const corps = src.slice(i, src.indexOf("\n  }", i));
  assert.ok(!/vena|Véna|sivula/i.test(corps), "aucun nom d’application dans le hachage");
});

test("les étiquettes du protocole MT5 restent SIV_", () => {
  const robot = readFileSync(path.join(RACINE, "robot-mt5.js"), "utf8");
  // écrites par les robots DÉJÀ COMPILÉS et lues par l’application : les basculer
  // couperait la trace des robots en place
  for (const gele of ["'SIV_' + stamp", '"SIV_trades_"', '"SIV_NIV_"', 'PAN_PREF "SIV_PAN_"']) {
    assert.ok(robot.includes(gele), "étiquette de protocole perdue : " + gele);
  }
  const page = readFileSync(path.join(RACINE, "Vena.dc.html"), "utf8");
  assert.match(page, /\/\^SIV_trades_\/i/, "l’application doit continuer de reconnaître SIV_trades_");
  // le NOM du fichier de robot, lui, est machine : sans accent, sinon nomRobot le mange
  assert.match(robot, /return \['Vena', cfg\.sym,/, "le nom du robot exporté doit être « Vena », sans accent");
});

test("une sauvegarde de l’ancienne version reste importable", () => {
  const src = readFileSync(path.join(RACINE, "Vena.dc.html"), "utf8");
  // trois lectures de sauvegarde, toutes doivent accepter l’ancien marqueur
  const lectures = src.match(/\(b\.outil !== 'vena' && b\.outil !== 'simula'\)/g) || [];
  assert.equal(lectures.length, 3, "les trois lectures doivent accepter les deux marqueurs, vu " + lectures.length);
  assert.match(src, /b\.vena_chiffre === 1 \|\| b\.sivula_chiffre === 1/,
    "la sauvegarde chiffrée doit accepter les deux marqueurs");
  assert.match(src, /accept="application\/json,\.json,\.vena,\.sivula"/,
    "le champ d’import doit accepter les deux extensions");
  // à l’écriture : le nouveau nom SEULEMENT
  assert.ok(!/outil: 'simula'/.test(src), "aucune écriture ne doit produire l’ancien marqueur");
  assert.ok(!/sivula_chiffre: 1/.test(src), "aucune écriture ne doit produire l’ancien marqueur chiffré");
});

test("un import ancien repose ses clés au nouveau préfixe", () => {
  const src = readFileSync(path.join(RACINE, "Vena.dc.html"), "utf8");
  // sans traduction, l'import annoncerait « 40 blocs réimportés » et l'écran resterait
  // vide : les clés reposées seraient celles que l'application ne lit plus
  assert.match(src, /cleVersNeuf\(k\) \{/, "la traduction de préfixe doit exister");
  const appels = (src.match(/this\.cleVersNeuf\(k0\)/g) || []).length;
  assert.equal(appels, 2, "les deux chemins d’import doivent traduire, vu " + appels);
  // le préfixe des gros blocs vit derrière « gros: »
  assert.match(src, /const g = 'gros:' \+ PREFIXE_ANCIEN;/,
    "les scans complets doivent être traduits aussi");
  // une seule traduction dans tout le fichier
  const defs = (src.match(/cleVersNeuf\(k\) \{/g) || []).length;
  assert.equal(defs, 1, "une seule traduction, vu " + defs);
});

test("la migration tourne avant la classe, et ne supprime rien", () => {
  const src = readFileSync(path.join(RACINE, "Vena.dc.html"), "utf8");
  const iMig = src.indexOf("const MIGRATION = migrerStockage();");
  const iClasse = src.indexOf("class Component extends DCLogic {");
  assert.ok(iMig > 0 && iClasse > 0 && iMig < iClasse,
    "la migration doit s’exécuter avant la classe, donc avant la moindre lecture");
  const corps = src.slice(src.indexOf("function migrerStockage()"), iMig);
  // rien n'est supprimé : l'ancien jeu reste au moins une version
  assert.ok(!/localStorage\.removeItem\(ancienne\)/.test(corps),
    "la migration ne doit jamais supprimer l’ancienne clé");
  // la clé neuve fait foi
  assert.match(corps, /if \(localStorage\.getItem\(neuve\) !== null\) continue;/,
    "une clé neuve déjà présente ne doit pas être écrasée");
  // relecture après écriture : un refus de quota est silencieux
  assert.match(corps, /if \(localStorage\.getItem\(neuve\) !== v\)/,
    "chaque copie doit être relue avant d’être comptée");
  // la trace en dernier, et seulement si tout a réussi
  assert.match(corps, /if \(!echecs\) \{/, "la trace ne doit pas se poser sur une migration partielle");
  // les données avant les réglages
  const iD = corps.indexOf("MIGRATION_DONNEES"), iR = corps.indexOf("MIGRATION_REGLAGES");
  assert.ok(iD < iR && iD > -1, "les données doivent passer avant les réglages");
});
