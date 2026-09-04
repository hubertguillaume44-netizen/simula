// moteur.js — transposition JS de moteur.py + blocs.py (Tradingmoteur).
// Règles invariantes respectées :
//  1. données de base H1 uniquement, H4/D1 par resampling
//  2. bougie confirmée uniquement (.shift(1))
//  3. multi-UT = dernière bougie supérieure clôturée
//  4. un bloc rend un booléen, le moteur combine
//  5. signal sur clôture de N → entrée à l'ouverture de N+1

export async function chargerCsv(url) {
  const txt = await (await fetch(url)).text();
  return texteVersDf(txt);
}

// même analyse, à partir d'un texte déjà en mémoire (fichier déposé par l'utilisateur)
export function texteVersDf(txt) {
  const lignes = txt.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!lignes.length) return nettoyer({ t: [], o: [], h: [], l: [], c: [], v: [], n: 0 });
  // séparateur déduit de l'en-tête : MT5 exporte en virgule, point-virgule ou tabulation
  const sep = [',', ';', '\t'].reduce((a, s) =>
    (lignes[0].split(s).length > lignes[0].split(a).length ? s : a), ',');
  const enTete = lignes[0].toLowerCase();
  const debut = /date|time|open/.test(enTete) ? 1 : 0;
  // Colonne de spread : MT5 la connaît bougie par bougie (champ spread de MqlRates) et
  // l'écrit si le script d'export la demande. C'est la seule façon d'avoir le spread de
  // L'HEURE D'ENTRÉE au lieu d'une moyenne : les entrées tombent à l'ouverture qui suit
  // la clôture du jour, l'heure du rollover, où le spread est deux à trois fois le
  // spread moyen du relevé. On repère la colonne par son nom, jamais par sa position.
  const cols = debut ? lignes[0].split(sep).map((x) => x.trim().toLowerCase().replace(/["']/g, '')) : [];
  let iSp = cols.findIndex((x) => /spread/.test(x));
  // Colonne de séance : 1 si l'ordre PEUT partir sur cette bougie, 0 sinon. Une bougie
  // peut être cotée sans être traitable — sur #HongKong50 les bougies de 03:00 et 04:00
  // portent un spread normal et l'ordre y est refusé, la séance de négociation ouvrant
  // après la séance de cotation. Le moteur y inscrivait un prix que personne ne pouvait
  // traiter. Absente, la colonne vaut 1 partout : les séries déjà exportées gardent leur
  // comportement.
  const iSess = cols.findIndex((x) => /session|seance|séance/.test(x));
  // ORDRE DES EXTRÊMES : la minute, dans l'heure, où la bougie a fait son plus haut et
  // celle où elle a fait son plus bas. Deux entiers qui ferment l'indécision du
  // backtest — une bougie H1 dit ce que le prix a touché, jamais dans quel ordre, et
  // c'est ce seul ordre qui décide du sort d'un trade quand une bougie arme un palier
  // puis redescend le toucher. Absentes, le moteur retombe sur une convention de
  // lecture et le dit : les séries déjà exportées gardent leur comportement.
  const iMH = cols.findIndex((x) => /min_haut|minhaut/.test(x));
  const iMB = cols.findIndex((x) => /min_bas|minbas/.test(x));
  // Le haut et le bas VUS PAR LA M1 — ceux que le testeur MT5 rejoue. Ils ne sont pas
  // toujours ceux de la bougie H1 : le courtier stocke des H1 reconstituées dont les
  // extrêmes n'ont jamais existé à la minute. Le SIGNAL se lit sur la H1 du courtier,
  // comme le robot ; l'EXÉCUTION doit se lire sur la M1, comme le testeur.
  const iEH = cols.findIndex((x) => /m1_haut|m1haut/.test(x));
  const iEB = cols.findIndex((x) => /m1_bas|m1bas/.test(x));
  // Ce que le prix a fait APRÈS le second extrême de l'heure. L'ordre des deux extrêmes
  // ne ferme pas tout : quand le palier s'arme sur le SECOND, ce qui se passe entre lui
  // et la clôture reste inconnu, et c'est le dernier écart face au testeur. Ces deux
  // colonnes le tranchent dans le sens utile — voir `backtester`.
  const iAH = cols.findIndex((x) => /haut_apres|hautapres/.test(x));
  const iAB = cols.findIndex((x) => /bas_apres|basapres/.test(x));
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [], sess = [], mh = [], mb = [],
    eh = [], eb = [], ah = [], ab = [];
  for (let i = debut; i < lignes.length; i++) {
    const p = lignes[i].split(sep);
    if (p.length < 5) continue;
    let d = p[0].trim().replace(/["']/g, '');
    let heure = '';
    // date et heure peuvent occuper une seule colonne ou deux
    if (!/[ T]/.test(d) && /^\d{1,2}:\d{2}/.test((p[1] || '').trim())) {
      heure = p[1].trim();
      p.splice(1, 1);
    } else {
      const m = /^(\S+)[ T](\S+)$/.exec(d);
      if (m) { d = m[1]; heure = m[2]; }
    }
    const dd = d.split(/[.\-\/]/);
    if (dd.length < 3) continue;
    const an = dd[0].length === 4 ? +dd[0] : +dd[2];
    const mois = +dd[1];
    const jour = dd[0].length === 4 ? +dd[2] : +dd[0];
    const hm = heure.split(':');
    const ms = Date.UTC(an, mois - 1, jour, +(hm[0] || 0), +(hm[1] || 0));
    if (Number.isNaN(ms)) continue;
    const nb = (x) => parseFloat(String(x).replace(',', '.'));
    const [O, H, L, C] = [nb(p[1]), nb(p[2]), nb(p[3]), nb(p[4])];
    if ([O, H, L, C].some(Number.isNaN)) continue;
    t.push(ms); o.push(O); h.push(H); l.push(L); c.push(C); v.push(nb(p[5]) || 0);
    // l'index de la colonne est celui de l'en-tête, décalé si date et heure ont été fusionnées
    const decal = cols.length > p.length ? 1 : 0;
    sp.push(iSp >= 0 ? (nb(p[iSp - decal]) || 0) : 0);
    sess.push(iSess >= 0 ? (nb(p[iSess - decal]) ? 1 : 0) : 1);
    // -1 = inconnu, et le rester : le haut et le bas dans la même minute ne disent pas
    // dans quel ordre ils sont venus
    const lireMin = (k) => {
      if (k < 0) return -1;
      const x = nb(p[k - decal]);
      return Number.isFinite(x) && x >= 0 && x < 60 ? x : -1;
    };
    mh.push(lireMin(iMH));
    mb.push(lireMin(iMB));
    // 0 = pas de M1 sur cette heure : on garde l'extrême H1, seul disponible
    const px = (k) => { if (k < 0) return 0; const x = nb(p[k - decal]); return Number.isFinite(x) && x > 0 ? x : 0; };
    eh.push(px(iEH)); eb.push(px(iEB));
    ah.push(px(iAH)); ab.push(px(iAB));
  }
  return nettoyer({ t, o, h, l, c, v, sp, sess, mh, mb, eh, eb, ah, ab, n: t.length });
}

// ---------- nettoyage (blocs.charger_csv : couper_daily + normaliser_session) ----------
function jourUtc(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

// premier mois réellement intraday : ≥ 2 bougies/jour (médiane) sur 3 mois d'affilée
function debutIntraday(t) {
  const parMois = new Map();
  for (const ms of t) {
    const d = new Date(ms);
    const mois = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!parMois.has(mois)) parMois.set(mois, new Map());
    const j = parMois.get(mois), k = jourUtc(ms);
    j.set(k, (j.get(k) || 0) + 1);
  }
  const mois = [...parMois.keys()].sort((a, b) => a - b);
  const med = mois.map((m) => {
    const v = [...parMois.get(m).values()].sort((a, b) => a - b);
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  });
  for (let i = 0; i + 3 <= mois.length; i++) {
    if (med[i] >= 2 && med[i + 1] >= 2 && med[i + 2] >= 2) {
      const m = mois[i];
      return Date.UTC(Math.floor(m / 12), m % 12, 1);
    }
  }
  return null;
}

// fenêtre où la densité horaire est constante : (année de départ, heures gardées)
function fenetreHomogene(t) {
  const parAn = new Map();
  for (const ms of t) {
    const d = new Date(ms), an = d.getUTCFullYear();
    if (!parAn.has(an)) parAn.set(an, { heures: new Set(), jours: new Set() });
    const e = parAn.get(an);
    e.heures.add(d.getUTCHours());
    e.jours.add(jourUtc(ms));
  }
  let annees = [...parAn.keys()].sort((a, b) => a - b);
  const complets = annees.filter((a) => parAn.get(a).jours.size >= 60);
  if (complets.length) annees = complets;
  let meilleur = null;
  for (let i = 0; i < annees.length; i++) {
    const sous = annees.slice(i);
    let inter = new Set(parAn.get(sous[0]).heures);
    for (const a of sous.slice(1)) inter = new Set([...inter].filter((h) => parAn.get(a).heures.has(h)));
    if (!inter.size) continue;
    const n = sous.reduce((acc, a) => acc + parAn.get(a).jours.size * inter.size, 0);
    if (!meilleur || n > meilleur.n) meilleur = { n, depart: sous[0], heures: inter };
  }
  return meilleur || { depart: annees[0], heures: new Set([...Array(24).keys()]) };
}

export function nettoyer(df) {
  if (!df.n) return df;
  const debut = debutIntraday(df.t);
  const { depart, heures } = fenetreHomogene(df.t);
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [], sess = [], mh = [], mb = [],
    eh = [], eb = [], ah = [], ab = [];
  const spSrc = df.sp || df.spreadPts;
  const sessSrc = df.sess;
  const mhSrc = df.mh, mbSrc = df.mb, ehSrc = df.eh, ebSrc = df.eb;
  const ahSrc = df.ah, abSrc = df.ab;
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]);
    if (debut !== null && df.t[i] < debut) continue;
    if (d.getUTCFullYear() < depart || !heures.has(d.getUTCHours())) continue;
    t.push(df.t[i]); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); v.push(df.v[i]);
    sp.push(spSrc ? (spSrc[i] || 0) : 0);
    // pas de colonne = pas de restriction : une série exportée avant cette colonne doit
    // continuer à se mesurer exactement comme avant
    sess.push(sessSrc ? (sessSrc[i] ? 1 : 0) : 1);
    mh.push(mhSrc ? (mhSrc[i] ?? -1) : -1);
    mb.push(mbSrc ? (mbSrc[i] ?? -1) : -1);
    // faute de M1, l'extrême d'exécution EST celui de la bougie H1
    eh.push(ehSrc && ehSrc[i] > 0 ? ehSrc[i] : df.h[i]);
    eb.push(ebSrc && ebSrc[i] > 0 ? ebSrc[i] : df.l[i]);
    // 0 = colonne absente. Ne PAS retomber sur l'extrême de la bougie : ce serait
    // affirmer que le prix est revenu jusque-là après son second extrême, ce qu'aucune
    // donnée ne dit. L'absence doit rester une absence, et le moteur déclare alors la
    // bougie indécidable comme avant.
    ah.push(ahSrc && ahSrc[i] > 0 ? ahSrc[i] : 0);
    ab.push(abSrc && abSrc[i] > 0 ? abSrc[i] : 0);
  }
  const grain = mesurerGrain({ h, l, c, n: t.length });
  // Le spread est exporté en POINTS. Un point vaut 10^-décimales du cours : on le
  // convertit en % du prix, la seule unité que le moteur sache rapporter au stop. Une
  // colonne à zéro sur tout l'historique (fréquent sur les bougies anciennes importées
  // par le courtier) n'est pas une mesure : on la laisse tomber pour retomber sur le
  // spread du relevé, plutôt que de faire croire à un spread nul.
  let spreadPct = null, spreadPctMoyen = null;
  if (grain && sp.some((x) => x > 0)) {
    const pas = Math.pow(10, -grain.decimales);
    spreadPct = new Float32Array(t.length);
    let somme = 0, vus = 0;
    for (let i = 0; i < t.length; i++) {
      const p = c[i] > 0 && sp[i] > 0 ? sp[i] * pas / c[i] * 100 : 0;
      spreadPct[i] = p;
      if (p > 0) { somme += p; vus++; }
    }
    spreadPctMoyen = vus ? somme / vus : null;
    // moins d'un quart des bougies renseignées : la série est trop trouée pour servir
    if (vus < t.length / 4) { spreadPct = null; spreadPctMoyen = null; }
  }
  // `sessRenseigne` distingue « toutes les bougies sont traitables » d'une colonne
  // absente : sans lui, une série exportée sans la colonne serait indiscernable d'une
  // série dont le courtier n'aurait fermé aucune heure.
  const sessRenseigne = !!df.sess && sess.some((x) => !x);
  // Part des bougies dont l'ORDRE des extrêmes est connu. C'est elle qui dit si la
  // mesure est déterminée par la donnée ou par une convention de lecture : à 100 %,
  // les deux lectures rendent le même chiffre.
  const ordreConnu = mh.some((x) => x >= 0)
    ? mh.reduce((a, x, i) => a + (x >= 0 && mb[i] >= 0 ? 1 : 0), 0) / (t.length || 1)
    : 0;
  // Part des bougies pour lesquelles on sait ce que le prix a fait APRÈS son second
  // extrême. C'est la donnée qui referme le dernier indécidable ; une série exportée
  // avant ces colonnes doit pouvoir le dire, sinon l'utilisateur ne comprend pas
  // pourquoi sa bande reste large.
  const retourConnu = ah.some((x) => x > 0)
    ? ah.reduce((a, x, i) => a + (x > 0 && ab[i] > 0 ? 1 : 0), 0) / (t.length || 1)
    : 0;
  return { t, o, h, l, c, v, sp, sess, mh, mb, eh, eb, ah, ab, n: t.length, ecartees: df.n - t.length,
    heuresSession: [...heures].sort((a, b) => a - b), grain,
    spreadPct, spreadPctMoyen, spreadRenseigne: !!spreadPct, sessRenseigne, ordreConnu, retourConnu };
}

// LES COLONNES D'UNE SÉRIE, en un seul endroit.
//
// Trois recopies indépendantes existaient — `decouper`, l'enregistrement du navigateur,
// et l'envoi aux workers du scan — et les trois avaient oublié les mêmes colonnes, à des
// moments différents. Le défaut ne se voit pas : une colonne perdue ne se distingue pas
// d'une colonne absente, et le calcul continue en silence avec une convention de lecture
// au lieu de la donnée. Le pire cas était le worker : le scan parallèle rendait d'autres
// chiffres que le backtest, sur la même configuration.
//
// Toute recopie d'une série passe désormais par cette liste. En ajouter une revient à
// l'écrire ici, et les trois chemins la portent.
export const CHAMPS_SERIE = ['t', 'o', 'h', 'l', 'c', 'v', 'sp', 'sess',
  'mh', 'mb', 'eh', 'eb', 'ah', 'ab', 'spreadPct'];
export const CHAMPS_META = ['n', 'grain', 'heuresSession', 'ecartees', 'spreadPctMoyen',
  'spreadRenseigne', 'sessRenseigne', 'ordreConnu', 'retourConnu'];

/** Copie d'une série, colonnes et métadonnées comprises. `garder` filtre les indices. */
export function copierSerie(df, garder) {
  if (!df) return df;
  const out = {};
  for (const k of CHAMPS_META) if (df[k] !== undefined) out[k] = df[k];
  for (const k of CHAMPS_SERIE) {
    const col = df[k];
    if (!col) continue;
    out[k] = garder ? Array.from(col).filter((_, i) => garder(i)) : col;
  }
  if (garder) out.n = (out.t && out.t.length) || 0;
  return out;
}

