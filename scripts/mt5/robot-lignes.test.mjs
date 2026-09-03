/**
 * Le robot exporté doit calculer LES MÊMES lignes que le moteur.
 *
 * Ce fichier existe à cause d'un écart réel, trouvé dans le journal MT5 du
 * 3 septembre 2026 (AUDCAD, `mediane 15`, année 2020, 260 jours diagnostiqués) :
 *
 *   clôtures journalières  260/260 exactes    (écart max 0,00 pt)
 *   plus hauts / plus bas  260/260 exacts     (écart max 0,00 pt)
 *   filtre de pente        8/8 exacts         (écart max 0,00 pt)
 *   ligne de référence     0/245 exactes      (écart max 2 070 pts)
 *
 * L'agrégation et les filtres étaient donc justes ; SEULE la ligne divergeait.
 * `LigneAgr(M_MEDIANE)` triait les clôtures et prenait la valeur du milieu — la
 * médiane statistique — alors que `medianeBrut()` du moteur rend le point milieu du
 * canal, (plus haut + plus bas) / 2 sur la période (Tenkan). Deux indicateurs
 * différents portant le même nom. Conséquence sur AUDCAD 2020 : 7 croisements sur 15
 * décalés d'un jour, 15 croisements par ailleurs identiques mais pas les mêmes.
 *
 * Ces tests comparent l'arithmétique du MQL5 généré à celle du moteur sur une série
 * connue. Ils n'exécutent pas MQL5 : ils rejouent en JavaScript la formule qui se
 * trouve dans le fichier généré, et vérifient qu'elle est bien celle qu'on croit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur } from "./charger-moteur.mjs";
import { genererMQ5, SPREAD_FENETRE as SPREAD_FENETRE_ROBOT } from "../../robot-mt5.js";
import { REFERENCES } from "./references.mjs";
import { construireConfig } from "./config.mjs";
import { etatDepuisReference, genererRobot } from "./etat-depuis-reference.mjs";

const M = await chargerMoteur();

const CFG = { sym: "AUDCAD", sens: "achat", entree: "croisement_prix", ligne: "mediane", periode: 15, sl: 0.5, rr: 2, ut: "D1" };
const CTX = { etat: {}, stamp: "260101_0000", magic: 1, paliers: [] };

/** Série journalière déterministe, hauts et bas décorrélés des clôtures. */
function serieD1(n = 200) {
  let a = 987654321;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const t = [], o = [], h = [], l = [], c = [];
  let px = 0.9;
  for (let i = 0; i < n; i++) {
    const ouv = px;
    px *= 1 + (rnd() - 0.5) * 0.02;
    // amplitude volontairement large : si la ligne ne lisait que les clôtures,
    // les hauts et les bas ne changeraient rien et le test ne prouverait rien.
    const amp = px * (0.005 + rnd() * 0.02);
    t.push(Date.UTC(2021, 0, 1) + i * 86400000);
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) + amp); l.push(Math.min(ouv, px) - amp);
  }
  return { n, t, o, h, l, c };
}

const D1 = serieD1();

