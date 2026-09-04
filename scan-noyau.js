// Noyau de mesure du scan, partagé mot pour mot entre le fil principal et les workers.
// Une seule source de vérité : si les deux chemins divergeaient, un scan parallèle
// donnerait d'autres chiffres qu'un scan séquentiel sans que rien ne le signale.
import * as M from './moteur.js';

// Mesures que le résumé du moteur ne donne pas : espérance, R gagné par R de creux,
// tenue hors échantillon (70 % appris / 30 % contrôle), pire série de pertes, et le
// R par année civile qui permet de recouper les résultats par régime à l'affichage.
export function mesuresSup(trades, r) {
  const R = (t) => (t.R_net !== undefined ? t.R_net : t.R);
  const k = Math.max(1, Math.floor(trades.length * 0.7));
  const app = M.resume(trades.slice(0, k)), ctl = M.resume(trades.slice(k));
  // Pire série de pertes d'affilée. Une sortie au POINT MORT n'est pas une perte : le
  // moteur l'exclut déjà du taux de gagnants (seuil de 0,05 R), mais elle était comptée
  // ici comme un maillon de la série. Une configuration à paliers, qui sort souvent à
  // l'équilibre, affichait donc des séries de pertes qu'elle n'a jamais subies.
  const NEUTRE = 0.05;
  let cur = 0, pire = 0;
  for (const t of trades) { if (R(t) < -NEUTRE) { cur++; if (cur > pire) pire = cur; } else cur = 0; }
  const brut = trades.reduce((a, t) => a + (t.R || 0), 0);
  const nuits = trades.length
    ? trades.reduce((a, x) => a + Math.max(0, (x.sortie_t - x.entree_t) / 86400000), 0) / trades.length
    : 0;
  return {
    nuits, brut, frais: brut - r.total,
    esp: r.n ? r.total / r.n : 0,
    calmar: r.dd !== 0 ? r.total / Math.abs(r.dd) : Infinity,
    oos: ctl.total, oosN: ctl.n, isAn: app.rAn,
    tenue: app.rAn > 0 ? ctl.rAn / app.rAn * 100 : (ctl.rAn > 0 ? 100 : 0),
    // Walk-forward : au lieu d'une seule coupure 70/30, on découpe la série en cinq
    // blocs chronologiques et on contrôle les quatre derniers, chacun étant « l'avenir »
    // des blocs qui le précèdent. Une configuration bonne par chance passe une fenêtre,
    // rarement quatre — c'est ce que la coupure unique ne peut pas distinguer.
    ...(() => {
      const T = 5;
      if (trades.length < T * 4) return { wf: null, wfT: 0, wfMin: null };
      const taille = trades.length / T;
      let bons = 0, pire = Infinity;
      for (let b = 1; b < T; b++) {
        const bloc = trades.slice(Math.floor(b * taille), Math.floor((b + 1) * taille));
        if (!bloc.length) continue;
        const tot = bloc.reduce((a, t) => a + R(t), 0);
        if (tot > 0) bons++;
        if (tot < pire) pire = tot;
      }
      return { wf: bons, wfT: T - 1, wfMin: pire === Infinity ? null : pire };
    })(),
    serie: pire, coupe: k, annees: r.annees,
    // tableau plat [année, R, nombre de trades] : dix fois plus léger que deux objets,
    // ce qui compte quand un scan produit des centaines de milliers de lignes
    pa: (() => {
      const m = new Map();
      for (const x of trades) {
        const an = new Date(x.entree_t).getUTCFullYear();
        const e = m.get(an);
        if (e) { e[0] += R(x); e[1]++; } else m.set(an, [R(x), 1]);
      }
      const plat = [];
      for (const [an, [rr, n]] of [...m].sort((a, b) => a[0] - b[0])) {
        plat.push(an, Math.round(rr * 100) / 100, n);
      }
      return plat;
    })(),
  };
}

// Seuls trois champs de la configuration dépendent de la grille de nombres : la période
// de l'entrée, le stop et l'objectif. Tout le reste (sens, filtres, sécurisation, durée,
// frais) est déjà figé par la variante — d'où le modèle envoyé une fois par variante.
function appliquer(modele, periode, sl, rr) {
  return {
    ...modele,
    entree: { ...modele.entree, periode },
    sortie: { ...modele.sortie, sl: { ...modele.sortie.sl, valeur: sl }, tp: { valeur: rr } },
  };
}

// Mesure une variante sur toute la grille de nombres. Renvoie les lignes de résultat.
export function mesurerVariante(df, v, periodes, sls, rrs) {
  const out = [];
  const echecs = [];
  for (const p of periodes) for (const sl of sls) for (const rr of rrs) {
    let trades;
    try {
      // `df` est la série H1 : le suivi de position se fait à ce pas, la décision
      // reste lue sur la bougie de `v.ut`. Voir moteur.js/backtesterSuivi.
      trades = M.backtesterSuivi(df, appliquer(v.cfg, p, sl, rr), v.ut);
    } catch (e) { echecs.push(v.sym + ' ' + p + '/' + sl + '/' + rr); continue; }
    const base = { sym: v.sym, entree: v.entree, ligne: v.ligne, filtre: v.filtre,
      filtreNom: v.filtreNom, sens: v.sens, periode: p, sl, rr,
      // verdict de faisabilité du stop, posé côté application et porté par la ligne
      ...(v.faisabilite === undefined ? {} : { faisabilite: v.faisabilite }),
      ...(v.mini === undefined ? {} : { mini: v.mini }),
      ...(v.pourquoi === undefined ? {} : { pourquoi: v.pourquoi }),
      // stop suiveur plus serré que l'amplitude médiane d'une bougie : le résultat
      // dépend du chemin intra-bougie, absent de la donnée
      ...(v.sousBruit === undefined ? {} : { sousBruit: v.sousBruit }),
      ...(v.bruitPct === undefined ? {} : { bruitPct: v.bruitPct }),
      ...(v.trailingPct === undefined ? {} : { trailingPct: v.trailingPct }) };
    // on garde tout, même sous le nombre de trades minimum : le tableau
    // « toutes les configurations testées » doit pouvoir les montrer.
    if (!trades.length) {
      out.push({ ...base, n: 0, total: 0, rAn: 0, dd: 0, positifs: 0, segTotal: 5, pf: 0, winRate: 0, sommets: 0 });
      continue;
    }
    const r = M.resume(trades), sg = M.segments(trades, 5);
    out.push({ ...base,
      n: r.n, total: r.total, rAn: r.rAn, dd: r.dd,
      positifs: sg.positifs, segTotal: sg.total, pf: r.pf, winRate: r.winRate,
      nGains: r.nGains, nPertes: r.nPertes, neutres: r.neutres, ambigus: r.ambigus,
      // sorties reposant sur un palier armé dans leur propre bougie : le seul écart
      // qui subsiste face au testeur MT5, et il est optimiste
      exposes: r.exposes,
      // trades sortis par le trailing dans la bougie de leur propre plus haut
      sommets: r.sommets,
      t0: trades[0].entree_t, t1: trades[trades.length - 1].sortie_t,
      filtres: v.etiq, ...mesuresSup(trades, r) });
  }
  return { out, echecs };
}