// Grain de la série : certains exports MT5 arrondissent les prix à 2 décimales.
// Sur une paire cotée 0,50 cela donne un pas de 2 % du cours : stop et objectif
// tombent dans le MÊME créneau, les bougies sont plates, et le backtest ne mesure
// plus rien. On rend le pas mesurable pour pouvoir refuser ces séries.
function mesurerGrain(d) {
  if (!d.n) return null;
  // échantillon régulier : mesurer 72 000 bougies par série × 38 séries coûtait
  // plusieurs secondes de fil principal au chargement. 2 000 points suffisent
  // à établir le pas de cotation.
  const pas = Math.max(1, Math.floor(d.n / 2000));
  let plates = 0, somme = 0, vus = 0, dec = 0;
  for (let i = 0; i < d.n; i += pas) {
    if (d.h[i] === d.l[i]) plates++;
    somme += d.c[i];
    vus++;
    const s = String(d.c[i]);
    const pt = s.indexOf('.');
    const k = pt < 0 ? 0 : s.length - pt - 1;
    if (k > dec) dec = k;
  }
  const moyen = somme / vus;
  return {
    decimales: dec,
    platesPct: plates / vus * 100,
    // pas de cotation exprimé en % du cours : la vraie mesure d'utilisabilité
    pasPct: moyen > 0 ? Math.pow(10, -dec) / moyen * 100 : Infinity,
  };
}

// blocs.decouper : amorce de 400 jours avant la période testée (MM200 en Daily)
export const AMORCE_JOURS = 400;
// Le spread lu dans le fichier est en POINTS ; le moteur le veut en % du cours. Une série
// relue depuis le stockage a perdu sa conversion (seuls les points sont conservés, quatre
// fois plus compacts) : on la refait ici, en mesurant les décimales si le grain manque.
export function spreadEnPct(df) {
  if (df.spreadPct) return df.spreadPct;
  const pts = df.sp;
  if (!pts || !df.n) return null;
  let aDuSpread = false;
  for (let i = 0; i < df.n; i++) if (pts[i] > 0) { aDuSpread = true; break; }
  if (!aDuSpread) return null;
  const g = df.grain || mesurerGrain(df);
  if (!g) return null;
  const pas = Math.pow(10, -g.decimales);
  const out = new Float32Array(df.n);
  let vus = 0;
  for (let i = 0; i < df.n; i++) {
    const v = df.c[i] > 0 && pts[i] > 0 ? pts[i] * pas / df.c[i] * 100 : 0;
    out[i] = v;
    if (v > 0) vus++;
  }
  return vus >= df.n / 4 ? out : null;
}
// Seuil de spread « pic » : la médiane des `fenetre` dernières bougies, rafraîchie une
// fois par jour. C'est un multiple de cette médiane qui sert de plafond, jamais la
// médiane elle-même : le spread s'élargit d'année en année, donc un seuil calé sur la
// médiane de TOUTE la série ne mord plus du tout sur les années récentes (mesuré sur
// AUDCAD : 92 % des bougies de 2021 passent, 0 % de celles de 2025) et laisse 20 à 54 %
// des journées sans aucune bougie éligible. Ce qu'on veut refuser, c'est le pic du
// rollover — trois à huit fois la normale —, pas la moitié haute d'une distribution.
//
// Rafraîchi une fois par jour et non à chaque bougie : le robot MQL5 fait de même (il
// ne peut pas retrier six mille spreads à chaque tick), et les deux doivent obtenir le
// même nombre, sinon ils n'entrent pas au même moment.
export const SPREAD_FENETRE = 250 * 24;
export const SPREAD_FACTEUR = 1.5;

export function seuilSpread(df, facteur = SPREAD_FACTEUR, fenetre = SPREAD_FENETRE) {
  const sp = spreadEnPct(df);
  if (!sp) return null;
  return memo(df, 'seuilSpread|' + facteur + '|' + fenetre, () => {
    const out = new Float64Array(df.n);
    // La fenêtre GLISSE : d'un jour au suivant elle perd quelques valeurs par la gauche
    // et en gagne autant par la droite. La recollecter et la retrier entièrement à chaque
    // jour coûtait deux secondes et demie par instrument — mille neuf cents tris de six
    // mille valeurs — et sur un balayage de quarante instruments, cent secondes avant
    // même le premier backtest. On maintient donc la fenêtre TRIÉE et on l'ajuste :
    // chaque valeur y entre une fois et en sort une fois.
    //
    // Le résultat est le MÊME, chiffre pour chiffre — c'est vérifié par un test, et il
    // faut qu'il le soit : ce seuil décide de l'heure d'entrée, et le robot le calcule de
    // son côté. Deux médianes qui diffèrent d'un cheveu font entrer les deux à des heures
    // différentes.
    const tri = [];
    const inserer = (x) => {
      let a = 0, b = tri.length;
      while (a < b) { const m = (a + b) >> 1; if (tri[m] < x) a = m + 1; else b = m; }
      tri.splice(a, 0, x);
    };
    const retirer = (x) => {
      let a = 0, b = tri.length;
      while (a < b) { const m = (a + b) >> 1; if (tri[m] < x) a = m + 1; else b = m; }
      if (tri[a] === x) tri.splice(a, 1);
    };
    let jour = null, med = 0, dedansA = 0, dedansB = 0;
    for (let i = 0; i < df.n; i++) {
      const j = Math.floor(df.t[i] / 86400000);
      if (jour === null || j !== jour) {
        const a = Math.max(0, i - fenetre);
        while (dedansB < i) { if (sp[dedansB] > 0) inserer(sp[dedansB]); dedansB++; }
        while (dedansA < a) { if (sp[dedansA] > 0) retirer(sp[dedansA]); dedansA++; }
        // sous 100 relevés la médiane n'a pas de sens : le seuil reste inactif
        if (tri.length >= 100) med = tri[tri.length >> 1] * facteur;
        jour = j;
      }
      out[i] = med;
    }
    return out;
  });
}

// Bougies RECONSTITUÉES : celles que le courtier n'a pas cotées et qu'il a rebâties
// depuis une unité plus grossière. Elles se reconnaissent à deux signes ensemble, dont
// aucun ne suffit seul :
//
//   · aucun spread relevé, alors que la série en porte ailleurs ;
//   · la bougie englobe le haut ET le bas de TOUTE sa journée.
//
// Une heure ne peut pas contenir l'amplitude d'une journée entière et n'avoir laissé
// aucune trace de son spread. Mesuré sur GOLD : 838 des 1 057 journées portant une
// bougie de 00:00 sont dans ce cas, avec 10,7 fois le volume d'une heure ordinaire et
// 4,4 fois son amplitude — la journée déguisée en heure.
//
// Exiger les DEUX conditions importe : une heure calme peut légitimement contenir toute
// l'amplitude d'une journée calme, et une heure creuse peut légitimement n'avoir aucun
// spread relevé. Prise seule, chaque condition écarterait des bougies vraies.
export function bougiesReconstituees(df) {
  const sp = spreadEnPct(df);
  if (!sp || !df.n) return null;
  // La MINUTE des extrêmes tranche directement : quand l'export a bien lu la M1 mais
  // n'y trouve qu'un seul relevé pour toute l'heure, il écrit la même minute des deux
  // côtés, ou -1 s'il n'en trouve aucun. Une heure sans spread ET sans le moindre
  // détail à la minute est une heure que le courtier n'a pas cotée : le moteur refuse
  // déjà d'y entrer, il doit refuser aussi d'y lire un haut et un bas.
  //
  // Ce signal remplace l'englobement, qui était brittle : le 28 janvier 2020, la bougie
  // de 00:00 de GOLD porte le bas de toute la journée, 278 033 de volume contre 21 392
  // pour l'heure suivante, aucun spread et aucune minute — mais son plus haut est
  // inférieur de DEUX CENTIMES à celui de 02:00. L'englobement la manquait, et le
  // moteur y déclenchait un stop fantôme.
  const mh = df.mh, mb = df.mb;
  const aMinutes = !!mh && !!mb && mh.some((x) => x >= 0);
  return memo(df, 'reconstituees', () => {
    const out = new Uint8Array(df.n);
    if (aMinutes) {
      for (let i = 0; i < df.n; i++) {
        if (sp[i] > 0) continue;
        if (mh[i] < 0 || mb[i] < 0 || mh[i] === mb[i]) out[i] = 1;
      }
      return out;
    }
    // Série exportée avant ces colonnes : on retombe sur l'englobement de la journée,
    // le seul indice disponible. Deux signes exigés ensemble — une heure calme peut
    // légitimement contenir toute l'amplitude d'un jour calme, et une heure creuse peut
    // légitimement n'avoir aucun spread relevé.
    let a = 0;
    while (a < df.n) {
      const j = Math.floor(df.t[a] / 86400000);
      let b = a;
      while (b < df.n && Math.floor(df.t[b] / 86400000) === j) b++;
      // sous quatre bougies, la journée est trop mince pour que « englober » veuille
      // dire quoi que ce soit
      if (b - a >= 4) {
        for (let i = a; i < b; i++) {
          if (sp[i] > 0) continue;
          let h = -Infinity, l = Infinity;
          for (let k = a; k < b; k++) {
            if (k === i) continue;
            if (df.h[k] > h) h = df.h[k];
            if (df.l[k] < l) l = df.l[k];
          }
          if (df.h[i] >= h && df.l[i] <= l) out[i] = 1;
        }
      }
      a = b;
    }
    return out;
  });
}

// Plage de dates sur laquelle la série est réellement mesurable.
//
// Un spread à zéro n'est pas un spread nul : c'est une information absente. Le moteur
// refuse alors la bougie — elle ne peut pas passer le plafond — et si toute une journée
// est à zéro, le signal du jour disparaît sans trace. Mesuré sur les exports du
// 3 septembre 2026 : la M1 du courtier ne remonte pas au-delà de 2022 pour Germany40 et
// BITCOIN, qui portent 100 % de bougies sans spread sur 2019-2021. Mesurer dessus
// revenait à mesurer trois ans de vide et à publier le résultat comme s'il valait
// quelque chose.
//
// On rend la PLUS LONGUE suite continue de mois sains, pas seulement un début : BITCOIN
// est troué des deux côtés — 2019-01 à 2022-02, puis de nouveau 2026-08 et 2026-09 —
// et ne vaut qu'entre les deux.
//
// Le balayage est mensuel : Germany40 passe de 59 % de trous en septembre 2021 à 0 % en
// octobre, une granularité annuelle jetterait quinze mois de bonnes données. Un mois
// sous le seuil compte comme sain — les quelques bougies trouées qu'il contient sont
// refusées une par une, ce qui est le comportement voulu.
export function plageExploitable(df, seuilPct = 20) {
  const vide = { debut: df.n ? df.t[0] : 0, fin: df.n ? df.t[df.n - 1] : 0, complete: true };
  const sp = spreadEnPct(df);
  if (!sp || !df.n) return vide;

  const mois = new Map();
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]);
    const k = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!mois.has(k)) mois.set(k, [0, 0]);
    const e = mois.get(k);
    e[0]++;
    if (!(sp[i] > 0)) e[1]++;
  }
  const cles = [...mois.keys()].sort((a, b) => a - b);
  const sain = (k) => { const [n, z] = mois.get(k); return n > 0 && (100 * z) / n < seuilPct; };

  let meilleur = null, courant = null;
  for (const k of cles) {
    if (sain(k)) {
      if (courant === null) courant = { a: k, b: k };
      else courant.b = k;
      if (!meilleur || courant.b - courant.a > meilleur.b - meilleur.a) meilleur = { ...courant };
    } else courant = null;
  }
  if (!meilleur) return { debut: vide.fin, fin: vide.fin, complete: false };

  const debut = Date.UTC(Math.floor(meilleur.a / 12), meilleur.a % 12, 1);
  // fin EXCLUSIVE : le premier instant du mois qui suit le dernier mois sain
  const fin = Date.UTC(Math.floor((meilleur.b + 1) / 12), (meilleur.b + 1) % 12, 1);
  return {
    debut: Math.max(debut, df.t[0]),
    fin: Math.min(fin, df.t[df.n - 1] + 3600000),
    complete: debut <= df.t[0] && fin > df.t[df.n - 1],
  };
}

export function decouper(df, debut, fin) {
  if (debut === undefined && fin === undefined) return df;
  const d0 = debut !== undefined ? debut - AMORCE_JOURS * 86400000 : -Infinity;
  const d1 = fin !== undefined ? fin : Infinity;
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [];
  // Ce qui se passe DANS l'heure suit la découpe comme le reste.
  //
  // Ces six colonnes étaient perdues ici, et `decouper` est appelé sur CHAQUE série
  // chargée par la page : les minutes des extrêmes n'atteignaient donc jamais le moteur
  // dans l'application — seulement dans le harnais en ligne de commande, qui appelle
  // `nettoyer` directement. D'où des bougies déclarées indécidables et une bande large
  // sur une série pourtant exportée avec les colonnes. Le défaut était invisible : rien
  // ne distingue une colonne absente d'une colonne perdue en route.
  const mh = [], mb = [], eh = [], eb = [], ah = [], ab = [], sess = [];
  const aMin = !!df.mh && !!df.mb, aExe = !!df.eh && !!df.eb, aApr = !!df.ah && !!df.ab;
  // La SÉANCE aussi : sans elle, `traitable()` laisse tout passer et le moteur inscrit
  // des entrées à des heures où le courtier refuse l'ordre — sur #HongKong50, deux
  // heures avant l'ouverture de la séance de négociation.
  const aSess = !!df.sess;
  const spSrc = spreadEnPct(df);
  for (let i = 0; i < df.n; i++) {
    if (df.t[i] < d0 || df.t[i] > d1) continue;
    t.push(df.t[i]); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); v.push(df.v[i]);
    if (spSrc) sp.push(spSrc[i] || 0);
    if (aMin) { mh.push(df.mh[i]); mb.push(df.mb[i]); }
    if (aExe) { eh.push(df.eh[i]); eb.push(df.eb[i]); }
    if (aApr) { ah.push(df.ah[i]); ab.push(df.ab[i]); }
    if (aSess) sess.push(df.sess[i]);
  }
  // heuresSession et ecartees suivent la découpe : le robot exporté les lit pour
  // n'agréger que les heures que la mesure a gardées. Les perdre ici rendait ce filtre
  // silencieusement inopérant — le robot agrégeait des bougies que le backtest écartait.
  const n = t.length;
  // `ordreConnu` et `retourConnu` se RECALCULENT sur la découpe : recopier ceux de la
  // série entière décrirait des bougies qu'on vient d'écarter.
  const part = (a, b2) => (a.length === n && n
    ? a.reduce((k, x, i) => k + (x >= 0 && b2[i] >= 0 ? 1 : 0), 0) / n : 0);
  const partPx = (a, b2) => (a.length === n && n
    ? a.reduce((k, x, i) => k + (x > 0 && b2[i] > 0 ? 1 : 0), 0) / n : 0);
  return { t, o, h, l, c, v, n, grain: df.grain,
    heuresSession: df.heuresSession, ecartees: df.ecartees,
    ...(aMin ? { mh, mb, ordreConnu: part(mh, mb) } : { ordreConnu: 0 }),
    ...(aExe ? { eh, eb } : {}),
    ...(aApr ? { ah, ab, retourConnu: partPx(ah, ab) } : { retourConnu: 0 }),
    ...(aSess ? { sess } : {}),
    sessRenseigne: df.sessRenseigne,
    // le spread par bougie suit la découpe, sinon l'entrée retomberait sur la moyenne
    spreadPct: spSrc ? Float32Array.from(sp) : null,
    spreadPctMoyen: df.spreadPctMoyen, spreadRenseigne: df.spreadRenseigne };
}