test("la médiane du robot est le point milieu du canal, pas la médiane des clôtures", () => {
  const src = genererMQ5(CFG, CTX);
  const bloc = src.slice(src.indexOf("if(mode == M_MEDIANE)"), src.indexOf("if(mode == M_SMA)"));
  assert.ok(bloc.includes("g_h[fin - i]") && bloc.includes("g_l[fin - i]"),
    "le bloc M_MEDIANE ne lit pas les plus hauts / plus bas du tampon agrégé");
  assert.ok(!bloc.includes("ArraySort"),
    "le bloc M_MEDIANE trie encore les clôtures : c'est la médiane statistique, pas la ligne du moteur");
  assert.ok(!/g_c\[/.test(bloc), "le bloc M_MEDIANE lit encore les clôtures");
});

test("la formule du robot rend, chiffre pour chiffre, la ligne du moteur", () => {
  // port JS de la boucle MQL5 telle qu'elle est écrite dans le fichier généré
  const ligneAgr = (fin, per) => {
    let hi = -Number.MAX_VALUE, lo = Number.MAX_VALUE;
    for (let i = 0; i < per; i++) {
      if (D1.h[fin - i] > hi) hi = D1.h[fin - i];
      if (D1.l[fin - i] < lo) lo = D1.l[fin - i];
    }
    return (hi + lo) / 2;
  };
  for (const per of [5, 6, 10, 15, 26]) {
    const attendu = M.mediane(D1, per);
    for (let i = per - 1; i < D1.n; i++) {
      assert.ok(Math.abs(ligneAgr(i, per) - attendu[i]) < 1e-12,
        `période ${per}, bougie ${i} : robot ${ligneAgr(i, per)} vs moteur ${attendu[i]}`);
    }
  }
});

test("la médiane statistique des clôtures — l'ancienne formule — n'est PAS la ligne du moteur", () => {
  // garde-fou : sans cette contre-épreuve, le test précédent passerait aussi
  // si les deux définitions coïncidaient sur le gabarit, et ne prouverait rien.
  const tri = (fin, per) => {
    const v = D1.c.slice(fin - per + 1, fin + 1).slice().sort((x, y) => x - y);
    return per % 2 ? v[(per / 2) | 0] : (v[per / 2 - 1] + v[per / 2]) / 2;
  };
  const attendu = M.mediane(D1, 15);
  let differents = 0;
  for (let i = 14; i < D1.n; i++) if (Math.abs(tri(i, 15) - attendu[i]) > 1e-9) differents++;
  assert.ok(differents > D1.n * 0.9,
    `les deux définitions coïncident sur ${D1.n - differents} bougies : le gabarit ne sépare pas les deux formules`);
});

test("tenkan et kijun sont la même ligne que mediane, pas un repli sur l'EMA", () => {
  // moteur.js : ligne() regroupe mediane / tenkan / kijun sur medianeBrut().
  // Le générateur les ignorait et retombait sur M_EMA — une autre ligne, en silence.
  for (const nom of ["mediane", "tenkan", "kijun"]) {
    const src = genererMQ5({ ...CFG, ligne: nom }, CTX);
    assert.ok(src.includes("#define M_SIGNAL        M_MEDIANE"),
      `ligne « ${nom} » : le robot n'utilise pas M_MEDIANE`);
  }
  assert.ok(genererMQ5({ ...CFG, ligne: "ma" }, CTX).includes("#define M_SIGNAL        M_SMA"));
  assert.ok(genererMQ5({ ...CFG, ligne: "ema" }, CTX).includes("#define M_SIGNAL        M_EMA"));
});

test("le filtre de pente et la tendance MTF passent par la même correction", () => {
  const pente = genererMQ5(CFG, {
    ...CTX,
    etat: { fPente: true, utPente: "D1", lignePente: "mediane", periodeMtf: 5, fPenteRecul: 15 },
  });
  assert.ok(/LigneAgr\(86400, M_MEDIANE, 5, 1\)/.test(pente),
    "le filtre de pente n'appelle pas M_MEDIANE alors que sa ligne est « mediane »");
  const mtf = genererMQ5(CFG, {
    ...CTX,
    etat: { fMtf: true, utMtf: "D1", ligneMtf: "mediane", periodeMtf: 5 },
  });
  assert.ok(mtf.includes("M_MEDIANE"), "la tendance MTF n'utilise pas M_MEDIANE");
});

test("les huit références se régénèrent avec les filtres qu'elles déclarent", () => {
  // Le drapeau du filtre de tendance supérieure est `btMtf` ; l'écrire `fMtf` le fait
  // ignorer EN SILENCE. Régénéré ainsi, le robot GOLD partait sans son filtre et MT5
  // mesurait 629 trades contre 510 au moteur. Rien dans le fichier ne le signalait,
  // sinon la ligne « Filtres générés : aucun » de l'en-tête — que ce test lit.
  for (const ref of REFERENCES) {
    const { source } = genererRobot(ref, "260101_0000");
    const obtenu = source.match(/Filtres générés : (.*)/)[1].trim();
    assert.equal(obtenu, ref.filtresAttendus,
      `${ref.sym} ${ref.variante ?? ""} : en-tête « ${obtenu} »`);
  }
});

test("un filtre non transposable est refusé au lieu d'être omis", () => {
  assert.throws(() => etatDepuisReference({ filtres: [{ type: "pivot", ut: "D1" }] }),
    /non transposé/);
});

test("le robot et le moteur partagent la même fenêtre de médiane du spread", () => {
  // Deux fenêtres différentes donnent deux médianes, donc deux plafonds, donc deux
  // bougies d'entrée. Le générateur ne peut pas importer moteur.js (il est autonome
  // et chargé seul par l'application) : l'égalité se vérifie ici.
  assert.equal(SPREAD_FENETRE_ROBOT, M.SPREAD_FENETRE);
});

test("le plafond de spread est écrit dans le robot, et le seuil est bien un multiple", () => {
  const src = genererMQ5(CFG, { ...CTX, spreadFacteur: 1.5 });
  assert.match(src, /input double InpSpreadFacteur\s+= 1\.50;/);
  assert.match(src, /Plafond spread {2}: 1\.50 × médiane des 6000 dernières H1/);
  // le seuil doit multiplier la médiane : l'oublier rendait le plafond quatre fois
  // trop serré et faisait tomber AUDCAD de 46 à 28 trades
  assert.match(src, /g_seuilSpread = v\[m \/ 2\] \* InpSpreadFacteur;/);
  assert.match(src, /CopySpread\(_Symbol, PERIOD_H1, 1, SPREAD_FENETRE, sp\)/);
  // sans facteur, aucun plafond
  const sans = genererMQ5(CFG, { ...CTX, spreadFacteur: 0 });
  assert.match(sans, /input double InpSpreadFacteur\s+= 0\.00;/);
  assert.match(sans, /Plafond spread {2}: aucun/);
});

test("seuilSpread rend bien un multiple de la médiane, rafraîchi une fois par jour", () => {
  // série H1 dont le spread vaut 1 partout SAUF à 00:00 où il vaut 10 : le pic du
  // rollover, en caricature. Un plafond à 1,5× doit refuser 00:00 et accepter le reste.
  const n = 24 * 400;
  const t = [], c = [], sp = [];
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    c.push(100);
    sp.push(new Date(t[i]).getUTCHours() === 0 ? 100 : 10);
  }
  const df = { n, t, o: c.slice(), h: c.slice(), l: c.slice(), c, sp, grain: { decimales: 4 } };
  const seuil = M.seuilSpread(df, 1.5);
  assert.ok(seuil, "aucun seuil calculé");
  const pct = M.spreadEnPct(df);
  const i = n - 5, minuit = n - new Date(df.t[n - 1]).getUTCHours() - 1;
  assert.ok(pct[i] <= seuil[i], "une bougie de séance est refusée par le plafond");
  assert.ok(pct[minuit] > seuil[minuit], "la bougie du rollover passe le plafond");
  // rafraîchi une fois par jour : constant à l'intérieur d'une journée
  const j0 = n - 24;
  for (let k = j0; k < j0 + 24; k++) assert.equal(seuil[k], seuil[j0]);
});

