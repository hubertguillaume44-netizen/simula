// ————— LE STOCKAGE PLEIN, ET CE QU'IL A COÛTÉ —————
//
// Chez un utilisateur : 51 clés, 5 240 652 octets pour un quota de 5 MiB. La migration
// « simula. » → « vena. » COPIAIT sans supprimer — prudent en intention, mais copier
// exige deux fois la place. Les cinq plus grosses clés sont restées dehors, dont le scan
// de travail de 3,2 Mo. Le compteur d'échecs était bien incrémenté ; personne ne le
// lisait. L'utilisateur a vu ses données disparaître sans un mot.
//
// Ces tests font tourner le VRAI code, extrait du fichier et évalué sur un stockage
// simulé : un test qui relirait la source ne dirait rien de ce qui se passe à 4,9 Mo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

/** Un localStorage de navigateur, avec son quota — refus compris. */
function stockage(quotaOctets = 5 * 1024 * 1024) {
  const m = new Map();
  // le navigateur compte en UTF-16 : deux octets par caractère, clé comprise
  const poids = () => [...m].reduce((a, [k, v]) => a + (k.length + v.length) * 2, 0);
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(String(k)) ? m.get(String(k)) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      const avant = m.has(k) ? (k.length + m.get(k).length) * 2 : 0;
      if (poids() - avant + (k.length + v.length) * 2 > quotaOctets) {
        const e = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        throw e;
      }
      m.set(k, v);
    },
    removeItem(k) { m.delete(String(k)); },
    clear() { m.clear(); },
    _poids: poids,
    _cles: () => [...m.keys()],
  };
}

