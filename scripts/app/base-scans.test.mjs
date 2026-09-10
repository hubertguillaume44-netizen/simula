// ————— LES SCANS, ET LE MAGASIN QUI N'EXISTAIT PAS —————
//
// Deux fonctions ouvrent la base « vena.auto ». `migrerBase` tourne AU CHARGEMENT DU
// SCRIPT, avant que la classe existe, donc avant `idb()` : c'est elle qui posait le
// schéma. Elle ouvrait en version 2 et n'y créait que le magasin « h ». `idb()` ouvrait
// ensuite la même version, ne déclenchait aucune mise à niveau, et ne trouvait jamais le
// magasin « gros ».
//
// Conséquence : toute écriture de scan échouait EN SILENCE — `grosSet` rend `false` sans
// rien dire — l'application retombait sur le miroir localStorage, et ce miroir devenait
// le seul exemplaire. 3,27 Mo dans un magasin plafonné à 5 Mo. C'est la cause première
// de la perte de données, pas sa conséquence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

/** Les ouvertures de « vena.auto » : version demandée et magasins créés. */
function ouvertures() {
  const out = [];
  for (const m of SOURCE.matchAll(/indexedDB\.open\(([^)]*)\)/g)) {
    const args = m[1];
    // l'ouverture SANS version ne crée rien : c'est la lecture de l'ancienne base
    const version = args.match(/,\s*(\d+)\s*$/);
    if (!version) continue;
    // le bloc de mise à niveau qui suit
    const suite = SOURCE.slice(m.index, m.index + 700);
    const magasins = [...suite.matchAll(/createObjectStore\('(\w+)'\)/g)].map((x) => x[1]);
    out.push({ version: Number(version[1]), magasins, args });
  }
  return out;
}

test("toutes les ouvertures de la base demandent la MÊME version", () => {
  const v = ouvertures();
  assert.ok(v.length >= 2, "il devrait y avoir au moins deux ouvertures versionnées");
  const versions = [...new Set(v.map((x) => x.version))];
  assert.equal(versions.length, 1,
    `deux versions coexistent (${versions.join(", ")}) : celle qui ouvre en premier pose le `
    + "schéma, et l’autre ne voit jamais le sien appliqué");
});

test("chaque ouverture crée les DEUX magasins", () => {
  // « h » porte les poignées de fichier, « gros » les scans et les bougies. Une base
  // créée avec un seul des deux est irréparable sans changement de version.
  for (const o of ouvertures()) {
    for (const magasin of ["h", "gros"]) {
      assert.ok(o.magasins.includes(magasin),
        `une ouverture (v${o.version}) ne crée pas « ${magasin} » : ${o.magasins.join(", ") || "aucun"}`);
    }
  }
});

test("la version a été relevée : les bases déjà créées sans « gros » se réparent", () => {
  // sans relèvement, une base existante en v2 sans « gros » ne déclenche aucune mise à
  // niveau et reste cassée pour toujours
  const v = ouvertures()[0];
  assert.ok(v.version >= 3, `version ${v.version} : les bases cassées ne seraient pas réparées`);
});

test("le miroir localStorage a un budget en OCTETS, pas en lignes", () => {
  const i = SOURCE.indexOf("MIROIR_MAX_OCTETS =");
  assert.ok(i > 0, "le miroir n’a plus de budget : il peut reprendre toute la place");
  const budget = Number(SOURCE.slice(i).match(/MIROIR_MAX_OCTETS = (\d+) \* 1024;/)[1]);
  // le magasin fait 5 Mo : un filet qui en prend plus d'un dixième n'est plus un filet
  assert.ok(budget <= 512, `budget de ${budget} Ko : trop pour un magasin de 5 Mo`);
  const corps = SOURCE.slice(SOURCE.indexOf("miroirScan(scan, fiche) {"), SOURCE.indexOf("ecrireScanFilet(scan, fiche) {"));
  // le poids est mesuré sur le TEXTE, avant l'écriture, et non deviné du nombre de lignes
  assert.match(corps, /\(cle\.length \+ texte\.length\) \* 2 > this\.MIROIR_MAX_OCTETS\) continue;/);
});

test("la migration des scans relit avant de supprimer, et laisse la source sur échec", () => {
  const i = SOURCE.indexOf("async migrerScansVersBase() {");
  assert.ok(i > 0, "la migration des scans a disparu");
  const corps = SOURCE.slice(i, SOURCE.indexOf("async lireScanComplet() {"));
  // écrire, RELIRE, comparer, puis seulement supprimer
  const iEcrit = corps.indexOf("await this.grosSet(cleG, this.compacterBloc(bloc))");
  const iRelu = corps.indexOf("const relu = this.decompacterBloc(await this.grosGet(cleG));");
  const iSuppr = corps.indexOf("STOCK_BRUT.removeItem(k);");
  assert.ok(iEcrit > 0 && iRelu > iEcrit && iSuppr > iRelu,
    "l’ordre écrire → relire → supprimer n’est pas tenu");
  // la comparaison porte sur le nombre de lignes, et la source reste si la base en rend moins
  assert.match(corps, /if \(nRelu < n\) \{ restantes\.push\(k\); continue; \}/);
  // un bloc DÉJÀ en base et plus complet fait foi : le miroir est élagué par construction
  assert.match(corps, /if \(nDeja < n\) \{/);
  // et l'échec se voit
  assert.match(corps, /motif: 'migration'/);
});

test("seuls les scans partent — ni le témoin, ni la marque de départ", () => {
  const corps = SOURCE.slice(SOURCE.indexOf("async migrerScansVersBase() {"),
    SOURCE.indexOf("async lireScanComplet() {"));
  // le motif est lu dans la source, pas recopié : une copie qui dérive ne dirait rien
  const motif = corps.match(/if \((\/[^\n]+?\/)\.test\(x\)\) cles\.push/);
  assert.ok(motif, "le filtre des clés de scan a changé de forme");
  const corps2 = motif[1].slice(1, -1);
  const re = new RegExp(corps2);
  assert.ok(re.test("scan.v1.client.fxpro"), "un vrai scan n’est plus reconnu");
  assert.ok(re.test("scan.v1.essai"), "un scan d’un autre espace n’est plus reconnu");
  // ces deux-là sont petits et se relisent à chaque démarrage : ils restent où ils sont
  assert.ok(!re.test("scan.temoin.client.fxpro"), "le témoin serait déplacé");
  assert.ok(!re.test("scan.depart"), "la marque de départ serait déplacée");
  assert.ok(!re.test("scanX.v1"), "le filtre est trop large");
});
