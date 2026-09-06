/**
 * Confrontation moteur ↔ robot MT5 : le NOYAU, partagé par la ligne de commande et par
 * la page.
 *
 * Il existait en un seul exemplaire, dans `scripts/mt5/conformite.mjs`, et n'était
 * atteignable qu'en console. La page ne pouvait donc pas montrer à son utilisateur ce
 * que le harnais mesurait — or c'est exactement la question que Sivula doit savoir
 * répondre : « ce chiffre, MT5 le rend-il aussi ? » Deux implémentations auraient
 * divergé, comme `src/lib/moteur.ts` a divergé de `moteur.js` ; il n'y en a qu'une, et
 * elle ne rend que des DONNÉES. La mise en forme appartient à chaque appelant.
 */

const jour = (ms) => Math.floor(ms / 86400000);
const bougie = (ms) => Math.floor(ms / 3600000);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
/** « 2020.05.19 00:00 » → ms UTC */
const horo = (s) => Date.parse(s.trim().replace(/\./g, '-').replace(' ', 'T') + ':00Z');

/** Lit les lignes CONF| du journal du robot, quel que soit le bruit autour. */
export function lireConformite(texte) {
  const D = new Map(), T = new Map(), E = new Map(), S = new Map(), P = [];
  const sorties = [];
  for (const brute of String(texte).split('\n')) {
    const i = brute.indexOf('CONF|');
    if (i < 0) continue;
    const c = brute.slice(i + 5).trim().split('|');
    if (c[0] === 'D') {
      const t = horo(c[1]);
      D.set(jour(t), { t, signal: c[2] === '1', c1: +c[3], c2: +c[4], l1: +c[5], l2: +c[6],
        haut1: +c[7], bas1: +c[8], raison: c[9] || '' });
    } else if (c[0] === 'T') {
      const t = horo(c[1]);
      if (!T.has(jour(t))) T.set(jour(t), []);
      T.get(jour(t)).push({ t, sp: +c[2], plafond: +c[3], accepte: c[4] === '1',
        quand: c[5], raison: c[6] || '' });
    } else if (c[0] === 'E') {
      const t = horo(c[1]);
      E.set(jour(t), { t, reel: horo(c[2]), prix: +c[3], sl: +c[4], tp: +c[5], lots: +c[6] });
    } else if (c[0] === 'S') {
      // La sortie est indexée sur le jour de la BOUGIE de sortie, pas sur celui de
      // l'entrée : une position ouverte lundi et fermée jeudi doit se retrouver là où
      // le moteur la ferme, sinon la comparaison des sorties compare deux trades.
      const t = horo(c[1]);
      const s = { t, reel: horo(c[2]), prix: +c[3], resultat: +c[4],
        swap: +c[5], commission: +c[6], motif: c[7] || '' };
      sorties.push(s);
      // Indexée par jour pour l'appariement, mais AUSSI gardée entière : deux positions
      // peuvent se clore le même jour, et la Map n'en garderait qu'une. Les frais
      // totalisés sur la Map annonçaient -124,8 % du résultat au lieu de 30 %.
      S.set(jour(t), s);
    } else if (c[0] === 'P') {
      P.push({ t: horo(c[1]), parcours: +c[2], avant: +c[3], apres: +c[4], extreme: +c[5] });
    }
  }
  return { D, T, E, S, P, sorties };
}

/** Le journal porte-t-il quelque chose d'exploitable ? */
export function journalUtilisable(conf) {
  return !!(conf && conf.D && conf.D.size);
}

/**
 * Confronte le journal du robot au moteur, sur la MÊME série et la MÊME configuration.
 *
 * `debut` recadre la comparaison sur la plage réellement mesurable : le robot tourne sur
 * toute la période du testeur, le moteur seulement là où le courtier a relevé un spread.
 * Sans ce recadrage, #Germany40 affichait 111 trades robot contre 76, et BITCOIN 455
 * contre 422 — un écart qui n'est qu'une différence de période.
 *
 * `portage` (taille de contrat) sert à chiffrer les frais du robot en R ; sans lui, les
 * blocs de frais et de bande sont simplement absents du résultat.
 */
