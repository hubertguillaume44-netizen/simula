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
import { genererMQ5 } from "../../robot-mt5.js";

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