/** Le bloc réel — migration, repli, façade — évalué sur ce stockage-là. */
function charger(ls) {
  const debut = SOURCE.indexOf("const PREFIXE = 'vena.';");
  const fin = SOURCE.indexOf("// LA BASE IndexedDB porte elle aussi l'ancien nom.");
  assert.ok(debut > 0 && fin > debut, "le bloc de migration ne se délimite plus");
  const bloc = SOURCE.slice(debut, fin);
  const ctx = { localStorage: ls, console, Date, JSON, Map, Error, String, Number, Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // le bloc masque `localStorage` par une façade ; on rend les deux lisibles au test
  vm.runInContext(bloc + "\n;({ migrerStockage, cleVersAncien, facade: localStorage, "
    + "poserSignalQuota, noterQuota });", ctx);
  return vm.runInContext("({ migrerStockage, cleVersAncien, facade: localStorage, "
    + "poserSignalQuota, noterQuota })", ctx);
}

const gros = (n) => "x".repeat(n);

test("à 4,9 Mo la migration ne perd aucune clé, et l’échec remonte", () => {
  const ls = stockage();
  // le cas réel, à l'échelle : le scan de travail, puis des petites
  ls.setItem("simula.scan.v1.client.fxpro", gros(2_100_000));
  ls.setItem("simula.baremes.v1.client.fxpro", gros(450_000));
  ls.setItem("simula.noms.v1", gros(500));
  ls.setItem("simula.session.v1.client.fxpro", gros(300));
  const avant = ls._poids();
  assert.ok(avant > 4 * 1024 * 1024, "le stockage de départ n’est pas assez rempli");
  const valeurs = new Map(ls._cles().map((k) => [k, ls.getItem(k)]));

  const { migrerStockage, facade } = charger(ls);
  const r = migrerStockage();

  // AUCUNE VALEUR PERDUE : chaque clé de départ est encore lisible, sous l’un des deux noms
  for (const [k, v] of valeurs) {
    const neuve = "vena." + k.slice("simula.".length);
    const lue = ls.getItem(neuve) ?? ls.getItem(k);
    assert.equal(lue, v, `valeur perdue pour ${k}`);
    // et le repli la rend sous le nom NEUF, celui que l’application demande
    assert.equal(facade.getItem(neuve), v, `le repli ne rend pas ${neuve}`);
  }
  // l’échec est remonté, chiffré, jamais avalé
  if (r.restant) {
    assert.ok(r.echec, "des clés restent et aucun échec n’est remonté");
    assert.ok(r.restantOctets > 0, "le poids restant n’est pas dit");
    const trace = JSON.parse(ls.getItem("vena.migration.nom.v1"));
    assert.equal(trace.fini, false, "une migration partielle se déclare terminée");
    assert.equal(trace.restant, r.restant);
  }
});

test("la migration DÉPLACE : l’ancienne disparaît, la neuve porte la même valeur", () => {
  const ls = stockage();
  ls.setItem("simula.series.v1.client.fxpro", '["EURUSD","XAUUSD"]');
  ls.setItem("simula.noms.v1", '{"EURUSD":"Euro"}');
  const { migrerStockage } = charger(ls);
  const r = migrerStockage();

  assert.equal(r.restant, 0, "rien ne devait rester : la place ne manque pas");
  assert.equal(ls.getItem("simula.series.v1.client.fxpro"), null, "l’ancienne survit");
  assert.equal(ls.getItem("vena.series.v1.client.fxpro"), '["EURUSD","XAUUSD"]');
  assert.equal(ls.getItem("simula.noms.v1"), null);
  assert.equal(ls.getItem("vena.noms.v1"), '{"EURUSD":"Euro"}');
  assert.equal(JSON.parse(ls.getItem("vena.migration.nom.v1")).fini, true);
});

test("la plus grosse est tentée d’abord, et son échec arrête la boucle", () => {
  // il y a la place pour déplacer la petite, jamais pour la grosse : déplacer demande
  // que les deux exemplaires coexistent le temps de la relecture
  const ls = stockage(300_000);
  ls.setItem("simula.scan.v1.client.fxpro", gros(120_000));
  ls.setItem("simula.noms.v1", gros(400));
  const { migrerStockage } = charger(ls);
  const r = migrerStockage();

  assert.equal(r.echec && r.echec.cle, "simula.scan.v1.client.fxpro",
    "ce n’est pas la plus grosse qui a été tentée en premier");
  // ON N’INSISTE PAS : la petite n’est pas déplacée derrière l’échec. C’est voulu —
  // écrire par-dessus le peu qui reste brouillerait le diagnostic, et la petite reste
  // lisible par le repli. « Autant que ce soit la petite qui reste dehors. »
  assert.equal(ls.getItem("vena.noms.v1"), null, "la boucle a continué après l’échec");
  // et surtout : rien n’est perdu
  assert.equal(ls.getItem("simula.scan.v1.client.fxpro"), gros(120_000));
  assert.equal(ls.getItem("simula.noms.v1"), gros(400));
  assert.equal(ls.getItem("vena.scan.v1.client.fxpro"), null,
    "un fragment d’écriture refusée est resté derrière");
});

test("la grosse passe quand la place y est, et l’ancienne s’efface", () => {
  const ls = stockage(600_000);
  ls.setItem("simula.scan.v1.client.fxpro", gros(120_000));
  ls.setItem("simula.noms.v1", gros(400));
  const { migrerStockage } = charger(ls);
  const r = migrerStockage();
  assert.equal(r.restant, 0);
  assert.equal(ls.getItem("vena.scan.v1.client.fxpro"), gros(120_000));
  assert.equal(ls.getItem("simula.scan.v1.client.fxpro"), null);
  // le déplacement a RENDU la place : l’occupation n’a pas doublé
  assert.ok(ls._poids() < 300_000, "le stockage occupe le double : on copie encore");
});

test("le repli : l’ancienne ne sert que si la neuve est ABSENTE", () => {
  const ls = stockage();
  const { facade } = charger(ls);
  ls.setItem("simula.series.v1.client.fxpro", '["EURUSD"]');
  assert.equal(facade.getItem("vena.series.v1.client.fxpro"), '["EURUSD"]',
    "le repli ne rend pas l’ancienne valeur");

  // LA CLÉ NEUVE FAIT FOI, MÊME VIDE : un « [] » écrit par l’application est une
  // réponse, pas une absence — c’est exactement le cas des séries chez l’utilisateur
  ls.setItem("vena.series.v1.client.fxpro", "[]");
  assert.equal(facade.getItem("vena.series.v1.client.fxpro"), "[]",
    "la neuve est vide et le repli l’écrase : la règle est inversée");

  // une clé qui n’a pas de jumelle ancienne rend bien null
  assert.equal(facade.getItem("vena.inconnue.v1"), null);
});

test("une écriture refusée est signalée, même si l’appelant l’avale", () => {
  const ls = stockage(50_000);
  const { facade, poserSignalQuota } = charger(ls);
  const vus = [];
  poserSignalQuota((q) => vus.push(q));
  // le geste ordinaire : un `catch {}` qui étouffe, comme les cinquante et un du fichier
  try { facade.setItem("vena.scan.v1.client.fxpro", gros(60_000)); } catch (e) { /* avalé */ }
  assert.equal(vus.length, 1, "le refus n’a pas été signalé");
  assert.ok(vus[0].octets > 60_000, "le poids refusé n’est pas dit");
  assert.match(vus[0].cle, /^vena\.scan/);
});

test("un refus survenu avant l’écran n’est pas perdu", () => {
  const ls = stockage(50_000);
  const { facade, poserSignalQuota } = charger(ls);
  try { facade.setItem("vena.baremes.v1.client.fxpro", gros(60_000)); } catch (e) {}
  const vus = [];
  poserSignalQuota((q) => vus.push(q));   // l’écran arrive APRÈS le refus
  assert.equal(vus.length, 1, "le refus d’avant le montage est perdu");
});

test("la façade ne supprime jamais la jumelle ancienne", () => {
  const ls = stockage();
  const { facade } = charger(ls);
  ls.setItem("simula.scan.v1.client.fxpro", "le seul exemplaire");
  ls.setItem("vena.scan.v1.client.fxpro", "la copie");
  facade.removeItem("vena.scan.v1.client.fxpro");
  assert.equal(ls.getItem("simula.scan.v1.client.fxpro"), "le seul exemplaire",
    "un geste d’entretien a détruit une donnée non déplacée");
});

// ————— L'APPLICATION NE DOIT PAS REFUSER SON PROPRE FICHIER —————
//
// La page d'import est couverte de zones en `accept=".csv"`, dont une qui prend TOUT le
// document. Quelqu'un qui venait de cliquer « Exporter mes données » et qui lâchait le
// fichier obtenu s'entendait répondre que ce n'était pas un CSV — et le bouton
// « Réimporter » est ailleurs, dans un tiroir. C'est ce refus qui a fait croire qu'il
// fallait du CSV, et qui a laissé l'utilisateur sans issue de secours.

function chargerReconnaissance() {
  const debut = SOURCE.indexOf("const EXT_SAUVEGARDE =");
  const fin = SOURCE.indexOf("// ————— LE REPLI DE LECTURE —————");
  assert.ok(debut > 0 && fin > debut, "le bloc de reconnaissance ne se délimite plus");
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(SOURCE.slice(debut, fin), ctx);
  return vm.runInContext("({ nomDeSauvegarde, texteDeSauvegarde })", ctx);
}

test("une sauvegarde Véna est reconnue par son nom, dans les trois extensions", () => {
  const { nomDeSauvegarde } = chargerReconnaissance();
  for (const n of ["vena-2026-09-10.json", "sauvegarde.vena", "vieux-dump.sivula",
                   "VENA-2024.JSON"]) {
    assert.ok(nomDeSauvegarde(n), `refusée : ${n}`);
  }
  // et un CSV de bougies reste un CSV
  for (const n of ["EURUSD_H1.csv", "releve-fxpro.csv", "XAUUSD.CSV"]) {
    assert.ok(!nomDeSauvegarde(n), `pris pour une sauvegarde : ${n}`);
  }
});

test("une sauvegarde renommée est reconnue à son enveloppe", () => {
  const { texteDeSauvegarde } = chargerReconnaissance();
  assert.ok(texteDeSauvegarde('{"outil":"vena","version":78,"donnees":{'));
  // les anciennes aussi, sans date limite : quelqu’un réimportera dans deux ans
  assert.ok(texteDeSauvegarde('{ "outil": "simula", "donnees": {'));
  // un CSV de bougies n’est pas une enveloppe
  assert.ok(!texteDeSauvegarde("Date,Open,High,Low,Close\n2020-01-01,1.12,1.13,1.11,1.12"));
  assert.ok(!texteDeSauvegarde('{"outil":"autre chose"}'));
});

test("le tri du dépôt route la sauvegarde AVANT de juger l’extension", () => {
  // la reconnaissance doit précéder le classement des CSV dans accepterTout
  const i = SOURCE.indexOf("async accepterTout(liste) {");
  assert.ok(i > 0, "accepterTout est introuvable");
  const corps = SOURCE.slice(i, i + 2600);
  const routage = corps.indexOf("nomDeSauvegarde");
  const classement = corps.indexOf("classerDepot");
  assert.ok(routage > 0, "le dépôt ne reconnaît pas une sauvegarde");
  assert.ok(classement > 0, "le classement des CSV a disparu");
  assert.ok(routage < classement, "l’extension est jugée avant la reconnaissance");
  assert.match(corps, /examinerImport\(sauvegardes\[0\]\)/,
    "la sauvegarde ne part pas dans le circuit d’import");
});