test("le plafond décale l'entrée sans supprimer le signal quand une bougie passe", () => {
  const n = 24 * 500;
  const t = [], o = [], h = [], l = [], c = [], sp = [];
  let px = 100, a = 4242;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.004;
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.001); l.push(Math.min(ouv, px) * 0.999);
    sp.push(new Date(t[i]).getUTCHours() === 0 ? 100 : 10);
  }
  const df = { n, t, o, h, l, c, sp, grain: { decimales: 4 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 0.5, rr: 2, paliers: [] });
  const sans = M.backtesterSuivi(df, cfg, "D1");
  const avec = M.backtesterSuivi(df, { ...cfg, spread_max_facteur: 1.5 }, "D1");
  assert.ok(sans.length > 20, "gabarit sans trades : test sans portée");
  assert.ok(sans.some((x) => new Date(x.entree_t).getUTCHours() === 0),
    "sans plafond, aucune entrée à 00:00 : le gabarit ne prouve rien");
  assert.equal(avec.filter((x) => new Date(x.entree_t).getUTCHours() === 0).length, 0,
    "avec plafond, une entrée tombe encore sur la bougie du rollover");
  // le signal est décalé, pas perdu : ici une bougie de séance existe chaque jour
  assert.equal(avec.length, sans.length, "le plafond a supprimé des trades au lieu de les décaler");
});

test("le plafond juge la bougie d'entrée, pas la précédente — des deux côtés", () => {
  // Le pic du rollover est DANS la bougie de 00:00 ; celle de 23:00 est normale.
  // Juger la bougie précédente rend le plafond aveugle au seul moment qu'il vise.
  const src = genererMQ5(CFG, { ...CTX, spreadFacteur: 1.5 });
  assert.match(src, /double barre = SpreadBarre\(0\);/,
    "le robot lit le spread d'une bougie précédente : le plafond ne verrait plus le pic");
  assert.match(src, /CopySpread\(_Symbol, PERIOD_H1, shift, 1, sp\)/);

  // et côté moteur : une série dont SEULE la bougie de 00:00 est chère
  const n = 24 * 400;
  const t = [], c = [], sp = [];
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    c.push(100);
    sp.push(new Date(t[i]).getUTCHours() === 0 ? 100 : 10);
  }
  const df = { n, t, o: c.slice(), h: c.slice(), l: c.slice(), c, sp, grain: { decimales: 4 } };
  const seuil = M.seuilSpread(df, 1.5), pct = M.spreadEnPct(df);
  const minuit = n - new Date(df.t[n - 1]).getUTCHours() - 1;
  assert.ok(pct[minuit] > seuil[minuit], "la bougie du rollover passerait le plafond");
  assert.ok(pct[minuit - 1] <= seuil[minuit - 1],
    "la bougie de 23:00 est chère elle aussi : le gabarit ne sépare pas les deux lectures");
});