// Le stop doit valoir plusieurs pas de cotation, sinon il est posé sur la même
// marche que l'entrée : à partir de 4 pas la mesure redevient honnête.
export function serieUtilisable(df, slPct) {
  const g = df && df.grain;
  if (!g) return { ok: true };
  if (g.pasPct * 4 > slPct) return {
    ok: false,
    raison: 'prix arrondis à ' + g.decimales + ' décimales (pas de '
      + g.pasPct.toFixed(2) + ' % du cours, ' + Math.round(g.platesPct)
      + ' % de bougies plates) — trop grossier pour un stop de ' + slPct + ' %',
    grain: g,
  };
  return { ok: true, grain: g };
}

// frais_symboles.csv (séparateur ;) → { symbole: {spread_pct, swap_annuel_pct} }
export async function chargerFrais(url) {
  const txt = await (await fetch(url)).text();
  const lignes = txt.trim().split('\n');
  const cols = lignes[0].replace(/^\uFEFF/, '').split(';').map((x) => x.trim());
  const iSym = cols.indexOf('Symbole'), iSp = cols.indexOf('Spread_pct'), iSw = cols.indexOf('SwapLong_pct_an');
  const table = {};
  for (let i = 1; i < lignes.length; i++) {
    const p = lignes[i].split(';');
    if (p.length <= iSp) continue;
    const sp = parseFloat(p[iSp]), sw = parseFloat(p[iSw]);
    if (Number.isNaN(sp)) continue;
    table[p[iSym].trim()] = { spread_pct: sp, swap_annuel_pct: Number.isNaN(sw) ? 0 : sw, commission_pct: 0 };
  }
  return table;
}

// ---------- lignes ----------
export function ema(src, p) { return memo(src, 'ema|' + p, () => emaBrut(src, p)); }
export function sma(src, p) { return memo(src, 'sma|' + p, () => smaBrut(src, p)); }
export function mediane(df, p) { return memo(df, 'ligne|mediane|' + p, () => medianeBrut(df, p)); }
export function rsi(src, p = 14) { return memo(src, 'rsi|' + p, () => rsiBrut(src, p)); }
export function atr(df, p = 14) { return memo(df, 'atr|' + p, () => atrBrut(df, p)); }
export function adx(df, p = 14) { return memo(df, 'adx|' + p, () => adxBrut(df, p)); }

function emaBrut(src, p) {
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (p + 1);
  let somme = 0;
  for (let i = 0; i < src.length; i++) {
    if (i < p) { somme += src[i]; if (i === p - 1) out[i] = somme / p; continue; }
    out[i] = src[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}
function smaBrut(src, p) {
  const out = new Array(src.length).fill(NaN);
  let somme = 0;
  for (let i = 0; i < src.length; i++) {
    somme += src[i];
    if (i >= p) somme -= src[i - p];
    if (i >= p - 1) out[i] = somme / p;
  }
  return out;
}
// médiane / tenkan / kijun : (plus haut + plus bas) / 2 sur la période
function medianeBrut(df, p) {
  const out = new Array(df.n).fill(NaN);
  for (let i = p - 1; i < df.n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let k = i - p + 1; k <= i; k++) { if (df.h[k] > hi) hi = df.h[k]; if (df.l[k] < lo) lo = df.l[k]; }
    out[i] = (hi + lo) / 2;
  }
  return out;
}
// ---------- mémoire de calcul ----------
// Une ligne ou un indicateur ne dépend que des bougies, de son type et de sa période :
// jamais du stop ni de l'objectif. Sur une grille de 756 combinaisons par instrument, la
// même EMA(20) était donc recalculée 84 fois à l'identique. On la garde en mémoire, avec
// une clé qui contient TOUT ce qui change le résultat (jeu de bougies + type + période).
// La mémoire est attachée au jeu de bougies : elle disparaît avec lui, sans fuite.
const MEM = new WeakMap();
let memLu = 0, memCalc = 0, memActive = true;
function memo(df, cle, calcul) {
  if (!memActive || !df || typeof df !== 'object') return calcul();
  let m = MEM.get(df);
  if (!m) { m = new Map(); MEM.set(df, m); }
  if (m.has(cle)) { memLu++; return m.get(cle); }
  memCalc++;
  const v = calcul();
  m.set(cle, v);
  return v;
}
export function memStats() { return { relus: memLu, calcules: memCalc }; }
export function memRaz() { memLu = 0; memCalc = 0; }
// permet de rejouer un scan à l'identique sans mémoire, pour prouver que le résultat ne bouge pas
export function memActiver(v) { memActive = !!v; }

function ligne(df, nom, p) {
  return memo(df, 'ligne|' + nom + '|' + p, () => {
    if (nom === 'mediane' || nom === 'tenkan' || nom === 'kijun') return medianeBrut(df, p);
    if (nom === 'ma') return smaBrut(df.c, p);
    return emaBrut(df.c, p); // ema / mme
  });
}

// ---------- resampling H1 → H4 / D1 ----------
// mis en mémoire lui aussi : sans cela chaque appel rendrait un NOUVEL objet, et les
// lignes calculées dessus ne pourraient jamais être réutilisées.
export function resampler(df, ut) {
  if (ut === 'H1') return df;
  return memo(df, 'resample|' + ut, () => resamplerBrut(df, ut));
}
function resamplerBrut(df, ut) {
  if (ut === 'H1') return df; // les données de base SONT en H1 : rien à reconstruire
  const bucket = (ms) => {
    const d = new Date(ms);
    if (ut === 'D1') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const h = Math.floor(d.getUTCHours() / 4) * 4;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h);
  };
  const t = [], o = [], h = [], l = [], c = [];
  let cle = null;
  for (let i = 0; i < df.n; i++) {
    const k = bucket(df.t[i]);
    if (k !== cle) { cle = k; t.push(k); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); }
    else {
      const j = t.length - 1;
      if (df.h[i] > h[j]) h[j] = df.h[i];
      if (df.l[i] < l[j]) l[j] = df.l[i];
      c[j] = df.c[i];
    }
  }
  return { t, o, h, l, c, n: t.length, bucket };
}

// aligne une série de l'UT supérieure sur l'index H1 (dernière valeur connue)
function aligner(sup, valeurs, df) {
  const out = new Array(df.n).fill(false);
  let j = 0;
  for (let i = 0; i < df.n; i++) {
    while (j + 1 < sup.n && sup.t[j + 1] <= df.t[i]) j++;
    out[i] = !!valeurs[j];
  }
  return out;
}

// ---------- entrées (règle 5 : décalage d'une bougie) ----------
export function croisementPrix(df, cfg) {
  const li = ligne(df, cfg.ligne, cfg.periode);
  const cross = new Array(df.n).fill(false);
  for (let i = 1; i < df.n; i++) {
    if (isNaN(li[i]) || isNaN(li[i - 1])) continue;
    cross[i] = cfg.vente
      ? (df.c[i] < li[i] && df.c[i - 1] >= li[i - 1])
      : (df.c[i] > li[i] && df.c[i - 1] <= li[i - 1]);
  }
  return decaler(cross);
}
export function rebond(df, cfg) {
  const li = ligne(df, cfg.ligne, cfg.periode);
  const tol = (cfg.tolerance_pct || 0) / 100;
  const s = new Array(df.n).fill(false);
  for (let i = 0; i < df.n; i++) {
    if (isNaN(li[i])) continue;
    s[i] = cfg.vente
      ? (df.h[i] >= li[i] * (1 - tol) && df.c[i] < li[i])
      : (df.l[i] <= li[i] * (1 + tol) && df.c[i] > li[i]);
  }
  return decaler(s);
}
export function croisementLignes(df, cfg) {
  const rapide = ligne(df, cfg.rapide || 'ema', cfg.p_rapide || 9);
  const lente = ligne(df, cfg.lente || 'ema', cfg.p_lente || 26);
  const cross = new Array(df.n).fill(false);
  for (let i = 1; i < df.n; i++) {
    if (isNaN(rapide[i]) || isNaN(lente[i]) || isNaN(rapide[i - 1]) || isNaN(lente[i - 1])) continue;
    cross[i] = cfg.vente
      ? (rapide[i] < lente[i] && rapide[i - 1] >= lente[i - 1])
      : (rapide[i] > lente[i] && rapide[i - 1] <= lente[i - 1]);
  }
  return decaler(cross);
}
// cassure : clôture au-dessus du plus haut des n bougies précédentes
export function cassure(df, cfg) {
  const n = cfg.lookback || 20;
  const s = new Array(df.n).fill(false);
  for (let i = n; i < df.n; i++) {
    let hi = -Infinity;
    for (let k = i - n; k < i; k++) if (df.h[k] > hi) hi = df.h[k];
    s[i] = df.c[i] > hi;
  }
  return decaler(s);
}
function decaler(s) {
  const out = new Array(s.length).fill(false);
  for (let i = 1; i < s.length; i++) out[i] = s[i - 1];
  return out;
}

// lissage de Wilder tel que pandas .ewm(alpha=1/N, adjust=False)
function wilder(src, p) {
  const a = 1 / p, out = new Array(src.length).fill(NaN);
  let prec = null;
  for (let i = 1; i < src.length; i++) {
    const v = Number.isNaN(src[i]) ? 0 : src[i];
    prec = prec === null ? v : prec + a * (v - prec);
    out[i] = prec;
  }
  return out;
}

// ---------- filtres ----------
export function tendanceMtf(df, cfg) {
  const sup = resampler(df, cfg.ut);
  const li = ligne(sup, cfg.ligne || 'tenkan', cfg.periode);
  const cond = new Array(sup.n).fill(false);
  // dernière clôturée. Le sens compte : à la vente à découvert, la tendance de fond
  // attendue est baissière — sans cela le filtre exigeait l'inverse de son but.
  const bas = (cfg.sens || 'au_dessus') !== 'au_dessus';
  for (let i = 1; i < sup.n; i++) {
    if (isNaN(li[i - 1])) continue;
    cond[i] = bas ? sup.c[i - 1] < li[i - 1] : sup.c[i - 1] > li[i - 1];
  }
  return aligner(sup, cond, df);
}
// plage horaire serveur : fin EXCLUSIVE, évaluée sur la bougie de décision (pas de décalage)
export function filtreHoraire(df, cfg) {
  const min = (v) => (typeof v === 'string' ? (+v.split(':')[0]) * 60 + (+(v.split(':')[1] || 0)) : v * 60);
  const debut = min(cfg.debut), fin = min(cfg.fin);
  const out = new Array(df.n).fill(false);
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]);
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    out[i] = debut <= fin ? (m >= debut && m < fin) : (m >= debut || m < fin);
  }
  return out;
}
export function filtreMa(df, cfg) {
  const sup = resampler(df, cfg.ut || 'D1');
  const m = sma(sup.c, cfg.periode);
  const cond = new Array(sup.n).fill(false);
  for (let i = 1; i < sup.n; i++) {
    if (isNaN(m[i - 1])) continue;
    cond[i] = (cfg.sens || 'au_dessus') === 'au_dessus' ? sup.c[i - 1] > m[i - 1] : sup.c[i - 1] < m[i - 1];
  }
  return aligner(sup, cond, df);
}
export function filtreRsi(df, cfg) {
  const sup = (cfg.ut && cfg.ut !== 'H1') ? resampler(df, cfg.ut) : df;
  const r = rsi(sup.c, cfg.periode || 14);
  const cond = new Array(sup.n).fill(false);
  for (let i = 1; i < sup.n; i++) {
    if (isNaN(r[i - 1])) continue;
    cond[i] = (cfg.sens || 'au_dessus') === 'au_dessus' ? r[i - 1] > cfg.seuil : r[i - 1] < cfg.seuil;
  }
  return sup === df ? cond : aligner(sup, cond, df);
}
export function filtreAdx(df, cfg) {
  const sup = (cfg.ut && cfg.ut !== 'H1') ? resampler(df, cfg.ut) : df;
  const v = adx(sup, cfg.periode || 14);
  const cond = new Array(sup.n).fill(false);
  for (let i = 1; i < sup.n; i++) {
    if (isNaN(v[i - 1])) continue;
    cond[i] = (cfg.sens || 'au_dessus') === 'au_dessus' ? v[i - 1] > cfg.seuil : v[i - 1] < cfg.seuil;
  }
  return sup === df ? cond : aligner(sup, cond, df);
}
// nuage : clôture au-dessus du Kumo (Senkou A/B projetés de 26 périodes)
export function filtreNuage(df, cfg) {
  const sup = resampler(df, cfg.ut || 'D1');
  const tk = mediane(sup, 9), kj = mediane(sup, 26), t52 = mediane(sup, 52);
  const cond = new Array(sup.n).fill(false);
  for (let i = 27; i < sup.n; i++) {
    const j = i - 1 - 26;
    const a = (tk[j] + kj[j]) / 2, b = t52[j];
    if (isNaN(a) || isNaN(b)) continue;
    cond[i] = (cfg.sens || 'au_dessus') === 'au_dessus'
      ? sup.c[i - 1] > Math.max(a, b) : sup.c[i - 1] < Math.min(a, b);
  }
  return aligner(sup, cond, df);
}
// pente : la ligne de l'UT supérieure est plus haute qu'il y a N bougies de cette UT
export function filtrePente(df, cfg) {
  const sup = resampler(df, cfg.ut || 'H4');
  const li = ligne(sup, cfg.ligne || 'mediane', cfg.periode || 9);
  const n = cfg.recul || 3;
  const cond = new Array(sup.n).fill(false);
  for (let i = n + 1; i < sup.n; i++) {
    const a = li[i - 1], b = li[i - 1 - n];
    if (isNaN(a) || isNaN(b)) continue;
    cond[i] = (cfg.sens || 'hausse') === 'hausse' ? a > b : a < b;
  }
  return aligner(sup, cond, df);
}
// pivot de la période CLÔTURÉE précédente : (haut + bas + clôture) / 3
export function filtrePivot(df, cfg) {
  const sup = resampler(df, cfg.ut || 'D1');
  const pp = new Array(sup.n).fill(NaN);
  for (let i = 1; i < sup.n; i++) pp[i] = (sup.h[i - 1] + sup.l[i - 1] + sup.c[i - 1]) / 3;
  const out = new Array(df.n).fill(false);
  let j = 0;
  for (let i = 0; i < df.n; i++) {
    while (j + 1 < sup.n && sup.t[j + 1] <= df.t[i]) j++;
    if (isNaN(pp[j])) continue;
    out[i] = (cfg.sens || 'au_dessus') === 'au_dessus' ? df.c[i] > pp[j] : df.c[i] < pp[j];
  }
  return decaler(out);
}

function rsiBrut(src, p = 14) {
  const out = new Array(src.length).fill(NaN);
  let g = 0, pe = 0;
  for (let i = 1; i < src.length; i++) {
    const d = src[i] - src[i - 1];
    const up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    if (i <= p) { g += up; pe += dn; if (i === p) { g /= p; pe /= p; out[i] = 100 - 100 / (1 + g / (pe || 1e-12)); } continue; }
    g = (g * (p - 1) + up) / p; pe = (pe * (p - 1) + dn) / p;
    out[i] = 100 - 100 / (1 + g / (pe || 1e-12));
  }
  return out;
}
function atrBrut(df, p = 14) {
  const tr = new Array(df.n).fill(NaN);
  for (let i = 1; i < df.n; i++) {
    tr[i] = Math.max(df.h[i] - df.l[i], Math.abs(df.h[i] - df.c[i - 1]), Math.abs(df.l[i] - df.c[i - 1]));
  }
  const out = new Array(df.n).fill(NaN);
  let somme = 0;
  for (let i = 1; i < df.n; i++) {
    if (i <= p) { somme += tr[i]; if (i === p) out[i] = somme / p; continue; }
    out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
  }
  return out;
}
// ADX de Wilder : lissage alpha = 1/N partout, y compris sur le DX (miroir MQL5)
function adxBrut(df, p = 14) {
  const plus = new Array(df.n).fill(0), moins = new Array(df.n).fill(0), tr = new Array(df.n).fill(0);
  for (let i = 1; i < df.n; i++) {
    const up = df.h[i] - df.h[i - 1], dn = df.l[i - 1] - df.l[i];
    plus[i] = up > dn && up > 0 ? up : 0;
    moins[i] = dn > up && dn > 0 ? dn : 0;
    tr[i] = Math.max(df.h[i] - df.l[i], Math.abs(df.h[i] - df.c[i - 1]), Math.abs(df.l[i] - df.c[i - 1]));
  }
  const st = wilder(tr, p), sp = wilder(plus, p), sm = wilder(moins, p);
  const dx = new Array(df.n).fill(0);
  for (let i = 1; i < df.n; i++) {
    if (!st[i]) continue;
    const dip = 100 * sp[i] / st[i], dim = 100 * sm[i] / st[i];
    dx[i] = (dip + dim) ? 100 * Math.abs(dip - dim) / (dip + dim) : 0;
  }
  const out = new Array(df.n).fill(NaN);
  let s = 0;
  for (let i = p; i < df.n; i++) {
    if (i < 2 * p) { s += dx[i]; if (i === 2 * p - 1) out[i] = s / p; continue; }
    out[i] = (out[i - 1] * (p - 1) + dx[i]) / p;
  }
  return out;
}

