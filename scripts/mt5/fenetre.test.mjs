/**
 * LA FENÊTRE DE MESURE, côté moteur.
 *
 * Trois pièges, et un seul les rend visibles à l'œil nu : aucun. D'où ces tests.
 *
 *   1. L'amorce se DÉCALE, elle ne se tronque pas. Une fenêtre qui commence tard doit
 *      lire les 400 jours qui la précèdent pour que moyennes, pentes et zones soient
 *      justes dès sa première bougie. Si la série est tronquée à la place, les premières
 *      semaines de la fenêtre sont fausses — et rien ne le dit.
 *   2. Ce qui se recalcule sur la fenêtre : le R/an, les cinq époques, la coupure hors
 *      échantillon. Un R/an calculé sur 6,6 ans alors que la mesure porte sur un an
 *      serait faux d'un facteur six.
 *   3. La partie écartée se mesure avec la MÊME configuration : c'est le seul chiffre
 *      qui dise si la fenêtre a été choisie ou trouvée.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig } from "./config.mjs";
import { mesuresSup } from "../../scan-noyau.js";

const M = await chargerMoteur();
const AN = 365.25 * 86400000;

/** Série H1 déterministe de six ans, jours ouvrés. */
function serie(nJours = 2200, depart = Date.UTC(2019, 0, 1)) {
  let a = 987654321;
  const rnd = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [];
  let px = 100;
  let ms = depart;
  for (let j = 0; j < nJours; j++, ms += 86400000) {
    const jour = new Date(ms).getUTCDay();
    if (jour === 0 || jour === 6) continue;
    for (let k = 0; k < 24; k++) {
      const ouv = px;
      const clo = Math.max(1, ouv * (1 + (rnd() - 0.5) * 0.008 + 0.00002));
      t.push(ms + k * 3600000);
      o.push(ouv);
      h.push(Math.max(ouv, clo) * (1 + rnd() * 0.002));
      l.push(Math.min(ouv, clo) * (1 - rnd() * 0.002));
      c.push(clo);
      v.push(100);
      sp.push(k === 0 ? 60 : 20);
      px = clo;
    }
  }
  return M.nettoyer({ t, o, h, l, c, v, sp, n: t.length });
}

const DF = serie();
const BASE = { entree: "croisement_ou_rebond", ligne: "mediane", periode: 15, sl: 0.5, rr: 2, paliers: [] };
const cfg = (debut, fin) => {
  const c = construireConfig({ ...BASE, debut });
  if (fin) c.fin = fin;
  return c;
};
const DEBUT_FENETRE = Date.UTC(2023, 0, 1);

test("l'amorce se décale : sans les 400 jours qui précèdent, la fenêtre est fausse", () => {
  // La configuration qui rend l'amorce visible : un filtre de tendance sur la MM200
  // DAILY. C'est pour lui que l'amorce vaut 400 jours et pas quinze bougies — une
  // moyenne à 200 jours ne se calcule pas à partir de rien.
  const avecFiltre = { ...BASE, filtres: [{ type: "tendance_mtf", ut: "D1", ligne: "ma", periode: 200, sens: "au_dessus" }] };
  const c = (debut) => construireConfig({ ...avecFiltre, debut });
  const avecAmorce = M.backtesterSuivi(DF, c(DEBUT_FENETRE), "H1");
  const i0 = DF.t.findIndex((x) => x >= DEBUT_FENETRE);
  const coupe = (df, a) => M.nettoyer({
    t: df.t.slice(a), o: df.o.slice(a), h: df.h.slice(a), l: df.l.slice(a),
    c: df.c.slice(a), v: df.v.slice(a), sp: df.sp ? df.sp.slice(a) : undefined,
    n: df.n - a,
  });
  const sansAmorce = M.backtesterSuivi(coupe(DF, i0), c(DEBUT_FENETRE), "H1");
  assert.ok(avecAmorce.length > 20, "la fenêtre de référence ne prend aucun trade");
  // L'écart est la démonstration. Mesuré sur cette série : 350 trades et + 1,00 R avec
  // l'amorce, 202 trades et − 7,00 R sans elle. Rien à l'écran ne distinguerait les deux
  // — c'est exactement le résultat « silencieusement invalide » que le refus d'amorce
  // empêche côté application.
  const R = (x) => (x.R_net !== undefined ? x.R_net : x.R);
  const somme = (l) => l.reduce((a, x) => a + R(x), 0);
  assert.notEqual(avecAmorce.length, sansAmorce.length,
    "tronquer la série au début de la fenêtre ne change pas le nombre de trades : la MM200 Daily se calculerait donc sans données, ce qui est impossible");
  assert.ok(Math.abs(somme(avecAmorce) - somme(sansAmorce)) > 0.5,
    `le R total ne bouge pas (${somme(avecAmorce).toFixed(2)} contre ${somme(sansAmorce).toFixed(2)}) : l'amorce ne servirait à rien`);
});

