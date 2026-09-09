/**
 * LE SCAN NE DOIT PLUS DÉPENDRE DE L'ONGLET AU PREMIER PLAN.
 *
 * Le calcul tourne dans les workers, qui ne sont pas bridés. Ce qui obligeait à
 * garder l'onglet devant, c'était la boucle d'orchestration restée sur le fil
 * principal : elle cédait la main par `setTimeout(0)` — une fois par instrument, et
 * une fois par VARIANTE dans le repli séquentiel. Chrome plafonne les minuteries
 * d'un onglet caché à une par seconde, puis à une par minute au-delà de cinq
 * minutes. Ces cessions passent par un tour de MessageChannel, qui n'est pas bridé.
 *
 * CE QUE CE TEST NE FAIT PAS : mesurer le bridage. Playwright lance Chromium avec
 * --disable-background-timer-throttling, --disable-backgrounding-occluded-windows
 * et --disable-renderer-backgrounding, c'est-à-dire qu'il désactive exactement ce
 * qu'il faudrait observer : un test qui y passerait ne prouverait rien. La mesure
 * se fait à la main dans un vrai Chrome (voir scripts/app/cadence-onglet.md).
 *
 * L'INVARIANT PORTE DONC SUR LE CODE :
 *   1. plus aucune minuterie dans `lancerScan`, où vivent les deux cessions ;
 *   2. les deux cessions passent bien par la fonction utilitaire ;
 *   3. cette fonction rend la main de façon ASYNCHRONE, sans minuterie, en
 *      réutilisant un seul canal et en respectant l'ordre des demandes.
 * Le code testé n'est pas recopié : il est extrait des deux fichiers livrés.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FICHIERS = ["Vena.dc.html", "Vena.solo.html"];

function source(fichier) {
  return readFileSync(new URL("../../" + fichier, import.meta.url), "utf8");
}

/** Le corps d'une méthode de la classe, des accolades équilibrées. */
function methode(txt, entete) {
  const i = txt.indexOf(entete);
  assert.ok(i >= 0, "méthode introuvable : " + entete);
  let prof = 0, j = txt.indexOf("{", i);
  const debut = j;
  for (; j < txt.length; j++) {
    const c = txt[j];
    if (c === "{") prof++;
    else if (c === "}") { prof--; if (!prof) return txt.slice(debut, j + 1); }
  }
  assert.fail("accolades non refermées pour " + entete);
}

for (const f of FICHIERS) {
  test(f + " : aucun setTimeout ne subsiste dans la boucle de scan", () => {
    const corps = methode(source(f), "  async lancerScan(force) {");
    const restes = corps.match(/setTimeout/g) || [];
    assert.deepEqual(restes, [],
      "une cession par minuterie a reparu dans lancerScan : elle sera bridée dès que "
      + "l'onglet passe derrière (" + restes.length + " occurrence(s))");
  });

  test(f + " : la seule minuterie restante est l'horloge d'affichage", () => {
    const corps = methode(source(f), "  async lancerScan(force) {");
    // `lancerScan` garde un setInterval d'UNE SECONDE qui ne cède rien : il ne fait
    // que rafraîchir le chrono affiché (`scanTic`). Bridé dans un onglet caché, il
    // rafraîchit moins souvent un chiffre que personne ne regarde — la durée elle-même
    // se recalcule depuis Date.now() à chaque rendu. Une minuterie de CESSION, elle,
    // n'aurait aucune raison de s'appeler ainsi : le test la verrait passer.
    const lignes = corps.split("\n").filter((l) => /setInterval/.test(l));
    assert.equal(lignes.length, 1,
      "lancerScan ne doit garder qu'une minuterie, celle du chrono affiché");
    const suite = corps.slice(corps.indexOf(lignes[0]));
    assert.match(suite.slice(0, 400), /scanTic/,
      "la minuterie restante doit être celle du chrono, pas une cession déguisée");
  });

  test(f + " : les deux cessions passent par cederLeFil", () => {
    const corps = methode(source(f), "  async lancerScan(force) {");
    // une par instrument, une par variante dans le repli séquentiel
    const n = (corps.match(/await this\.cederLeFil\(\)/g) || []).length;
    assert.equal(n, 2, "attendu deux cessions (boucle par instrument + repli séquentiel), vu " + n);
    // le repli séquentiel compte autant que l'autre : c'est le seul cas où le scan
    // s'arrête pour de bon quand l'onglet passe derrière
    const repli = corps.slice(corps.indexOf("repli séquentiel"));
    assert.match(repli, /await this\.cederLeFil\(\)/,
      "le repli séquentiel ne cède plus la main par cederLeFil");
  });

  test(f + " : cederLeFil n'emploie MessageChannel, la minuterie n'étant qu'un repli", () => {
    const corps = methode(source(f), "  cederLeFil() {");
    assert.match(corps, /new MessageChannel\(\)/);
    assert.match(corps, /port2\.onmessage/);
    assert.match(corps, /port1\.postMessage/);
    // la seule minuterie tolérée est celle du navigateur sans MessageChannel
    const lignesTimer = corps.split("\n").filter((l) => /setTimeout/.test(l));
    assert.equal(lignesTimer.length, 1, "cederLeFil ne doit garder qu'un seul repli par minuterie");
    assert.match(lignesTimer[0], /typeof MessageChannel === 'undefined'/,
      "le repli par minuterie doit être gardé par l'absence de MessageChannel");
  });
}