// pas d'entrée au plus haut : la clôture doit rester sous la résistance récente
// (plus haut des N bougies précédentes de l'UT choisie), avec une marge minimale
export function filtreSousResistance(df, cfg) {
  const sup = resampler(df, cfg.ut || 'D1');
  const n = cfg.lookback || 20;
  const marge = 1 - (cfg.marge_pct || 1) / 100;
  const plafond = new Array(sup.n).fill(NaN);
  for (let i = n; i < sup.n; i++) {
    let hi = -Infinity;
    for (let k = i - n; k < i; k++) if (sup.h[k] > hi) hi = sup.h[k];
    plafond[i] = hi;
  }
  const out = new Array(df.n).fill(false);
  let j = 0;
  for (let i = 0; i < df.n; i++) {
    while (j + 1 < sup.n && sup.t[j + 1] <= df.t[i]) j++;
    if (Number.isNaN(plafond[j])) continue;
    out[i] = df.c[i] < plafond[j] * marge;
  }
  return decaler(out);
}

// zone de résistance : un niveau réellement testé plusieurs fois, pas un simple plus haut.
// On repère les sommets locaux (plus haut de ±k bougies), on les regroupe UNE fois par
// proximité, et on ne garde que les niveaux touchés au moins `touches` fois. Une zone
// s'oublie si elle n'est plus retouchée pendant `memoire` bougies de son unité de temps.
export function filtreZoneResistance(df, cfg) {
  const sup = resampler(df, cfg.ut || 'D1');
  const k = cfg.ecart || 3;
  const tol = (cfg.tolerance_pct || 0.5) / 100;
  const touchesMin = cfg.touches || 3;
  const marge = 1 - (cfg.marge_pct || 1) / 100;
  const memoire = cfg.memoire || 250;

  // sommets locaux, disponibles seulement k bougies après leur formation
  const sommets = [];
  for (let i = k; i < sup.n - k; i++) {
    let max = true;
    for (let j = i - k; j <= i + k && max; j++) if (j !== i && sup.h[j] >= sup.h[i]) max = false;
    if (max) sommets.push({ i: i + k, t: sup.t[i + k], niveau: sup.h[i] });
  }

  // regroupement incrémental : chaque zone porte son niveau, ses touches,
  // l'instant où elle devient confirmée et celui où elle s'oublie
  const zones = [];
  for (const s of sommets) {
    let z = null;
    for (const c of zones) {
      if (s.i - c.dernier > memoire) continue;
      if (Math.abs(c.niveau - s.niveau) <= c.niveau * tol) { z = c; break; }
    }
    if (z) {
      z.touches++;
      z.niveau = Math.max(z.niveau, s.niveau);
      z.dernier = s.i;
      z.expire = sup.t[Math.min(sup.n - 1, s.i + memoire)];
      if (z.touches === touchesMin) z.depuis = s.t;
    } else {
      zones.push({ niveau: s.niveau, touches: 1, dernier: s.i, depuis: null,
        expire: sup.t[Math.min(sup.n - 1, s.i + memoire)] });
    }
  }
  const confirmees = zones.filter((z) => z.depuis !== null).sort((a, b) => a.depuis - b.depuis);

  // une seule passe sur les bougies : on maintient les zones actives triées par niveau
  const out = new Array(df.n).fill(false);
  let p = 0;
  const actives = [];
  for (let i = 0; i < df.n; i++) {
    while (p < confirmees.length && confirmees[p].depuis <= df.t[i]) {
      const z = confirmees[p++];
      let q = 0;
      while (q < actives.length && actives[q].niveau < z.niveau) q++;
      actives.splice(q, 0, z);
    }
    for (let q = actives.length - 1; q >= 0; q--) if (actives[q].expire < df.t[i]) actives.splice(q, 1);
    const c = df.c[i];
    // première zone active strictement au-dessus du prix (recherche binaire)
    let lo = 0, hi = actives.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (actives[mid].niveau <= c) lo = mid + 1; else hi = mid; }
    out[i] = !(lo < actives.length && c > actives[lo].niveau * marge);
  }
  return decaler(out);
}

// ---------- backtest ----------
export const ENTREES = {
  croisement_ou_rebond: 'Croisement ou rebond',
  croisement_prix: 'Uniquement croisement',
  rebond: 'Uniquement rebond',
  croisement_lignes: 'Croisement de deux lignes',
  cassure: 'Cassure d\u2019un plus haut',
};
export const LIGNES = { ema: 'MME (EMA)', ma: 'MM (SMA)', mediane: 'Médiane (Tenkan)', kijun: 'Kijun' };

export function signalDe(df, cfg) {
  if (cfg.signal_force) return cfg.signal_force;
  // le sens du trade est porté par la config, pas par l'entrée : une même entrée
  // s'emploie à l'achat comme à la vente, en miroir
  const e = { ...cfg.entree, vente: cfg.sens === 'vente' };
  return memo(df, 'signal|' + e.type + '|' + e.ligne + '|' + e.periode + '|' + (e.vente ? 'v' : 'a'),
    () => signalBrut(df, e));
}
function signalBrut(df, e) {
  if (e.type === 'rebond') return rebond(df, e);
  if (e.type === 'croisement_prix') return croisementPrix(df, e);
  if (e.type === 'croisement_lignes') return croisementLignes(df, { rapide: e.ligne, p_rapide: Math.max(2, Math.round(e.periode / 3)), lente: e.ligne, p_lente: e.periode, vente: e.vente });
  if (e.type === 'cassure') return cassure(df, { lookback: e.periode });
  const a = croisementPrix(df, e), b = rebond(df, e);
  return a.map((x, i) => x || b[i]);
}