test("la borne de début décale les entrées sans toucher au reste", () => {
  const tout = M.backtesterSuivi(DF, cfg(Date.UTC(2019, 0, 1)), "H1");
  const fenetre = M.backtesterSuivi(DF, cfg(DEBUT_FENETRE), "H1");
  assert.ok(fenetre.length < tout.length, "la fenêtre ne réduit pas le nombre de trades");
  for (const tr of fenetre) {
    assert.ok(tr.entree_t >= DEBUT_FENETRE, "un trade entre avant le début de la fenêtre");
  }
  // Les trades communs sont IDENTIQUES : la fenêtre déplace la borne, elle ne remesure pas.
  const parT = new Map(tout.map((x) => [x.entree_t, x]));
  let compares = 0;
  for (const tr of fenetre) {
    const ref = parT.get(tr.entree_t);
    if (!ref) continue;
    compares++;
    assert.equal(tr.sortie_t, ref.sortie_t, "même entrée, autre sortie");
    assert.ok(Math.abs((tr.R_net ?? tr.R) - (ref.R_net ?? ref.R)) < 1e-9, "même entrée, autre R");
  }
  assert.ok(compares > 10, `trop peu de trades comparables (${compares})`);
});

test("la borne de fin arrête les ENTRÉES, pas le suivi des positions ouvertes", () => {
  const fin = Date.UTC(2023, 0, 1);
  const trades = M.backtesterSuivi(DF, cfg(Date.UTC(2021, 0, 1), fin), "H1");
  assert.ok(trades.length > 10, "aucun trade dans la fenêtre bornée");
  for (const tr of trades) assert.ok(tr.entree_t < fin, "une entrée après la borne de fin");
  const dernier = trades[trades.length - 1];
  assert.ok(dernier.sortie_t >= dernier.entree_t, "sortie avant l'entrée");
});

test("le R/an, les cinq époques et le hors échantillon suivent la fenêtre", () => {
  const tout = M.backtesterSuivi(DF, cfg(Date.UTC(2019, 0, 1)), "H1");
  const fenetre = M.backtesterSuivi(DF, cfg(DEBUT_FENETRE), "H1");
  const rTout = M.resume(tout), rFen = M.resume(fenetre);
  // les années viennent de l'écart entre le premier et le dernier trade MESURÉ
  assert.ok(rFen.annees < rTout.annees * 0.75,
    `les années de la fenêtre (${rFen.annees.toFixed(2)}) ne sont pas plus courtes que celles de l'historique (${rTout.annees.toFixed(2)})`);
  const attendu = (DF.t[DF.n - 1] - DEBUT_FENETRE) / AN;
  assert.ok(rFen.annees <= attendu + 0.05,
    `le R/an de la fenêtre porte sur ${rFen.annees.toFixed(2)} ans alors que la fenêtre en fait ${attendu.toFixed(2)}`);
  // cinq époques = cinq parts égales des trades de la FENÊTRE
  const seg = M.segments(fenetre, 5);
  assert.equal(seg.detail.length, 5);
  assert.equal(seg.total, seg.detail.filter((x) => x !== null).length);
  // coupure hors échantillon = 70 % des trades de la fenêtre
  const sup = mesuresSup(fenetre, rFen);
  assert.equal(sup.coupe, Math.max(1, Math.floor(fenetre.length * 0.7)));
  assert.equal(sup.oosN, fenetre.length - sup.coupe);
});

test("la partie écartée se mesure avec la même configuration", () => {
  const fenetre = M.backtesterSuivi(DF, cfg(DEBUT_FENETRE), "H1");
  const avant = M.backtesterSuivi(DF, cfg(Date.UTC(2019, 0, 1), DEBUT_FENETRE), "H1");
  assert.ok(avant.length > 10, "la partie écartée ne prend aucun trade");
  // Les deux ensembles sont disjoints dans le temps : aucun trade compté deux fois.
  const finFenetre = new Set(fenetre.map((x) => x.entree_t));
  for (const tr of avant) assert.ok(!finFenetre.has(tr.entree_t), "un trade appartient aux deux côtés");
  // Et leur réunion redonne la mesure sur tout l'historique, au trade près.
  const tout = M.backtesterSuivi(DF, cfg(Date.UTC(2019, 0, 1)), "H1");
  assert.ok(Math.abs(avant.length + fenetre.length - tout.length) <= 1,
    `réunion ${avant.length} + ${fenetre.length} ≠ ${tout.length} : la découpe perd ou double des trades`);
});