test("les deux fichiers livrés portent la même cession", () => {
  const [a, b] = FICHIERS.map((f) => methode(source(f), "  cederLeFil() {"));
  assert.equal(a, b, "Vena.solo.html n'a pas été régénéré depuis Vena.dc.html");
});

/**
 * La fonction, extraite du fichier livré et rendue exécutable ici.
 *
 * Le canal doit être REFERMÉ à la fin de chaque cas : dans node, un MessagePort
 * ouvert tient la boucle d'événements et `node --test` ne rendrait jamais la main.
 * Dans un navigateur la question ne se pose pas — l'onglet vit de toute façon.
 */
function fabriquer() {
  const corps = methode(source("Vena.dc.html"), "  cederLeFil() {");
  // eslint-disable-next-line no-new-func
  const f = new Function("return function cederLeFil() " + corps + ";")();
  return {
    cederLeFil: f,
    fermer() {
      const c = this._canalCession;
      if (!c) return;
      try { c.port1.close(); c.port2.close(); } catch (e) { /* déjà fermé */ }
      this._canalCession = null;
    },
  };
}

test("cederLeFil rend la main APRÈS la suite synchrone", async () => {
  const o = fabriquer();
  const ordre = [];
  const p = o.cederLeFil().then(() => ordre.push("après la cession"));
  ordre.push("suite synchrone");
  await p;
  o.fermer();
  assert.deepEqual(ordre, ["suite synchrone", "après la cession"],
    "la cession doit être asynchrone : elle ne doit pas résoudre avant de rendre la main");
});

test("cederLeFil réutilise un seul canal et respecte l'ordre", async () => {
  const o = fabriquer();
  const vus = [];
  const ps = [];
  for (let i = 0; i < 200; i++) ps.push(o.cederLeFil().then(() => vus.push(i)));
  const canal = o._canalCession;
  await Promise.all(ps);
  assert.ok(canal, "le canal doit être conservé d'une cession à l'autre");
  assert.equal(o._canalCession, canal, "un canal par cession fuirait deux ports par tour");
  assert.deepEqual(vus, [...Array(200).keys()], "les cessions doivent être rendues dans l'ordre");
  assert.equal(o._cessions.length, 0, "la file doit se vider");
  o.fermer();
});

test("cederLeFil ne fait pas tourner le fil à vide : 5 000 cessions passent vite", async () => {
  const o = fabriquer();
  const t0 = Date.now();
  for (let i = 0; i < 5000; i++) await o.cederLeFil();
  const ms = Date.now() - t0;
  o.fermer();
  // une minuterie bridée mettrait au bas mot 5 000 s ; même non bridée, le plancher
  // des 4 ms de setTimeout imbriqué en mettrait 20. Le canal reste sous la seconde.
  assert.ok(ms < 3000, "5 000 cessions ont pris " + ms + " ms — ce n'est pas un canal");
});