test("le robot compare un spread de BOUGIE, pas celui du tick", () => {
  // Le spread d'un tick est plus haut et plus nerveux que MqlRates.spread. Le comparer
  // à un seuil calculé sur des spreads de bougie serrait le plafond côté robot sans
  // qu'aucun test ne le voie : 10 entrées communes sur 44 sur AUDCAD, 181 sur 491 sur
  // GOLD — moins bien que sans plafond du tout.
  const src = genererMQ5(CFG, { ...CTX, spreadFacteur: 1.5 });
  const bloc = src.slice(src.indexOf("double plafond = SeuilSpread();"),
    src.indexOf("if(InpPasDebutSemaine)"));
  assert.ok(!/spreadPct\s*>\s*plafond/.test(bloc),
    "le plafond est encore comparé au spread du tick (spreadPct)");
  assert.match(bloc, /barre > plafond/);
});

test("le robot ne tente l'entrée qu'une fois par bougie H1", () => {
  // Le moteur n'entre qu'à l'ouverture d'une bougie. En réessayant à chaque tick, le
  // robot entrait au milieu d'une bougie dès que le spread retombait : sur AUDCAD,
  // 14 des 44 entrées de MT5 ne tombaient sur aucun horodatage H1 du fichier, et sur
  // GOLD 234 sur 542 — alors même que les deux plafonds de spread étaient d'accord.
  const src = genererMQ5(CFG, { ...CTX, spreadFacteur: 1.5 });
  assert.match(src, /bool nouvelleH1 = \(bH1\[0\] != g_derniereH1\);/);
  const reprise = src.slice(src.indexOf("if(seau >= 0 && seau == seauEnAttente"),
    src.indexOf("g_derniereH1 = bH1[0];", src.indexOf("if(seau >= 0 && seau == seauEnAttente")));
  assert.match(reprise, /if\(!nouvelleH1\) return;/,
    "la reprise d'un signal en attente s'exécute encore en cours de bougie");
});

test("la plage exploitable exclut les mois sans spread, des deux côtés", () => {
  // Germany40 et BITCOIN n'ont aucun spread avant 2022 (la M1 du courtier ne remonte
  // pas si loin) ; BITCOIN en manque AUSSI sur ses deux derniers mois. Mesurer là
  // revenait à publier des années de vide comme un résultat.
  const n = 24 * 30 * 40;                       // ~40 mois
  const t = [], c = [], sp = [];
  for (let i = 0; i < n; i++) {
    const ms = Date.UTC(2021, 0, 1) + i * 3600000;
    const mois = new Date(ms).getUTCFullYear() * 12 + new Date(ms).getUTCMonth();
    const troue = mois < 2022 * 12 + 2 || mois >= 2023 * 12 + 6;   // avant mars 2022, après juin 2023
    t.push(ms); c.push(100); sp.push(troue ? 0 : 10);
  }
  const df = { n, t, o: c.slice(), h: c.slice(), l: c.slice(), c, sp, grain: { decimales: 4 } };
  const p = M.plageExploitable(df);
  assert.equal(p.complete, false);
  assert.equal(new Date(p.debut).toISOString().slice(0, 7), "2022-03");
  // `fin` est EXCLUSIVE : le premier instant du mois qui suit le dernier mois sain.
  // Juin 2023 est donc bien mesuré, juillet ne l'est pas.
  assert.equal(new Date(p.fin).toISOString().slice(0, 7), "2023-07");

  // série saine : plage entière, et le drapeau le dit
  const sain = { ...df, sp: sp.map(() => 10) };
  assert.equal(M.plageExploitable(sain).complete, true);
});

test("cfg.fin arrête les ENTRÉES sans tronquer les positions ouvertes", () => {
  const n = 24 * 400;
  const t = [], o = [], h = [], l = [], c = [], sp = [];
  let px = 100, a = 24680;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    t.push(Date.UTC(2021, 0, 1) + i * 3600000);
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.004;
    o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.001); l.push(Math.min(ouv, px) * 0.999);
    sp.push(10);
  }
  const df = { n, t, o, h, l, c, sp, grain: { decimales: 4 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 0.5, rr: 2, paliers: [] });
  const tout = M.backtesterSuivi(df, cfg, "D1");
  const coupe = Date.UTC(2021, 6, 1);
  const borne = M.backtesterSuivi(df, { ...cfg, fin: coupe }, "D1");
  assert.ok(tout.length > borne.length, "la borne n'a rien retiré : test sans portée");
  for (const tr of borne) assert.ok(tr.entree_t < coupe, "une entrée dépasse la borne");
  // les trades d'avant la borne sont identiques, position ouverte comprise
  const avant = tout.filter((x) => x.entree_t < coupe);
  assert.equal(borne.length, avant.length);
  for (let i = 0; i < borne.length; i++) {
    assert.equal(borne[i].entree_t, avant[i].entree_t);
    assert.equal(borne[i].sortie_t, avant[i].sortie_t, "une sortie a été tronquée par la borne");
  }
});