export function confronter({ M, df, cfg, conf, debut, portage, m1 }) {
  // ————— LE DÉPARTAGE M1 —————
  //
  // Une divergence de sortie est presque toujours une question d'ordre : dans l'heure
  // disputée, le prix a-t-il touché d'abord le niveau que le robot annonce, ou celui
  // que le moteur retient ? La bougie H1 ne le dit pas ; la M1 le dit, minute par
  // minute. La série M1 est fournie par l'appelant (espace de stockage à part —
  // elle n'entre jamais dans le moteur de mesure) et reste optionnelle.
  const heuresM1 = (() => {
    if (!m1 || !m1.n) return null;
    const m = new Map();
    for (let i = 0; i < m1.n; i++) {
      const h = bougie(m1.t[i]);
      let l = m.get(h);
      if (!l) { l = []; m.set(h, l); }
      l.push(i);
    }
    return m;
  })();
  const dep = { arbitres: 0, robot: 0, moteur: 0, indecis: 0, muets: 0 };
  const hm = (ms) => iso(ms).slice(11, 16);
  // rend le texte à accoler à l'exemple, et compte le verdict
  const arbitrerSortie = (r, m) => {
    if (!heuresM1) return '';
    const hR = bougie(r.t), hM = bougie(m.sortie_t);
    const premier = Math.min(hR, hM);
    const barres = heuresM1.get(premier);
    dep.arbitres++;
    if (!barres || !barres.length) { dep.muets++; return ' · M1 : absente sur cette heure'; }
    // à quelle minute un niveau de prix est-il touché dans l'heure du premier sorti ?
    const touche = (niveau) => {
      if (!Number.isFinite(niveau)) return null;
      for (const i of barres) if (m1.l[i] <= niveau && niveau <= m1.h[i]) return m1.t[i];
      return null;
    };
    const tR = touche(r.prix), tM = touche(m.sortie);
    if (hR !== hM) {
      // celui qui sort le premier affirme que SON niveau a été traité dans cette
      // heure-là ; la M1 confirme ou contredit cette affirmation
      const tot = hR < hM;
      const tPremier = tot ? tR : tM;
      if (tPremier !== null) { tot ? dep.robot++ : dep.moteur++;
        return ' · M1 : ' + (tot ? r.prix + ' traité à ' + hm(tPremier) + ' — robot confirmé'
          : m.sortie + ' traité à ' + hm(tPremier) + ' — moteur confirmé'); }
      tot ? dep.moteur++ : dep.robot++;
      return ' · M1 : ' + (tot ? r.prix : m.sortie) + ' jamais traité dans l\u2019heure — '
        + (tot ? 'robot contredit' : 'moteur contredit');
    }
    // même bougie, deux prix : le premier niveau traité, minute par minute, a raison
    if (tR === null && tM === null) { dep.indecis++; return ' · M1 : aucun des deux niveaux traité dans l\u2019heure — indécidable'; }
    if (tM === null || (tR !== null && tR < tM)) { dep.robot++;
      return ' · M1 : ' + r.prix + ' traité d\u2019abord (' + hm(tR) + ') — robot confirmé'; }
    if (tR === null || tM < tR) { dep.moteur++;
      return ' · M1 : ' + m.sortie + ' traité d\u2019abord (' + hm(tM) + ') — moteur confirmé'; }
    dep.indecis++;
    return ' · M1 : les deux niveaux dans la même minute (' + hm(tR) + ') — indécidable';
  };
  const sup = M.resampler(df, 'D1');
  const signal = M.signalDe(sup, cfg);
  const autorise = M.autorisePar(sup, cfg.filtres);
  const trades = M.backtesterSuivi(df, cfg, 'D1');
  const entrees = new Map(trades.map((t) => [jour(t.entree_t), t]));
  const sorties = new Map(trades.map((t) => [jour(t.sortie_t), t]));

  const sp = M.spreadEnPct(df);
  const seuil = M.seuilSpread(df, cfg.spread_max_facteur);
  const parBougie = new Map();
  for (let i = 0; i < df.n; i++) parBougie.set(bougie(df.t[i]), i);

  const decision = new Map();
  for (let k = 0; k < sup.n; k++) {
    if (sup.t[k] < debut || (cfg.fin && sup.t[k] >= cfg.fin)) continue;
    decision.set(jour(sup.t[k]), {
      signal: !!signal[k] && !(autorise && !autorise[k]),
      brut: !!signal[k],
      filtre: !autorise || !!autorise[k],
    });
  }

  const cat = new Map(), exemples = new Map();
  const noter = (nom, texte) => {
    cat.set(nom, (cat.get(nom) || 0) + 1);
    if (!exemples.has(nom)) exemples.set(nom, []);
    if (exemples.get(nom).length < 3) exemples.get(nom).push(texte);
  };

  const jourDans = (j) => j * 86400000 >= debut - 86400000
    && (!cfg.fin || j * 86400000 < cfg.fin);
  const jours = [...new Set([...conf.D.keys(), ...decision.keys()])]
    .filter(jourDans).sort((a, b) => a - b);
  let communs = 0;
  for (const j of jours) {
    const r = conf.D.get(j), m = decision.get(j);
    const d = iso(j * 86400000).slice(0, 10);
    if (!r) { noter('journée absente du journal', d); continue; }
    if (!m) { noter('journée absente du moteur', d); continue; }
    communs++;

    if (r.signal !== m.signal) {
      noter(r.signal ? 'signal chez le robot seul' : 'signal chez le moteur seul',
        `${d} — robot ${r.signal ? 'SIGNAL' : 'refus : ' + r.raison}, moteur ${m.signal ? 'SIGNAL' : (m.brut ? 'écarté par un filtre' : 'pas de signal')}`);
      continue;
    }
    if (!m.signal) continue;   // les deux refusent : rien à comparer plus loin

    const e = conf.E.get(j), t = entrees.get(j);
    if (!e && !t) continue;
    if (!e) { noter('entrée chez le moteur seul', `${d} — moteur ${iso(t.entree_t)}`); continue; }
    if (!t) {
      const der = (conf.T.get(j) || []).slice(-1)[0];
      noter('entrée chez le robot seul',
        `${d} — robot ${iso(e.t)}${der ? `, dernière tentative ${der.accepte ? 'acceptée' : 'refusée : ' + der.raison}` : ''}`);
      continue;
    }
    if (bougie(e.t) !== bougie(t.entree_t)) {
      const i = parBougie.get(bougie(t.entree_t));
      noter("bougie d'entrée différente",
        `${d} — moteur ${iso(t.entree_t)} (spread ${i !== undefined ? sp[i].toFixed(5) : '?'} / plafond ${i !== undefined ? seuil[i].toFixed(5) : '?'}), robot ${iso(e.t)} (tentatives ${(conf.T.get(j) || []).map((x) => `${new Date(x.t).getUTCHours()}h:${x.sp.toFixed(5)}${x.accepte ? '✓' : '✗'}`).join(' ')})`);
      continue;
    }
    const ecart = Math.abs(e.prix - t.entree) / (t.entree - t.sl_initial);
    if (ecart > 0.02) {
      noter("prix d'entrée différent",
        `${d} ${iso(t.entree_t)} — moteur ${t.entree}, robot ${e.prix} (${(ecart * 100).toFixed(1)} % du risque)`);
    }
  }

  // Les SORTIES, comparées à part. Une entrée juste avec une sortie fausse donne le même
  // nombre de trades et un R différent : sans ce bloc, l'écart restait sans nom.
  let fraisRobot = null;
  if (conf.S.size) {
    for (const j of [...new Set([...conf.S.keys(), ...sorties.keys()])].filter(jourDans).sort((a, b) => a - b)) {
      const r = conf.S.get(j), m = sorties.get(j);
      const d = iso(j * 86400000).slice(0, 10);
      if (!r || !m) { noter(r ? 'sortie chez le robot seul' : 'sortie chez le moteur seul', d); continue; }
      if (bougie(r.t) !== bougie(m.sortie_t)) {
        noter('bougie de sortie différente', `${d} — moteur ${iso(m.sortie_t)} (${m.motif}), robot ${iso(r.t)} (${r.motif})` + arbitrerSortie(r, m));
        continue;
      }
      const risque = Math.abs(m.entree - m.sl_initial);
      const ec = risque > 0 ? Math.abs(r.prix - m.sortie) / risque : 0;
      if (ec > 0.02) {
        noter('prix de sortie différent',
          `${d} ${iso(m.sortie_t)} — moteur ${m.sortie} (${m.motif}), robot ${r.prix} (${r.motif}) : ${(ec * 100).toFixed(1)} % du risque` + arbitrerSortie(r, m));
      }
    }
    // sur TOUTES les sorties, pas sur la Map par jour
    const sw = conf.sorties.reduce((a, x) => a + x.swap, 0);
    const co = conf.sorties.reduce((a, x) => a + x.commission, 0);
    const br = conf.sorties.reduce((a, x) => a + x.resultat, 0);
    fraisRobot = { n: conf.sorties.length, brut: br, swap: sw, commission: co,
      net: br + sw + co, partPct: br !== 0 ? 100 * (sw + co) / Math.abs(br) : null };
  }

  // ————— le chiffre que l'on cherche à faire coïncider —————
  let bilan = null;
  const contrat = Number(portage && portage.contrat) || 0;
  if (conf.sorties.length && contrat > 0) {
    const dans = (t) => t >= debut && (!cfg.fin || t < cfg.fin);
    const tousEnt = [...conf.E.values()].sort((a, b) => a.t - b.t);
    const tousSor = [...conf.sorties].sort((a, b) => a.t - b.t);
    const garde = tousEnt.map((_, i) => dans(tousEnt[i].t));
    const ent = tousEnt.filter((_, i) => garde[i]);
    const sor = tousSor.filter((_, i) => garde[i]);
    // Le courtier tient les frais dans la devise du COMPTE (EUR), le risque se calcule
    // dans celle du SYMBOLE (USD sur GOLD) : diviser l'un par l'autre sous-estimait les
    // frais du robot de 10 %. On lit le cours sur les trades eux-mêmes, puis on
    // l'applique à tous. Sur GOLD ce cours implicite reproduit l'EUR/USD réel.
    const paires = [];
    for (let i = 0; i < Math.min(ent.length, sor.length); i++) {
      const rp = ent[i].prix - ent[i].sl;
      const r = (sor[i].prix - ent[i].prix) / rp;
      if (!Number.isFinite(r) || Math.abs(r) < 0.2 || !(ent[i].lots > 0)) continue;
      const f = Math.abs(sor[i].resultat / r) / (ent[i].lots * contrat * Math.abs(rp));
      if (f > 0) paires.push(f);
    }
    paires.sort((a, b) => a - b);
    const change = paires.length ? paires[paires.length >> 1] : 1;

    let brut = 0, coutSwap = 0, coutComm = 0, k = 0;
    for (let i = 0; i < Math.min(ent.length, sor.length); i++) {
      const risquePrix = ent[i].prix - ent[i].sl;
      const r = (sor[i].prix - ent[i].prix) / risquePrix;
      if (!Number.isFinite(r)) continue;
      brut += r; k++;
      if (ent[i].lots > 0) {
        const risque = ent[i].lots * contrat * Math.abs(risquePrix) * change;
        coutSwap += -sor[i].swap / risque;
        coutComm += -sor[i].commission / risque;
      }
    }
    const rm = trades.reduce((a, t) => a + t.R, 0);
    const rmNet = trades.reduce((a, t) => a + (t.R_net !== undefined ? t.R_net : t.R), 0);

    // La bande entre les deux lectures : c'est la promesse du produit. L'ordre des
    // mouvements DANS une bougie H1 est inconnu, donc le moteur ne donne pas UN chiffre
    // mais un intervalle — et ce que MT5 mesure doit tomber dedans. Une bande qui ne
    // contient pas le chiffre du robot est un défaut de modèle, pas une incertitude.
    const lire = (prudent) => M.backtesterSuivi(df, { ...cfg, sortie: { ...cfg.sortie, prudent } }, 'D1');
    const haut = lire(false), bas = lire(true);
    const totNet = (a) => a.reduce((x, t) => x + (t.R_net !== undefined ? t.R_net : t.R), 0);
    const bNet = totNet(bas), hNet = totNet(haut);
    const robotNet = brut - coutSwap - coutComm;
    const lo = Math.min(bNet, hNet), hi = Math.max(bNet, hNet);
    bilan = {
      nRobot: k, nMoteur: trades.length, change,
      brutRobot: brut, brutMoteur: rm,
      fraisRobot: coutSwap + coutComm, portageRobot: coutSwap, commissionRobot: coutComm,
      fraisMoteur: rm - rmNet,
      netRobot: robotNet, netMoteur: rmNet,
      bande: [lo, hi], largeur: hi - lo,
      dedans: robotNet >= lo && robotNet <= hi,
      positionPct: hi > lo ? (100 * (robotNet - lo)) / (hi - lo) : null,
      ambigus: haut.filter((t) => t.ambigu).length, nLecture: haut.length,
    };
  }

  return {
    communs, nJoursRobot: conf.D.size, nJoursMoteur: decision.size,
    nEntreesRobot: conf.E.size, nEntreesMoteur: trades.length, nSortiesRobot: conf.S.size,
    fraisRobot, bilan, trades,
    // null quand aucune M1 n'a été fournie — l'appelant sait alors proposer l'étape 5
    departageM1: heuresM1 ? dep : null,
    divergences: [...cat.entries()].sort((a, b) => b[1] - a[1])
      .map(([nom, n]) => ({ nom, n, exemples: exemples.get(nom) })),
  };
}