// Contrôle du hasard : mêmes prix, mêmes règles de sortie, mais les entrées sont
// placées au hasard. Un avantage réel doit battre ces tirages ; sinon le beau chiffre
// n'est que le meilleur d'un grand nombre d'essais.
export function tirageHasard(df, cfg, nEntrees, tirages, graine) {
  let g = (graine || 1) >>> 0;
  const rnd = () => {
    g += 0x6D2B79F5; let x = g;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const debut = cfg.debut ? Math.max(1, df.t.findIndex((x) => x >= cfg.debut)) : 1;
  const large = Math.max(1, df.n - debut - 1);
  // Une marque tirée pendant une position ouverte est avalée par le moteur : poser
  // nEntrees marques ne donne donc PAS nEntrees trades. Sans correction, le bras
  // hasard joue avec moitié moins de trades et son total est mécaniquement plus bas
  // que le vôtre — un « se distingue » gratuit. On remplit donc jusqu'à obtenir
  // autant de trades RÉALISÉS, puis on tronque au même nombre exactement.
  const tirer = (nMarques) => {
    const sig = new Array(df.n).fill(false);
    let poses = 0, essais = 0;
    const cible = Math.min(nMarques, large);
    while (poses < cible && essais < cible * 60) {
      essais++;
      const i = debut + Math.floor(rnd() * large);
      if (!sig[i]) { sig[i] = true; poses++; }
    }
    return backtester(df, { ...cfg, signal_force: sig, filtres: [] });
  };
  const out = [];
  for (let k = 0; k < tirages; k++) {
    let marques = nEntrees, trades = tirer(marques);
    for (let essai = 0; essai < 6 && trades.length < nEntrees; essai++) {
      // proportionnel au manque, avec une marge : converge en deux passes en pratique
      marques = Math.ceil(marques * Math.max(1.3, nEntrees / Math.max(1, trades.length)));
      if (marques >= large) { marques = large; trades = tirer(marques); break; }
      trades = tirer(marques);
    }
    // troncature répartie plutôt que « les premiers » : garder le début écarterait
    // systématiquement la période la plus récente, donc une époque entière
    let coupe = trades;
    if (trades.length > nEntrees && nEntrees > 0) {
      const pas = trades.length / nEntrees;
      coupe = [];
      for (let j = 0; j < nEntrees; j++) coupe.push(trades[Math.floor(j * pas)]);
    }
    const r = resume(coupe);
    out.push({ ...r, nMarques: marques, nDispo: trades.length });
  }
  return out;
}

// Tableau des bougies autorisées par les filtres. Comme le signal, il ne dépend que
// des filtres — donc il était recalculé à l'identique pour chaque stop, chaque objectif,
// chaque sécurisation et chaque durée de la grille : mille fois le même travail.
// exporté : le harnais doit pouvoir reproduire EXACTEMENT la permission du moteur.
// La recalculer à côté revenait à mesurer une autre configuration — scripts/moment-entree.mjs
// ignorait les filtres, donc mesurait sans eux cinq des huit configurations de référence.
export function autorisePar(df, filtres) {
  const actifs = (filtres || []).filter((f) => f.actif !== false && f.type !== 'delai_bougies');
  if (!actifs.length) return null;
  const cle = 'autorise|' + actifs.map((f) => [f.type, f.ut, f.ligne, f.periode, f.seuil,
    f.sens, f.recul, f.lookback, f.marge_pct, f.touches, f.tolerance_pct, f.memoire,
    f.debut, f.fin, f.ecart].join(',')).join(';');
  return memo(df, cle, () => {
    const out = new Array(df.n).fill(true);
    for (const f of actifs) {
      const s = serieFiltre(df, f);
      if (s) for (let i = 0; i < df.n; i++) out[i] = out[i] && s[i];
    }
    return out;
  });
}
function serieFiltre(df, f) {
  let s = null;
  if (f.type === 'tendance_mtf') s = tendanceMtf(df, f);
    else if (f.type === 'horaire') s = filtreHoraire(df, f);
    else if (f.type === 'ma') s = filtreMa(df, f);
    else if (f.type === 'rsi') s = filtreRsi(df, f);
    else if (f.type === 'adx') s = filtreAdx(df, f);
    else if (f.type === 'nuage') s = filtreNuage(df, f);
    else if (f.type === 'pente') s = filtrePente(df, f);
    else if (f.type === 'pivot') s = filtrePivot(df, f);
    else if (f.type === 'sous_resistance') s = filtreSousResistance(df, f);
    else if (f.type === 'zone_resistance') s = filtreZoneResistance(df, f);
    else throw new Error('Filtre inconnu : ' + f.type);
  return s;
}

export function backtester(df, cfg) {
  const signal = signalDe(df, cfg);
  const autorise = autorisePar(df, cfg.filtres);
  let delai = 0;
  for (const f of cfg.filtres || []) {
    if (f.actif === false) continue;
    if (f.type === 'delai_bougies') { delai = f.n; break; }
  }

  // à la vente, tous les filtres de tendance se lisent en miroir : « au-dessus »
  // devient « en dessous », « hausse » devient « baisse ». Un filtre haussier sur
  // une vente à découvert n'aurait aucun sens.
  const vente = cfg.sens === 'vente';
  const slPct = cfg.sortie.sl.valeur / 100;
  const rr = cfg.sortie.tp.valeur;
  const sec = cfg.sortie.securisation || {};
  const etapes = sec.type === 'be_progressif' ? (sec.etapes || []) : [];
  const trailing = sec.type === 'trailing' ? (sec.distance_pct || 0) / 100 : 0;
  // mode prudent : quand une bougie contient à la fois de quoi sortir en perte et de
  // quoi sécuriser ou gagner, on tranche toujours en défaveur (stop d'abord, palier
  // posé seulement en fin de bougie). Donne la borne basse du résultat.
  const prudent = !!cfg.sortie.prudent;
  // Armer le palier depuis le HAUT de la bougie puis tester le stop contre son BAS
  // suppose que le haut est venu en premier — précisément ce que la bougie ne dit pas.
  // C'était un pis-aller du suivi en Daily, où sans lui aucun point mort n'apparaissait
  // jamais. Sur un suivi H1 il n'a plus lieu d'être : il transforme des gagnants en
  // points morts sur la foi d'un ordre inconnu. `backtesterSuivi` le désactive.
  const armerAvant = cfg.sortie.armer_avant !== false;
  // sortie sur le temps : une position qui n'a atteint ni son stop ni son objectif
  // au bout de N bougies est fermée au cours de clôture. Sans elle, un trade qui
  // stagne paie le portage indéfiniment et immobilise le capital.
  const dureeMax = Math.max(0, Number(cfg.sortie.duree_max) || 0);
  // ————— le spread est payé À L'ENTRÉE, pas déduit après coup —————
  // Les séries exportées de MT5 sont en BID. Un achat est rempli à l'ask, soit le spread
  // au-dessus ; une vente est rendue à l'ask, donc son coût tombe aussi à l'entrée dans le
  // référentiel du trade. Déduire ce coût du R après coup donnait le bon R MOYEN mais
  // plaçait le stop et l'objectif au mauvais endroit : quelques pips suffisent à faire
  // toucher un stop d'un côté et pas de l'autre, et c'est ce qui séparait le backtest du
  // robot MT5 sur le même historique. Le décalage est ici porté par le prix d'entrée, donc
  // par le stop et l'objectif qui en découlent. Exact au second ordre (le terme négligé
  // vaut spread × stop, soit 0,0001 % pour un spread de 0,025 % et un stop de 0,5 %).
  const spreadReleve = Math.max(0, Number((cfg.frais || {}).spread_pct) || 0) / 100;
  // Le spread de LA bougie d'entrée quand la série le porte, la moyenne du relevé sinon.
  // C'est la différence entre payer le spread moyen de la journée et celui de l'heure du
  // rollover, où l'entrée tombe et où il est deux à trois fois plus large.
  // Seau de décision porté par chaque bougie marquée : un signal ne s'exécute qu'UNE
  // fois. Sans cela, marquer toutes les bougies du jour faisait rentrer le moteur à
  // chaque sortie — 1 130 trades au lieu de 538. Le robot remet `seauEnAttente` à -1
  // dès qu'il est entré, et n'y revient plus avant le seau suivant.
  const seauEnt = cfg.signal_seau || null;
  const candidats = cfg.signal_idx || null;
  let pCand = 0;
  let seauEntre = null;

  // MT5 arrondit TOUT prix au tick du symbole — NormalizeDouble(prix, digits) — avant de
  // le poser comme stop ou objectif. Le moteur gardait des flottants bruts, et un stop à
  // 1 576,9098 ne se déclenchait pas sur un bas à 1 576,91 pile.
  //
  // Vu au journal du 6 septembre 2026, GOLD ma 7 du 30 janvier 2020 : palier armé à
  // 1 576,91, la bougie de 08:00 descend exactement à 1 576,91, le robot sort au point
  // mort et le moteur tient jusqu'à 11:00. Le cas n'est pas rare : avec un stop serré,
  // les niveaux de palier tombent souvent sur un tick rond, et c'est précisément là que
  // le prix vient les chercher.
  const pasPrix = df.grain && df.grain.decimales >= 0 ? Math.pow(10, -df.grain.decimales) : 0;
  const auTick = pasPrix > 0 ? (v) => Math.round(v / pasPrix) * pasPrix : (v) => v;

  const spreadSerie = spreadEnPct(df);
  const spreadDe = (i) => {
    if (!spreadSerie) return spreadReleve;
    const v = spreadSerie[i];
    return v > 0 ? v / 100 : spreadReleve;
  };
  const i0 = cfg.debut ? df.t.findIndex((x) => x >= cfg.debut) : 0;
  const depart = i0 < 0 ? df.n : i0;
  // Borne HAUTE des entrées : aucune position n'est ouverte à partir de `fin`, mais
  // celles déjà ouvertes sont suivies jusqu'à leur sortie. Sert aux séries dont la
  // colonne de spread s'arrête avant la fin des cours — sur BITCOIN, août et septembre
  // 2026 n'ont aucun spread, et mesurer dessus revenait à mesurer du vide.
  const finEntrees = Number(cfg.fin) || Infinity;
  const stopMini = Number(cfg.stop_mini) || 0;

  const trades = [];
  let enPos = false, px = 0, sl0 = 0, sl = 0, tp = 0, iEnt = -1, derniere = -1e9, be = 0, plusHaut = 0;
  // Niveaux de palier précalculés pour le trade en cours, seuils croissants.
  //
  // Le calcul ne dépend que de px, sl0, tp et des étapes — tous fixés au moment de
  // l'entrée. Et la butée `Math.min(seuil, parcours)` valait TOUJOURS `seuil` : la
  // boucle ne l'atteignait qu'après avoir écarté `parcours < seuil`. Rien ne dépendait
  // donc du parcours, et tout était pourtant refait à chaque bougie de la position.
  let palierSeuils = null, palierNiveaux = null;
  const preparerPaliers = () => {
    if (!etapes.length) { palierSeuils = null; palierNiveaux = null; return; }
    const tri = [...etapes].sort((a, b) => a[0] - b[0]);
    palierSeuils = new Float64Array(tri.length);
    palierNiveaux = new Float64Array(tri.length);
    for (let k = 0; k < tri.length; k++) {
      const [seuil, niveau] = tri[k];
      // niveau négatif = part du RISQUE encore assumée (−100 = stop initial,
      // −50 = risque réduit de moitié, 0 = point mort) ; positif = part du
      // chemin déjà sécurisée vers l'objectif. Continu en 0.
      let cand = niveau < 0
        ? px + (niveau / 100) * (px - sl0)
        : px + (niveau / 100) * (tp - px);
      // Butée STRICTE, en part du chemin : on ne sécurise jamais autant que
      // le chemin parcouru. Un stop posé pile sur le plus haut touché
      // encaisserait un simple passage intrabar comme un gain acquis.
      const atteint = px + ((seuil * 0.9) / 100) * (tp - px);
      if (d * cand > d * atteint) cand = atteint;
      palierSeuils[k] = seuil;
      palierNiveaux[k] = auTick(cand);
    }
  };
  // Le stop que les paliers JUSTIFIENT, distinct de celui qui est réellement POSÉ.
  //
  // Un stop ne se place que du bon côté du marché : le courtier refuse un stop au-dessus
  // du cours pour un achat, et le robot réessaie tant qu'il refuse. Vu au journal du
  // 18 février 2020 sur GOLD — la bougie de 00:00, hors séance, monte à 1 605,00 et le
  // palier réclame un stop à 1 590,48 ; le prix rouvre à 1 583 et les quatorze heures
  // suivantes plafonnent à 1 589,28. Le robot réémet sa demande CHAQUE MINUTE de 01:00 à
  // 15:00, sans succès, jusqu'à ce que la bougie de 15:00 monte à 1 591,83 — le stop se
  // pose enfin, et se déclenche à 15:40. Le moteur, lui, le posait d'autorité à 00:00 et
  // fermait le trade à 01:00.
  let slVoulu = 0;
  // L'ambiguïté se CUMULE sur toute la durée du trade. Elle n'était relevée que sur la
  // bougie de sortie : un trade traversant trois bougies indécidables et se refermant
  // sur une bougie nette était compté comme certain. Sur GOLD, 132 trades sur 492
  // changent de sortie entre les deux lectures, et le moteur n'en marquait que 6.
  let ambiguTrade = false;

  // remonte le stop d'après le plus haut de la bougie i (trailing ou paliers).
  // Appelée deux fois par bougie : avant le test de sortie quand la bougie est
  // baissière (le plus haut est alors atteint AVANT le plus bas, donc le stop est
  // déjà remonté quand le prix redescend), et en fin de bougie sinon. Sans cela,
  // en Daily, la position sortait presque toujours avant que la sécurisation ait
  // pu s'appliquer : aucun BE n'apparaissait jamais.
  // « mieux » = plus haut à l'achat, plus bas à la vente. Le facteur d unifie les
  // deux : d = +1 à l'achat, −1 à la vente, et toutes les comparaisons deviennent
  // « d × valeur croissante », donc une seule écriture pour les deux sens.
  const d = vente ? -1 : 1;
  let iPlusHaut = -1;
  // Niveau de stop que l'extrême d'une bougie JUSTIFIERAIT, sans rien modifier.
  // Séparé de majSecu parce qu'il faut pouvoir le connaître AVANT de tester la sortie :
  // c'est lui qui décide si la bougie est ambiguë. Rend le stop courant si rien ne bouge.
  const niveauSecu = (extreme) => {
    if (trailing) {
      const haut = d * extreme > d * plusHaut ? extreme : plusHaut;
      const cand = auTick(haut * (1 - d * trailing));
      return d * cand > d * sl ? cand : sl;
    }
    if (!palierSeuils || d * tp <= d * px) return sl;
    const parcours = (extreme - px) / (tp - px) * 100;
    // Les niveaux sont PRÉCALCULÉS à l'entrée — voir `preparerPaliers`. Ils ne
    // dépendent que de px, sl0, tp et des étapes, tous fixés pour la durée du trade ;
    // les recalculer à chaque bougie coûtait 19 % du temps d'un balayage.
    let nouveau = sl;
    for (let k = 0; k < palierSeuils.length; k++) {
      if (parcours < palierSeuils[k]) break;      // seuils croissants : inutile d'aller plus loin
      const cand = palierNiveaux[k];
      if (d * cand > d * nouveau) nouveau = cand;
    }
    return nouveau;
  };

  // Une bougie sans spread n'est pas une bougie bon marché : c'est une bougie ABSENTE,
  // reconstituée par le courtier depuis une unité plus grossière. Le moteur refusait
  // déjà d'y ENTRER — acceptable() exige sp > 0 — mais il continuait d'y lire un haut
  // et un bas pour SORTIR. Sur GOLD c'est un contresens mesurable : la bougie de 00:00
  // englobe le haut ET le bas de TOUTE la journée sur 838 des 1 057 journées concernées,
  // pour 10,7 fois le volume d'une heure ordinaire et 4,4 fois son amplitude. C'est la
  // journée entière déguisée en heure, et le moteur y déclenchait stops et objectifs
  // fantômes : 44 de ses 492 sorties, dont 24 des 84 que le robot place ailleurs.
  //
  // Son OUVERTURE reste un vrai prix à un vrai instant — le gap du week-end s'y lit —
  // mais son haut, son bas et sa clôture appartiennent à la journée, pas à l'heure. On
  // garde donc le test du gap et on ignore le reste. Les extrêmes ne sont pas perdus :
  // les bougies suivantes de la journée les portent (aucune des 1 981 journées de GOLD
  // ne se réduit à sa seule bougie de 00:00). Sans colonne de spread, rien ne change.
  // ————— l'ordre des extrêmes, quand la donnée le porte —————
  //
  // Deux colonnes de l'export — la minute du plus haut et celle du plus bas dans
  // l'heure — suffisent à trancher ce qu'une bougie H1 laissait indécidable. Le chemin
  // d'une bougie est alors : ouverture → premier extrême → second extrême → clôture,
  // et le sort du trade s'en déduit sans convention.
  //
  //   HAUT d'abord : l'objectif s'il est atteint ; sinon le palier s'arme au sommet et
  //                  la descente qui suit le touche s'il est franchi.
  //   BAS d'abord  : l'ancien stop s'il est atteint — le palier n'existe pas encore ;
  //                  sinon la remontée donne l'objectif, ou arme le palier, et seule
  //                  une clôture repassée dessous le fait jouer.
  //
  // À -1 (colonne absente, ou les deux extrêmes dans la même minute) on ne sait pas, et
  // le moteur retombe sur la lecture haute ou basse — en le disant, via `ambigu`.
  const mhCol = df.mh, mbCol = df.mb;
  // L'égalité vaut ignorance, et le test est ICI, pas seulement dans le lecteur de CSV :
  // un df construit à la main — un test, un worker de scan — passerait sinon à côté de
  // la règle, et le moteur lirait « bas d'abord » sur deux extrêmes simultanés.
  // Extrêmes d'EXÉCUTION : ceux que le testeur rejoue. Le signal continue de se lire sur
  // la bougie du courtier — c'est ce que fait le robot, qui appelle CopyRates — mais le
  // stop et l'objectif se jouent sur ce que la M1 a réellement coté.
  //
  // Vu sur GOLD le 21 janvier 2020 : la H1 de 00:00 porte un bas de 1 546,23, sous le
  // stop initial d'une position ouverte le 16. Aucune autre heure de la journée ne
  // descend sous 1 558, et le testeur n'a rien vu — il est sorti au point mort dix
  // heures plus tard. Le moteur y fermait une perte pleine qui n'a jamais eu lieu.
  const exH = df.eh || df.h, exL = df.eb || df.l;

  const minutesConnues = (i) =>
    !!mhCol && !!mbCol && mhCol[i] >= 0 && mbCol[i] >= 0 && mhCol[i] !== mbCol[i];
  const ordreConnuA = (i) => minutesConnues(i);
  // L'extrême FAVORABLE est-il venu en premier ? À l'achat c'est le haut, à la vente le
  // bas — et c'est là que la vente se cassait. Le moteur branchait sur « le haut
  // d'abord » en le traitant comme favorable dans les deux sens : sur une vente, une
  // bougie dont le haut précède le bas prenait le palier alors que le stop, situé
  // AU-DESSUS, était touché en premier.
  //
  // Vu au journal du 6 septembre 2026, #Germany40 vente du 2 mai 2022 : entrée à
  // 13 878,30, stop à 14 017,08 ; la bougie de 10:00 monte à 14 039,79 à la minute 55
  // puis descend à 13 804,89 à la minute 59. Le haut d'abord, donc le stop d'abord — le
  // robot sort à -1,00 R. Le moteur y armait le point mort et inscrivait 0,00 R, une
  // pleine unité de risque d'écart sur ce seul trade.
  const mieuxDAbord = (i) => (vente ? mbCol[i] < mhCol[i] : mhCol[i] < mbCol[i]);
  // L'extrême DÉFAVORABLE atteint après le second extrême de l'heure, quand l'export le
  // fournit — 0 sinon, et 0 veut dire « inconnu », jamais « pas de retour ».
  const ahCol = df.ah, abCol = df.ab;
  const apresSecond = (i) => {
    if (!ahCol || !abCol) return 0;
    const x = vente ? ahCol[i] : abCol[i];
    return x > 0 ? x : 0;
  };

  const reconstituee = bougiesReconstituees(df);
  // HORS SÉANCE : rien ne s'EXÉCUTE, mais le stop CONTINUE de se déplacer.
  //
  // Mesuré sur le journal GOLD du 5 septembre 2026 : des 538 entrées et 538 sorties du
  // robot, AUCUNE ne tombe hors séance de négociation — mais 103 déplacements de palier
  // sur 39 553 s'y font. Le courtier cote encore, le stop suit, et seul l'ORDRE attend
  // la réouverture.
  //
  // Le cas qui l'a révélé : position ouverte le 16 janvier 2020 à 1 556,56, stop
  // 1 547,22. Le 21 à 00:00, hors séance, la bougie monte à 1 568,49 — le palier arme le
  // point mort à 1 556,56 — puis redescend à 1 546,23, sous le stop INITIAL. Le moteur y
  // fermait une perte pleine. Le testeur, lui, n'exécute rien : il sort au point mort à
  // 10:41, dès que le cours revient sur le stop armé, en séance.
  //
  // La M1 n'y est pour rien, et je l'ai cru un temps : vérifié sur les sept instruments
  // et 322 000 bougies, les extrêmes H1 et M1 coïncident partout, cette heure comprise.
  const sessX = df.sess;
  const enSeance = cfg.hors_seance === true ? () => true : (i) => !sessX || sessX[i] !== 0;
  const releve = (reconstituee && cfg.lire_reconstituees === false)
    ? (i) => enSeance(i) && !reconstituee[i]
    : enSeance;

  const majSecu = (i, posable = true) => {
    const extreme = vente ? exL[i] : exH[i];
    if (trailing && d * extreme > d * plusHaut) { plusHaut = extreme; iPlusHaut = i; }
    const nouveau = niveauSecu(extreme);
    if (d * nouveau > d * slVoulu) slVoulu = nouveau;
    // Posé seulement si l'ordre PEUT partir : marché ouvert, et prix repassé au-delà du
    // niveau. Sinon le courtier refuse et la demande reste en attente — c'est ce que
    // fait le robot, qui la réémet à chaque tick jusqu'à ce qu'elle passe.
    if (posable && d * slVoulu > d * sl && d * extreme >= d * slVoulu) {
      sl = slVoulu;
      be = trailing ? 1 : (d * sl > d * px ? 2 : 1);
    }
  };

  for (let i = Math.max(depart, 1); i < df.n; i++) {
    if (enPos) {
      // Hors séance : le stop suit, l'ordre attend. `majSecu` d'abord, aucune sortie
      // ensuite — c'est ce que fait le testeur, vérifié sur 538 sorties dont aucune
      // hors séance et 103 paliers qui, eux, s'y déplacent.
      if (!releve(i)) { majSecu(i, false); continue; }
      // Un stop en attente se pose dès l'OUVERTURE quand le cours y est déjà au-delà :
      // la modification part au premier tick, avant tout mouvement de la bougie. Ne
      // tester que l'extrême de la bougie la retardait d'une heure — et sur GOLD le
      // 23 janvier 2020, cette heure a coûté quatre R. Le palier armé la veille à
      // 1 558,57 hors séance, la bougie de 01:00 ouvre à 1 558,65 : le stop se pose,
      // puis le bas à 1 558,41 le déclenche. Le robot sort là, à 01:00 ; le moteur
      // attendait 04:00, et n'entrait le trade suivant qu'à 05:00 au lieu de 02:00.
      if (d * slVoulu > d * sl && d * df.o[i] > d * slVoulu) {
        sl = slVoulu;
        be = trailing ? 1 : (d * sl > d * px ? 2 : 1);
      }
      // gap : le SL est un ordre stop, exécuté au cours d'ouverture
      // (rien ne peut être sécurisé avant l'ouverture)
      if (d * df.o[i] <= d * sl) {
        const gap = vente ? df.o[i] > exH[i - 1] : df.o[i] < exL[i - 1];
        const motif = be >= 2 ? 'be2' : be >= 1 ? 'be' : (gap ? 'sl_gap' : 'sl');
        trades.push(clore(df, iEnt, i, px, df.o[i], sl0, motif, be, ambiguTrade, vente));
        enPos = false; continue;
      }
      // « bougie favorable » : haussière à l'achat, baissière à la vente — c'est elle
      // qui décide si l'extrême favorable est atteint avant le stop
      const haussiere = d * (df.c[i] - df.o[i]) >= 0;
      if (!haussiere && !prudent && armerAvant) majSecu(i);
      const ordre = (haussiere || prudent) ? ['sl', 'tp'] : ['tp', 'sl'];
      // bougie ambiguë : elle contient le stop ET l'objectif. L'ordre réel des
      // mouvements y est inconnu, donc le sort du trade est décidé par une
      // convention, pas par la donnée. Compté pour pouvoir le dire.
      const pire = vente ? exH[i] : exL[i], mieux = vente ? exL[i] : exH[i];
      // Stop que l'extrême de CETTE bougie justifie. Une bougie peut monter assez pour
      // armer un palier PUIS redescendre le toucher : la H1 ne dit pas dans quel ordre.
      // Le moteur ne le voyait pas — il testait la sortie avec l'ancien stop, encaissait
      // l'objectif, et n'armait qu'ensuite. Mesuré sur BITCOIN le 23 avril 2025 : haut
      // 94 036 (objectif 92 920 atteint) et bas 90 954 (point mort 91 098 touché) dans la
      // MÊME heure. Le moteur inscrivait +2,00 R, le testeur 0,00 R.
      const voulu = niveauSecu(mieux);
      const cible = d * voulu > d * slVoulu ? voulu : slVoulu;
      // posable seulement si le cours de cette bougie repasse dessus
      const slArme = (d * mieux >= d * cible) ? cible : sl;
      // Bougie AMBIGUË : celle dont l'issue dépend de l'ORDRE des mouvements, que la
      // H1 ne dit pas. Deux familles, et l'ancienne condition n'en voyait qu'une.
      //
      //   · le stop ET l'objectif sont tous deux atteints — cas classique ;
      //   · la bougie ARME un palier et redescend jusqu'à lui. Montée d'abord :
      //     le stop a bougé et la sortie se fait au point mort. Descente d'abord :
      //     le palier n'était pas encore posé, et la bougie se referme sans sortie,
      //     ou sur l'ancien stop si elle va jusque-là.
      //
      // La seconde manquait, et elle est de loin la plus fréquente : sur GOLD,
      // 132 trades sur 492 changent de sortie entre lecture haute et lecture basse —
      // 27 %, pour 79,2 R d'écart — alors que le moteur n'en marquait que 6. Annoncer
      // « 6 trades indécidables » sur une mesure dont un quart des sorties dépend d'une
      // convention, c'est vendre une précision qui n'existe pas.
      //
      // Vu au journal du robot le 7 avril 2020 : entrée 1 660,31, stop 1 650,35 ; à
      // 10:00 la bougie monte à 1 668,69, arme le point mort (parcours 28 %) et
      // redescend le toucher — le robot sort à 0,00, le moteur inscrivait -1 R.
      //
      // ————— issues ADMISSIBLES de la bougie, et lecture haute ou basse entre elles —————
      //
      // On énumère ce que la bougie AUTORISE, au lieu de supposer un ordre unique. Une
      // issue est admissible s'il existe un chemin allant de l'ouverture à la clôture,
      // touchant le haut et le bas, qui la produise :
      //
      //   objectif    si l'extrême favorable l'atteint ;
      //   stop armé   si la bougie arme un palier et redescend jusqu'à lui ;
      //   ancien stop si l'extrême défavorable l'atteint — la descente d'abord, le
      //               palier pas encore posé ;
      //   aucune      si le prix peut avoir touché le stop armé AVANT de l'armer, et
      //               n'être jamais revenu ensuite.
      //
      // La CLÔTURE tranche une partie de l'indécision, et le moteur l'ignorait. Si la
      // bougie ferme au-delà du stop armé, le prix y est forcément repassé APRÈS
      // l'extrême qui a armé le palier : la sortie au stop armé devient certaine, et
      // « aucune issue » cesse d'être admissible. C'est une déduction, pas une
      // convention — et elle resserre la bande sans rien inventer.
      // Un palier armé PAR CETTE BOUGIE prend effet dedans : le robot envoie sa demande
      // au tick qui suit l'extrême et elle passe la plupart du temps. Reporter l'effet à
      // la bougie suivante rapproche les TOTAUX (BITCOIN -17,4 → -23,2 contre -34,8 au
      // robot, GOLD 37,3 → 34,8 contre 34,5) mais éloigne chaque trade pris un par un —
      // sorties divergentes 21 → 37 sur GOLD, 35 → 58 sur BITCOIN. C'est une compensation,
      // pas une modélisation plus fidèle : on garde la règle qui colle bougie par bougie.
      const armeActif = slArme !== sl && d * pire <= d * slArme;
      // la clôture est au-delà du stop armé : le retour a eu lieu après l'armement
      const armeCertain = slArme !== sl && d * df.c[i] <= d * slArme;
      const okTp = d * mieux >= d * tp;
      const okVieux = d * pire <= d * sl;
      // « aucune sortie » suppose qu'AUCUN niveau actif n'a été franchi. L'objectif et
      // l'ancien stop le sont dès l'ouverture de la bougie : les atteindre ferme le
      // trade, quel que soit l'ordre. Seul le stop ARMÉ peut être franchi sans effet,
      // parce qu'il n'existe pas encore quand le prix passe dessous.
      const okRien = !okVieux && !okTp && !armeCertain;
      const issues = (okTp ? 1 : 0) + (armeActif ? 1 : 0) + (okVieux ? 1 : 0) + (okRien ? 1 : 0);
      const ambigu = issues > 1;
      // `indecis` : l'ordre des extrêmes est connu ET ne tranche pas. Voir plus bas.
      let indecis = false;
      ambiguTrade = ambiguTrade || (ambigu && !ordreConnuA(i));

      // Lecture HAUTE : la meilleure issue admissible — l'objectif, sinon laisser
      // courir, sinon le stop armé, et l'ancien stop en dernier recours.
      // Lecture BASSE : la pire — l'ancien stop d'abord, puis le stop armé, puis
      // laisser courir, l'objectif seulement s'il ne reste que lui.
      //
      // L'ancienne règle était inversée sur la famille des paliers : elle testait
      // l'ANCIEN stop en lecture haute, si bien qu'une bougie qui armait le point mort
      // et redescendait sortait à -1 R du côté « favorable » et à 0 R du côté
      // « défavorable ». Vu au journal du robot le 7 avril 2020 : entrée 1 660,31,
      // stop 1 650,35 ; à 10:00 la bougie monte à 1 668,69, arme le point mort
      // (parcours 28 %), redescend le toucher — le robot sort à 0,00 et le moteur
      // inscrivait -1 R alors qu'il se disait en lecture haute.
      let sortie = null;
      if (ambigu && ordreConnuA(i)) {
        // l'ordre est connu : plus de convention, la bougie se lit comme elle s'est
        // déroulée
        if (mieuxDAbord(i)) {
          if (okTp) sortie = ['tp', tp];
          else if (armeActif) sortie = ['sl', slArme];
          else if (okVieux) sortie = ['sl', sl];
        } else {
          if (okVieux) sortie = ['sl', sl];
          else if (okTp) sortie = ['tp', tp];
          else if (armeCertain) sortie = ['sl', slArme];
          // Connaître l'ORDRE des deux extrêmes ne suffit pas ici, et c'est le dernier
          // résidu face au testeur. L'extrême défavorable est passé le PREMIER, avant
          // que le palier n'existe : il ne ferme rien. Le palier s'arme ensuite, sur
          // l'extrême favorable. Entre cet extrême et la clôture, le prix a pu
          // redescendre toucher le palier puis remonter — deux extrêmes et une clôture
          // ne peuvent pas le dire, et la clôture au-dessus du palier ne le réfute pas.
          // Le moteur supposait « non » en silence, ce qui est un pari optimiste ; il
          // le déclare maintenant indécidable, et les deux lectures en prennent les
          // bornes comme partout ailleurs.
          else if (armeActif) {
            // `bas_apres` / `haut_apres` : l'extrême défavorable atteint APRÈS le second
            // extrême de l'heure. Il tranche dans UN sens, et c'est le sens utile.
            //
            // S'il dépasse le palier, le retour a bien eu lieu après l'armement — c'est
            // une preuve, pas une convention : le palier s'arme au plus tard sur
            // l'extrême favorable, qui ouvre la fenêtre. Les DEUX lectures sortent alors
            // au palier, et la bande se resserre sur le chiffre du testeur.
            //
            // S'il ne le dépasse pas, on ne conclut PAS l'inverse : le doute subsiste
            // sur le seul intervalle allant de l'armement à l'extrême favorable, que ces
            // colonnes ne couvrent pas. La bougie reste indécidable — c'est ce qui
            // sépare une donnée d'un pari.
            const apres = apresSecond(i);
            if (apres && d * apres <= d * slArme) sortie = ['sl', slArme];
            else { indecis = true; if (prudent) sortie = ['sl', slArme]; }
          }
        }
      } else if (prudent) {
        if (okVieux) sortie = ['sl', sl];
        else if (armeActif) sortie = ['sl', slArme];
        else if (!okRien && okTp) sortie = ['tp', tp];
      } else {
        if (okTp) sortie = ['tp', tp];
        else if (!okRien) sortie = armeActif ? ['sl', slArme] : (okVieux ? ['sl', sl] : null);
      }
      void ordre;
      ambiguTrade = ambiguTrade || indecis;
      if (sortie) {
        let motif = sortie[0];
        if (motif === 'sl') {
          // le palier armé PAR cette bougie compte : sans ça, une sortie au point mort
          // se serait étiquetée « sl » et aurait fait croire à une perte pleine
          const niv = d * sortie[1] > d * px ? 2 : d * sortie[1] > d * sl0 ? 1 : 0;
          const b = Math.max(be, niv);
          motif = b >= 2 ? 'be2' : b >= 1 ? 'be' : 'sl';
        }
        const tr = clore(df, iEnt, i, px, sortie[1], sl0, motif, be, ambiguTrade, vente);
        // Sortie qui repose sur un palier armé DANS la bougie où elle tombe : le prix a
        // pu repasser une seconde fois par ce niveau sans que l'ordre des deux extrêmes
        // le dise. C'est le seul résidu qui subsiste face au testeur, et il est
        // OPTIMISTE — mesuré de 0,003 à 0,06 R par trade selon l'instrument, contre
        // 0,0007 sans aucun palier. On le compte pour pouvoir l'annoncer.
        if (armeActif) tr.palierDansBougie = true;
        // sortie par le stop dans la bougie même qui a fixé le plus haut : le gain
        // suppose que le stop a suivi le sommet tick par tick, ce que H1 ne dit pas
        if (trailing && sortie[0] === 'sl' && i === iPlusHaut) tr.sommet = true;
        trades.push(tr);
        enPos = false; continue;
      }
      if (dureeMax && (i - iEnt) >= dureeMax) {
        trades.push(clore(df, iEnt, i, px, df.c[i], sl0, 'temps', be, ambiguTrade, vente));
        enPos = false; continue;
      }
      majSecu(i);
      continue;
    }

    // Hors position, seules les bougies CANDIDATES peuvent produire quelque chose. Les
    // parcourir toutes coûtait 46 % du temps d'un balayage : quarante-six mille tours de
    // boucle pour, la plupart du temps, quatre comparaisons et un `continue`. La liste
    // est fournie par `backtesterSuivi` et triée ; on saute d'une candidate à l'autre.
    if (candidats) {
      while (pCand < candidats.length && candidats[pCand] < i) pCand++;
      if (pCand >= candidats.length) break;
      if (candidats[pCand] > i) { i = candidats[pCand] - 1; continue; }
    }
    if (df.t[i] >= finEntrees) continue;
    if (!signal[i] || (autorise && !autorise[i])) continue;
    if (seauEnt && seauEnt[i] === seauEntre) continue;   // ce signal a déjà été joué
    if (delai && (i - derniere) < delai) continue;

    px = auTick(df.o[i] * (1 + d * spreadDe(i)));
    sl0 = auTick(px * (1 - d * slPct));
    // Distance minimale de stop imposée par le courtier (StopsLevel × Point), en unités
    // de PRIX et non en pourcentage : il refuse l'ordre en dessous. C'est une distance
    // absolue, donc son poids relatif dépend du cours — sur BITCOIN elle vaut 200,00,
    // soit 0,25 % à 81 000 mais 1,00 % à 20 000. Un stop de 1 % était donc pile à la
    // limite pendant tout 2022, et le testeur a refusé 928 ordres « invalid stops » sur
    // 2022-2023 et aucun ensuite. Le moteur les comptait tous.
    //
    // Mesurée depuis df.o[i], le cours SANS le spread : le courtier compare le stop au
    // BID, pas au prix d'entrée qui inclut le spread. Les chiffres du journal le
    // disent — plus petite distance acceptée 248,36, plus grande refusée 260,30, pour
    // un minimum annoncé de 200,00. L'écart est exactement le spread de l'instrument.
    if (stopMini > 0 && Math.abs(df.o[i] - sl0) < stopMini) continue;
    sl = sl0;
    tp = auTick(px + (px - sl0) * rr);
    preparerPaliers();
    enPos = true; iEnt = i; derniere = i; be = 0; plusHaut = vente ? exL[i] : exH[i];
    slVoulu = sl0;
    ambiguTrade = false;
    if (seauEnt) seauEntre = seauEnt[i];
    iPlusHaut = i;

    // la bougie d'entrée peut déjà toucher SL ou TP — et, si elle est baissière,
    // avoir sécurisé la position avant d'y redescendre
    const haussiere = d * (df.c[i] - df.o[i]) >= 0;
    if (!haussiere && !prudent && armerAvant) majSecu(i);
    const pire0 = vente ? exH[i] : exL[i], mieux0 = vente ? exL[i] : exH[i];
    // Même règle que sur les bougies suivantes : la bougie d'entrée peut monter assez
    // pour armer un palier PUIS redescendre le toucher, et la H1 ne dit pas dans quel
    // ordre. C'est le cas le plus fréquent, l'entrée et le palier tombant dans la même
    // heure — sur BITCOIN, 31 trades sur 420 contre 2 comptés auparavant.
    const voulu0 = niveauSecu(mieux0);
    const cible0 = d * voulu0 > d * slVoulu ? voulu0 : slVoulu;
    const slArme0 = (d * mieux0 >= d * cible0) ? cible0 : sl;
    // MÊME énumération que sur les bougies suivantes. Elle était différente ici — ancien
    // ordre supposé, ancien stop testé — si bien que la bougie d'entrée et les autres
    // n'obéissaient pas à la même règle dans la même fonction.
    const armeActif0 = slArme0 !== sl && d * pire0 <= d * slArme0;
    const armeCertain0 = slArme0 !== sl && d * df.c[i] <= d * slArme0;
    const okTp0 = d * mieux0 >= d * tp;
    const okVieux0 = d * pire0 <= d * sl;
    const okRien0 = !okVieux0 && !okTp0 && !armeCertain0;
    const ambigu0 = ((okTp0 ? 1 : 0) + (armeActif0 ? 1 : 0) + (okVieux0 ? 1 : 0) + (okRien0 ? 1 : 0)) > 1;
    ambiguTrade = ambiguTrade || (ambigu0 && !ordreConnuA(i));
    let indecis0 = false;
    let sortie0 = null;
    if (ambigu0 && ordreConnuA(i)) {
      if (mieuxDAbord(i)) {
        if (okTp0) sortie0 = ['tp', tp];
        else if (armeActif0) sortie0 = ['sl', slArme0];
        else if (okVieux0) sortie0 = ['sl', sl];
      } else {
        if (okVieux0) sortie0 = ['sl', sl];
        else if (okTp0) sortie0 = ['tp', tp];
        else if (armeCertain0) sortie0 = ['sl', slArme0];
        // Même indécidable que sur les bougies suivantes, et il faut le traiter ICI
        // aussi : l'entrée et l'armement du palier tombent le plus souvent dans la même
        // heure. Le laisser au seul cas général reviendrait à appliquer deux règles
        // différentes dans la même fonction — l'erreur que ce bloc avait déjà commise.
        else if (armeActif0) {
          // même preuve, même réserve, sur la bougie d'entrée
          const apres0 = apresSecond(i);
          if (apres0 && d * apres0 <= d * slArme0) sortie0 = ['sl', slArme0];
          else { indecis0 = true; if (prudent) sortie0 = ['sl', slArme0]; }
        }
      }
    } else if (prudent) {
      if (okVieux0) sortie0 = ['sl', sl];
      else if (armeActif0) sortie0 = ['sl', slArme0];
      else if (!okRien0 && okTp0) sortie0 = ['tp', tp];
    } else {
      if (okTp0) sortie0 = ['tp', tp];
      else if (!okRien0) sortie0 = armeActif0 ? ['sl', slArme0] : (okVieux0 ? ['sl', sl] : null);
    }
    ambiguTrade = ambiguTrade || indecis0;
    if (sortie0) {
      if (sortie0[0] === 'sl') {
        const niv = d * sortie0[1] > d * px ? 2 : d * sortie0[1] > d * sl0 ? 1 : 0;
        const b = Math.max(be, niv);
        trades.push(clore(df, i, i, px, sortie0[1], sl0, b >= 2 ? 'be2' : b >= 1 ? 'be' : 'sl', b, ambiguTrade, vente));
      } else {
        trades.push(clore(df, i, i, px, tp, sl0, 'tp', 0, ambiguTrade, vente));
      }
      enPos = false;
    }
    if (enPos) majSecu(i);
    void haussiere;
  }

  // frais, rapportés au risque du trade
  const frais = cfg.frais || {};
  const contrat = Number(frais.contrat) || 0;
  const swapLot = frais.swap_long !== undefined || frais.swap_short !== undefined;
  for (const tr of trades) {
    const slP = Math.abs(tr.entree - tr.sl_initial) / tr.entree * 100;
    // le spread n'est plus déduit ici : il est déjà dans le prix d'entrée, et donc dans
    // le R du trade. Le compter deux fois doublerait le coût réel.
    // `commission_pct` est un tarif PAR JAMBE, en % du notionnel : d'où le × 2.
    // `commission_par_lot` est déjà l'ALLER-RETOUR, dans la devise du symbole — c'est
    // ainsi qu'on le mesure sur le journal, qui somme les deux opérations de la
    // position. Sur GOLD : 6,95 par lot, ajustement R² 0,93 ; le même tarif exprimé en
    // pourcentage du notionnel donne R² -1,63, c'est-à-dire pire que la moyenne.
    const comm = (frais.commission_pct || 0) * 2 / slP
      + (contrat > 0 ? (Number(frais.commission_par_lot) || 0) / (contrat * Math.abs(tr.entree - tr.sl_initial)) : 0);
    let swap;
    if (swapLot && contrat > 0) {
      // ————— modèle exact, calibré sur le journal du robot —————
      // Le courtier facture un MONTANT par lot et par nuit (SYMBOL_SWAP_LONG/SHORT),
      // pas un pourcentage annuel du notionnel. La différence n'est pas de forme : sur
      // GOLD, le taux annuel équivalent va de 12 %/an à 1 800 $ l'once à 4,8 %/an à
      // 4 470 $, et le modèle en pourcentage se trompait donc d'un facteur 2,5 sur la
      // durée de la mesure. Mesuré sur les 174 trades de GOLD portant au moins une nuit,
      // journal du 4 septembre 2026 : le coût par lot et par nuit reste à -60 de 2020 à
      // 2026 pendant que le prix passe de 1 800 à 4 675, et le taux annuel équivalent
      // s'effondre de 11,8 % à 4,5 %. C'est bien un montant, pas un taux.
      //
      // En R, la conversion de devise s'annule : le swap et le risque sont tous deux
      // convertis au même cours. Compte en EUR, symbole en USD, et le rapport mesuré /
      // prédit vaut 1,0000 (p10 0,9965, p90 1,0038) sur 129 trades.
      //
      //   swap_R = |swap par lot| × nuits / (taille du contrat × |entrée − stop|)
      //
      // Le sens compte : le courtier déclare les deux valeurs et elles ne sont pas
      // symétriques — GOLD paie -67,90 à l'achat et CRÉDITE +27,00 à la vente. Un signe
      // positif est un crédit réel, on le garde tel quel.
      const parLot = tr.sens === 'vente'
        ? (Number(frais.swap_short) || 0)
        : (Number(frais.swap_long) || 0);
      swap = -parLot * nuitsPortage(tr.entree_t, tr.sortie_t)
        / (contrat * Math.abs(tr.entree - tr.sl_initial));
    } else {
      // repli : taux annuel du notionnel (modes 5 et 6 de MT5, « intérêt annuel »), et
      // tout symbole dont on n'a pas relevé le montant par lot.
      const nuits = (tr.sortie_t - tr.entree_t) / 86400000;
      // Sans relevé du swap court, on garde le coût, jamais le crédit : la plupart des
      // courtiers facturent le portage dans les DEUX sens.
      const brut = Number(frais.swap_annuel_pct) || 0;
      const taux = (tr.sens === 'vente') ? -Math.abs(brut) : brut;
      swap = -(taux / 360) * nuits / slP;
    }
    tr.R_net = tr.R - comm - swap;
  }
  return trades;
}

// Nuits de portage facturées entre deux instants, sur l'horloge du serveur.
//
// Trois règles, chacune mesurée sur le journal GOLD du 4 septembre 2026 plutôt que
// supposée. On compare, pour chaque règle, le swap prédit au swap réellement facturé,
// et on retient celle dont le rapport est le moins dispersé :
//
//   toutes les nuits, jeudi ×3           étalement p90/p10 ×3,14
//   hors samedi/dimanche, jeudi ×3       étalement ×1,14   ← retenue
//   hors samedi/dimanche, sans triple    étalement ×3,16
//   hors samedi, jeudi ×3                étalement ×2,09
//
// Le triple tombe au minuit du JEUDI, pas du mercredi : sur les trades ne franchissant
// qu'un seul minuit, le facteur mesuré vaut 2,73 au jeudi et 0,88 à 0,92 les autres
// jours — un rapport de 3,08. Il est stable de 2020 à 2025 (2,53 à 2,77).
// Le week-end n'est pas facturé : les compter multipliait le coût par trois sur les
// positions tenues du vendredi au lundi.
export function nuitsPortage(debut, fin) {
  let n = 0;
  for (let j = Math.ceil(debut / 86400000); j <= Math.floor(fin / 86400000); j++) {
    const jour = new Date(j * 86400000).getUTCDay();
    if (jour === 0 || jour === 6) continue;      // samedi et dimanche : pas de portage
    n += jour === 4 ? 3 : 1;                     // le minuit du jeudi porte trois nuits
  }
  return n;
}

// ---------- suivi de la position sur la H1 ----------
// Le signal reste lu sur la clôture de l'unité de décision (D1 ou H4) : invariants 2, 3
// et 5 intacts. Seul change le pas auquel le stop, l'objectif et les paliers sont
// surveillés — la bougie journalière ne dit que O/H/L/C, donc l'ordre des mouvements y
// est inconnu et le moteur doit trancher par convention. Sur la H1 cette part
// indécidable s'effondre (mesuré : 12 % des trades → 3 % sur GOLD, 19 % → 4 % sur
// BITCOIN), et le résultat cesse d'être systématiquement optimiste.
//
// Aucune donnée supplémentaire n'est requise : les H1 SONT les données de base
// (invariant 1). Les filtres restent évalués sur la bougie de décision, pas sur la H1 :
// la bascule ne doit changer que le suivi, sinon on comparerait deux règles.
export function backtesterSuivi(df, cfg, ut) {
  if (!ut || ut === 'H1') return backtester(df, cfg);
  const sup = resampler(df, ut);
  const signal = signalDe(sup, cfg);
  const autorise = autorisePar(sup, cfg.filtres);
  const seau = sup.bucket;
  if (!seau) return backtester(sup, cfg); // repli : série déjà agrégée, rien à reporter

  // Première bougie H1 EXÉCUTABLE de chaque seau : l'ouverture qui suit la clôture du
  // signal (invariant 5), sauf quand le robot refuserait l'ordre. `InpPasDebutSemaine`
  // (robot-mt5.js) interdit le dimanche et le lundi avant 02:00 ; le signal n'est pas
  // perdu pour autant, il est réessayé sur les ticks suivants du MÊME seau. Sans cette
  // règle, Simula entrait deux heures et un mouvement de prix avant le robot — mesuré :
  // 90 trades sur 434 concernés sur BITCOIN, 51 sur 489 sur GOLD.
  const pasDebutSemaine = cfg.pas_debut_semaine !== false;
  const executable = (i) => {
    if (!pasDebutSemaine) return true;
    const d = new Date(df.t[i]);
    const j = d.getUTCDay();
    if (j === 0) return false;
    return !(j === 1 && d.getUTCHours() < 2);
  };
  // Plafond de spread : on n'entre pas sur la bougie du rollover, où le spread vaut
  // trois à huit fois sa normale. Le signal n'est pas perdu, il attend la première
  // bougie du MÊME jour qui repasse sous le plafond — c'est exactement ce que fait le
  // robot, qui garde le seau en attente et réessaie aux ticks suivants (InpSpreadMaxPct).
  // Quand aucune bougie du jour ne passe, les deux renoncent : le repli sur la première
  // bougie ferait entrer Simula là où le robot n'entre pas (mesuré à 1,5× : 0 à 2 % des
  // signaux sur cinq instruments, 30 % sur BITCOIN dont le spread est très large).
  const facteur = Number(cfg.spread_max_facteur) || 0;
  const seuil = facteur > 0 ? seuilSpread(df, facteur) : null;
  const sp = seuil ? spreadEnPct(df) : null;
  // Le spread jugé est celui de la bougie sur laquelle on entre — le même que le moteur
  // fait déjà PAYER à l'entrée (spreadDe). Ce n'est pas un regard en avant : c'est le
  // champ `spread` de MqlRates, que le robot lit en direct sur la bougie en cours au
  // moment où il place l'ordre. Le lire sur la bougie précédente, en revanche, rend le
  // plafond aveugle : le pic du rollover est DANS la bougie de 00:00, la bougie de
  // 23:00 est normale, et le plafond ne refusait plus rien.
  // Deux conditions distinctes, et il faut les deux. Le spread dit ce que l'entrée COÛTE ;
  // la séance dit si l'ordre PEUT partir. Sur #HongKong50 les bougies de 03:00 et 04:00
  // portent un spread normal — 0,080 % et 0,019 %, sous le plafond — et l'ordre y est
  // pourtant refusé : la séance de négociation ouvre après la séance de cotation. Le
  // moteur y inscrivait un prix que personne ne pouvait traiter, deux heures avant
  // l'entrée réelle du robot.
  const sess = df.sess;
  const traitable = (i) => !sess || sess[i] !== 0;
  const sousPlafond = (i) => !seuil || seuil[i] <= 0 || (sp[i] > 0 && sp[i] <= seuil[i]);
  // Fenêtre horaire d'ENTRÉE — troisième condition, du même genre que les deux autres :
  // elle porte sur la bougie où l'ordre part, pas sur la bougie de décision. Un filtre
  // `horaire` ordinaire ne peut pas faire ce travail : sur une décision D1 il est
  // évalué sur la série agrégée, dont toutes les bougies sont à 00:00 — il garderait
  // tout ou ne garderait rien. Ici le signal n'est pas perdu quand l'heure est exclue,
  // il attend la première bougie du MÊME jour qui rentre dans la fenêtre, exactement
  // comme sous le plafond de spread. Bornes en heures serveur, fin EXCLUSIVE, et le
  // passage par minuit est admis (22 → 6).
  const fenH = cfg.heures_entree;
  const hD = fenH ? Number(fenH.debut) : 0, hF = fenH ? Number(fenH.fin) : 0;
  const dansFenetre = !fenH || !Number.isFinite(hD) || !Number.isFinite(hF) || hD === hF
    ? () => true
    : (i) => {
      const h = new Date(df.t[i]).getUTCHours();
      return hD < hF ? (h >= hD && h < hF) : (h >= hD || h < hF);
    };
  const acceptable = (i) => traitable(i) && sousPlafond(i) && dansFenetre(i);

  // Les bougies H1 exécutables de chaque seau. Ce tableau ne dépend QUE de la série et
  // de l'unité de décision — jamais de la configuration — et il était pourtant reconstruit
  // à chaque appel : 46 000 bougies parcourues, deux objets `Date` créés par bougie
  // (`executable` puis `seau`), soit vingt millions d'allocations sur un balayage de deux
  // cents configurations. Mémoïsé, le suivi H1 passe de 8,3 s à 2,4 s sur 216
  // configurations de GOLD — le même chiffre, trois fois et demie plus vite.
  const parSeau = memo(df, 'parSeau|' + ut + '|' + (pasDebutSemaine ? 1 : 0), () => {
    const m = new Map();
    for (let i = df.n - 1; i >= 0; i--) {
      if (!executable(i)) continue;
      const b = seau(df.t[i]);
      let l = m.get(b);
      if (!l) { l = []; m.set(b, l); }
      l.push(i);
    }
    return m;
  });
  // Tableaux typés : deux allocations de 46 000 cases par configuration, et un
  // `Array().fill(false)` coûte plusieurs fois un `Uint8Array`. Le seau est gardé en
  // INDICE de la série agrégée plutôt qu'en horodatage — un entier au lieu d'un flottant,
  // et -1 dit « aucun » sans passer par NaN.
  // Les bougies d'ENTRÉE candidates, mémoïsées sur la série.
  //
  // Elles ne dépendent que de l'entrée, des filtres, du plafond de spread et de la
  // fenêtre horaire — jamais du stop ni de l'objectif. Un balayage typique croise
  // 9 périodes × 14 stops × 6 objectifs : ce tableau n'a que NEUF valeurs distinctes,
  // et il était reconstruit 756 fois, chaque construction parcourant les 46 000 bougies
  // de la série. La clé reprend, à la lettre, les champs dont `signalDe` et
  // `autorisePar` font déjà leurs propres clés : deux configurations qui partagent cette
  // clé ont, par construction, le même tableau.
  const eF = { ...cfg.entree, vente: cfg.sens === 'vente' };
  const cleFiltres = (cfg.filtres || [])
    .filter((f) => f.actif !== false && f.type !== 'delai_bougies')
    .map((f) => [f.type, f.ut, f.ligne, f.periode, f.seuil, f.sens, f.recul, f.lookback,
      f.marge_pct, f.touches, f.tolerance_pct, f.memoire, f.debut, f.fin, f.ecart].join(','))
    .join(';');
  const cleForce = 'force|' + ut + '|' + eF.type + '|' + eF.ligne + '|' + eF.periode
    + '|' + (eF.vente ? 'v' : 'a') + '|' + cleFiltres + '|' + facteur
    + '|' + (pasDebutSemaine ? 1 : 0) + '|' + hD + '-' + hF;
  const { force, seauDe, candidats } = memo(df, cleForce, () => construireForce());

  function construireForce() {
  const force = new Uint8Array(df.n);
  const seauDe = new Int32Array(df.n).fill(-1);
  for (let k = 0; k < sup.n; k++) {
    if (!signal[k]) continue;
    if (autorise && !autorise[k]) continue;
    const idx = parSeau.get(sup.t[k]);
    if (!idx) continue;
    // TOUTES les bougies exécutables du seau sont marquées, pas seulement la première.
    //
    // Le robot garde le signal en attente et le réessaie à chaque bougie H1 du MÊME jour
    // tant que l'ordre ne passe pas — y compris quand ce qui l'empêche est sa PROPRE
    // position encore ouverte (InpMaxPositions). Le moteur ne marquait qu'une bougie :
    // si sa position se fermait après elle, la journée était perdue, alors que le robot
    // entrait une ou deux heures plus tard le même jour.
    //
    // Mesuré sur le journal GOLD du 4 septembre : 1 393 des 3 167 tentatives du robot
    // sont refusées pour « position déjà ouverte » puis reprises plus tard dans la
    // journée, et le moteur en perdait 79 — 462 trades contre 538. Les durées de
    // détention, elles, se superposaient déjà (médiane 14 h des deux côtés) : ce
    // n'était donc pas une sortie trop tardive, mais une reprise manquante.
    //
    // `backtester` entre à la PREMIÈRE bougie marquée où il n'est pas déjà en position,
    // et ne peut pas entrer sur la bougie même où il vient de sortir : la reprise suit
    // la sortie d'une bougie, comme chez le robot.
    for (let z = idx.length - 1; z >= 0; z--) {
      if (!acceptable(idx[z])) continue;
      force[idx[z]] = 1;
      seauDe[idx[z]] = k;   // l'INDICE du seau, pas son horodatage : seule l'égalité est lue
    }
  }
  // La LISTE des bougies candidates, dans l'ordre. Elle sort de la même construction
  // et ne coûte rien de plus ; elle permet à `backtester` de sauter d'une candidate à
  // la suivante au lieu de parcourir toutes les bougies hors position.
  let nb = 0;
  for (let i = 0; i < df.n; i++) if (force[i]) nb++;
  const candidats = new Int32Array(nb);
  let z = 0;
  for (let i = 0; i < df.n; i++) if (force[i]) candidats[z++] = i;
  return { force, seauDe, candidats };
  }

  // le délai est exprimé en bougies de décision : on le convertit en bougies H1
  const bougiesParSeau = ut === 'D1' ? 24 : 4;
  const filtres = (cfg.filtres || [])
    .filter((f) => f.type === 'delai_bougies' && f.actif !== false)
    .map((f) => ({ ...f, n: f.n * bougiesParSeau }));
  return backtester(df, {
    ...cfg,
    sortie: { ...cfg.sortie, armer_avant: false },
    signal_force: force,
    signal_seau: seauDe,
    signal_idx: candidats,
    filtres,
  });
}

function clore(df, iEnt, i, px, sortie, sl0, motif, be, ambigu, vente) {
  return {
    entree_t: df.t[iEnt], entree: px, sortie_t: df.t[i], sortie, motif,
    sl_initial: sl0, bougies: i - iEnt, be_max: be, ambigu: !!ambigu,
    sens: vente ? 'vente' : 'achat',
    // à la vente, on gagne quand le prix descend : le risque est sl0 − px
    R: vente ? (px - sortie) / (sl0 - px) : (sortie - px) / (px - sl0),
  };
}

// Répartition du résultat par JOUR de la semaine ou par HEURE d'entrée.
//
// La question « quels sont les meilleurs jours et horaires » a une réponse honnête et
// une réponse flatteuse. La flatteuse consiste à découper le résultat et à désigner le
// meilleur seau : sur 44 trades répartis en cinq jours, le meilleur jour l'est toujours,
// et il ne le restera pas. On calcule donc, pour chaque seau, de combien il s'écarte du
// hasard.
//
// Le test : sous l'hypothèse « ce seau est un tirage au sort parmi tous les trades », la
// moyenne du seau a pour écart-type σ/√n, corrigé du tirage sans remise. On compare
// l'écart observé à cet écart-type — c'est le z. Comme on teste K seaux à la fois, le
// seuil est relevé d'autant (Bonferroni) : |z| > 2,58 pour cinq jours, 3,02 pour
// vingt-quatre heures. Sans cette correction, tester 24 heures au seuil habituel
// désigne en moyenne un « meilleur horaire » sur deux séries de pur bruit.
export function parPeriode(trades, quoi = 'jour') {
  const col = (t) => (t.R_net !== undefined ? t.R_net : t.R);
  const N = trades.length;
  if (!N) return { seaux: [], notables: 0, quoi };
  const cle = quoi === 'heure'
    ? (t) => new Date(t.entree_t).getUTCHours()
    : (t) => new Date(t.entree_t).getUTCDay();
  const totalG = trades.reduce((a, t) => a + col(t), 0);
  const moyG = totalG / N;
  // écart-type de la population des trades
  const varG = N > 1
    ? trades.reduce((a, t) => a + (col(t) - moyG) ** 2, 0) / (N - 1)
    : 0;
  const sigma = Math.sqrt(varG);

  const par = new Map();
  for (const t of trades) {
    const k = cle(t);
    if (!par.has(k)) par.set(k, []);
    par.get(k).push(col(t));
  }
  // seuil de Bonferroni sur le nombre de seaux RÉELLEMENT peuplés
  const K = par.size;
  const seuil = K <= 1 ? Infinity : (K <= 5 ? 2.58 : K <= 12 ? 2.87 : 3.02);

  const seaux = [];
  for (const [k, v] of [...par.entries()].sort((a, b) => a[0] - b[0])) {
    const n = v.length;
    const total = v.reduce((a, x) => a + x, 0);
    const moy = total / n;
    // On compare le seau AUX AUTRES, jamais à un ensemble qui le contient : comparé à la
    // moyenne générale, un seau fortement positif la tire vers le haut et fait passer
    // tous les autres pour « significativement en dessous ». C'est vrai, et
    // tautologique.
    const reste = N - n;
    const moyAutres = reste > 0 ? (totalG - total) / reste : moy;
    const se = sigma > 0 && n > 0 && reste > 0
      ? sigma * Math.sqrt(1 / n + 1 / reste)
      : 0;
    const z = se > 0 ? (moy - moyAutres) / se : 0;
    seaux.push({ cle: k, n, total, moyenne: moy, z, notable: Math.abs(z) > seuil });
  }
  // Le seau le plus écarté, et lui seul : c'est la réponse à « y a-t-il un meilleur
  // jour ». Compter les seaux notables induit en erreur dès qu'un seau fort existe —
  // son complément paraît alors écarté lui aussi.
  const fort = seaux.reduce((a, x) => (a === null || Math.abs(x.z) > Math.abs(a.z) ? x : a), null);
  return { seaux, notables: seaux.filter((x) => x.notable).length, fort,
    conclut: !!(fort && fort.notable), quoi, moyenne: moyG, seuil, K };
}

// Le seau retenu tient-il sur la seconde moitié de l'historique ?
//
// C'est la seule question qui compte avant de filtrer sur un jour ou une heure : un seau
// choisi parce qu'il était le meilleur AVANT l'est-il resté APRÈS ? On coupe la série de
// trades en deux moitiés chronologiques, on classe les seaux sur la première, et on
// regarde où se place le vainqueur dans la seconde. Un vainqueur qui retombe au milieu
// du classement était du bruit, et le filtre construit dessus détruira le résultat.
export function stabilitePeriode(trades, quoi = 'jour') {
  if (trades.length < 20) return null;
  const tri = [...trades].sort((a, b) => a.entree_t - b.entree_t);
  const m = Math.floor(tri.length / 2);
  const a = parPeriode(tri.slice(0, m), quoi).seaux;
  const b = parPeriode(tri.slice(m), quoi).seaux;
  if (a.length < 3 || b.length < 3) return null;
  const rangB = new Map([...b].sort((x, y) => y.moyenne - x.moyenne).map((x, i) => [x.cle, i]));
  const meilleurA = [...a].sort((x, y) => y.moyenne - x.moyenne)[0];
  const pireA = [...a].sort((x, y) => x.moyenne - y.moyenne)[0];
  const rgMeilleur = rangB.has(meilleurA.cle) ? rangB.get(meilleurA.cle) : null;
  const rgPire = rangB.has(pireA.cle) ? rangB.get(pireA.cle) : null;
  return {
    quoi, seaux: b.length,
    meilleur: meilleurA.cle, rangMeilleur: rgMeilleur,
    pire: pireA.cle, rangPire: rgPire,
    // « tient » : le meilleur de la première moitié reste dans la moitié haute de la
    // seconde, ET le pire reste dans la moitié basse
    tient: rgMeilleur !== null && rgPire !== null
      && rgMeilleur < b.length / 2 && rgPire >= b.length / 2,
  };
}

export function resume(trades) {
  if (!trades.length) return { n: 0, total: 0, winRate: 0, nGains: 0, nPertes: 0, neutres: 0, ambigus: 0, exposes: 0, pf: 0, pfMesurable: false, dd: 0, moyenne: 0, rAn: 0, annees: 0 };
  const col = (t) => (t.R_net !== undefined ? t.R_net : t.R);
  const n = trades.length;
  // Un palier « point mort » sort à ≈ 0 R : légèrement négatif frais compris,
  // légèrement positif dès qu'on sécurise 5 %. Compter ces sorties comme des
  // gains faisait sauter le taux de 50 % à 74 % sans que le résultat en R bouge.
  // Une sortie à l'équilibre n'est ni un gain ni une perte : elle est comptée à
  // part et sort du taux de réussite.
  const NEUTRE = 0.05;
  const gains = trades.filter((t) => col(t) > NEUTRE);
  const pertes = trades.filter((t) => col(t) < -NEUTRE);
  const neutres = trades.filter((t) => Math.abs(col(t)) <= NEUTRE);
  const sg = gains.reduce((a, t) => a + col(t), 0), sp = pertes.reduce((a, t) => a + col(t), 0);
  const total = trades.reduce((a, t) => a + col(t), 0);
  let eq = 0, pic = 0, dd = 0;
  for (const t of trades) { eq += col(t); if (eq > pic) pic = eq; if (eq - pic < dd) dd = eq - pic; }
  const annees = (trades[n - 1].sortie_t - trades[0].entree_t) / (365.25 * 86400000);
  return {
    n, total,
    // dénominateur = trades réellement tranchés, sorties à l'équilibre exclues
    winRate: (gains.length + pertes.length) ? gains.length / (gains.length + pertes.length) * 100 : 0,
    nGains: gains.length, nPertes: pertes.length,
    neutres: neutres.length,
    // part des trades dont le sort a été décidé par une convention de lecture et non
    // par la donnée : la bougie contenait le stop ET l'objectif
    ambigus: trades.filter((t) => t.ambigu).length,
    // Sorties EXPOSÉES : celles qui reposent sur un palier armé dans la bougie même où
    // elles tombent. Le prix a pu y repasser une seconde fois sans que l'ordre des deux
    // extrêmes le dise, et c'est le seul écart qui subsiste face au testeur MT5.
    //
    // Confronté à douze exécutions du testeur : les trois configurations à ZÉRO sortie
    // exposée rendent le chiffre du testeur à 0,3-0,4 R près, soit le seul arrondi des
    // frais — sur 403, 44 et 47 trades. Celles qui en portent 15 à 16 % dérivent de 12
    // et 17 R. Ce n'est PAS la fréquence d'armement qui compte : AUDCAD arme un palier
    // sur 64 % de ses trades et n'expose aucune sortie, pour 0,4 R d'écart.
    exposes: trades.filter((t) => t.palierDansBougie).length,
    // trades sortis par le trailing dans la bougie de leur propre plus haut : leur
    // résultat dépend du chemin intra-bougie, inconnu de la donnée
    sommets: trades.filter((t) => t.sommet).length,
    pf: sp !== 0 ? sg / Math.abs(sp) : Infinity,
    // PF sans aucune perte n'est pas une mesure : on garde le fait à part pour
    // pouvoir le classer honnêtement au lieu de l'envoyer en tête à l'infini
    pfMesurable: sp !== 0,
    dd, moyenne: total / n, annees, rAn: annees > 0 ? total / annees : total,
    tp: trades.filter((t) => t.motif === 'tp').length,
    sl: trades.filter((t) => t.motif === 'sl').length,
    be: trades.filter((t) => t.motif === 'be' || t.motif === 'be2').length,
    gap: trades.filter((t) => t.motif === 'sl_gap').length,
    temps: trades.filter((t) => t.motif === 'temps').length,
  };
}

// walk-forward : segments de trades, on compte les segments positifs
export function segments(trades, k = 5) {
  if (!trades.length) return { positifs: 0, total: k, detail: [] };
  // Découpage à bornes calculées, pas par tranches de taille fixe : avec ceil(n/k), le
  // dernier segment ne recevait que le reste — 6 trades donnaient 2/2/2 et deux segments
  // vides, donc « 3 / 3 » à l'écran là où le seuil en attend 5, et un segment d'un seul
  // trade pouvait décider d'un « 5 / 5 ».
  const n = trades.length;
  const detail = [];
  for (let s = 0; s < k; s++) {
    const part = trades.slice(Math.floor(n * s / k), Math.floor(n * (s + 1) / k));
    if (!part.length) { detail.push(null); continue; }
    detail.push(part.reduce((a, t) => a + (t.R_net !== undefined ? t.R_net : t.R), 0));
  }
  return { positifs: detail.filter((x) => x !== null && x > 0).length, total: detail.filter((x) => x !== null).length, detail };
}

// ---------- stabilité dans le temps ----------
// année civile par année civile : combien de trades, comment ils sont sortis,
// et le R accumulé. Sert à voir si le résultat vient d'une seule bonne année.
export function parAnnee(trades) {
  const R = (t) => (t.R_net !== undefined ? t.R_net : t.R);
  const parAn = new Map();
  for (const t of trades) {
    const an = new Date(t.sortie_t).getUTCFullYear();
    if (!parAn.has(an)) parAn.set(an, []);
    parAn.get(an).push(t);
  }
  const lignes = [...parAn.keys()].sort((a, b) => a - b).map((an) => {
    const ts = parAn.get(an);
    const gains = ts.filter((t) => R(t) > 0);
    let eq = 0, pic = 0, dd = 0;
    for (const t of ts) { eq += R(t); if (eq > pic) pic = eq; if (eq - pic < dd) dd = eq - pic; }
    const meilleur = Math.max(...ts.map(R));
    return { an, n: ts.length,
      tp: ts.filter((t) => t.motif === 'tp').length,
      sl: ts.filter((t) => t.motif === 'sl').length,
      be: ts.filter((t) => t.motif === 'be' || t.motif === 'be2').length,
      gap: ts.filter((t) => t.motif === 'sl_gap').length,
      temps: ts.filter((t) => t.motif === 'temps').length,
      total: eq, dd, winRate: gains.length / ts.length * 100,
      moyenne: eq / ts.length, meilleur,
      // poids du meilleur trade dans le gain de l'année : > 25 % = l'année tient sur un coup
      poidsMeilleur: eq > 0 ? meilleur / eq * 100 : null };
  });
  const pleines = lignes.filter((l) => l.n >= 5);
  return { lignes,
    positives: pleines.filter((l) => l.total > 0).length,
    completes: pleines.length,
    pire: lignes.length ? Math.min(...lignes.map((l) => l.total)) : 0 };
}

// tiers du calendrier (pas des trades) : une stratégie qui ne gagne que sur
// une fenêtre historique se voit ici, même si le nombre de trades est irrégulier.
export function sousPeriodes(trades, k = 3) {
  if (!trades.length) return [];
  const R = (t) => (t.R_net !== undefined ? t.R_net : t.R);
  const t0 = trades[0].entree_t, t1 = trades[trades.length - 1].sortie_t;
  const pas = (t1 - t0) / k;
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = t0 + i * pas, b = i === k - 1 ? t1 + 1 : t0 + (i + 1) * pas;
    const ts = trades.filter((t) => t.sortie_t >= a && t.sortie_t < b);
    const total = ts.reduce((s, t) => s + R(t), 0);
    out.push({ debut: new Date(a).getUTCFullYear(), fin: new Date(b - 1).getUTCFullYear(),
      n: ts.length, total, rAn: pas > 0 ? total / (pas / (365.25 * 86400000)) : total,
      winRate: ts.length ? ts.filter((t) => R(t) > 0).length / ts.length * 100 : null });
  }
  return out;
}

export function courbe(trades) {
  let eq = 0;
  return trades.map((t) => { eq += (t.R_net !== undefined ? t.R_net : t.R); return { t: t.sortie_t, eq }; });
}
