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
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [], sess = [];
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
  }
  return nettoyer({ t, o, h, l, c, v, sp, sess, n: t.length });
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
  const t = [], o = [], h = [], l = [], c = [], v = [], sp = [], sess = [];
  const spSrc = df.sp || df.spreadPts;
  const sessSrc = df.sess;
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]);
    if (debut !== null && df.t[i] < debut) continue;
    if (d.getUTCFullYear() < depart || !heures.has(d.getUTCHours())) continue;
    t.push(df.t[i]); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); v.push(df.v[i]);
    sp.push(spSrc ? (spSrc[i] || 0) : 0);
    // pas de colonne = pas de restriction : une série exportée avant cette colonne doit
    // continuer à se mesurer exactement comme avant
    sess.push(sessSrc ? (sessSrc[i] ? 1 : 0) : 1);
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
  return { t, o, h, l, c, v, sp, sess, n: t.length, ecartees: df.n - t.length,
    heuresSession: [...heures].sort((a, b) => a - b), grain,
    spreadPct, spreadPctMoyen, spreadRenseigne: !!spreadPct, sessRenseigne };
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
    let jour = null, med = 0;
    for (let i = 0; i < df.n; i++) {
      const j = Math.floor(df.t[i] / 86400000);
      if (jour === null || j !== jour) {
        const a = Math.max(0, i - fenetre);
        const v = [];
        for (let k = a; k < i; k++) if (sp[k] > 0) v.push(sp[k]);
        // sous 100 relevés la médiane n'a pas de sens : le seuil reste inactif
        if (v.length >= 100) { v.sort((x, y) => x - y); med = v[v.length >> 1] * facteur; }
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
  return memo(df, 'reconstituees', () => {
    const out = new Uint8Array(df.n);
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
  const spSrc = spreadEnPct(df);
  for (let i = 0; i < df.n; i++) {
    if (df.t[i] < d0 || df.t[i] > d1) continue;
    t.push(df.t[i]); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); v.push(df.v[i]);
    if (spSrc) sp.push(spSrc[i] || 0);
  }
  // heuresSession et ecartees suivent la découpe : le robot exporté les lit pour
  // n'agréger que les heures que la mesure a gardées. Les perdre ici rendait ce filtre
  // silencieusement inopérant — le robot agrégeait des bougies que le backtest écartait.
  return { t, o, h, l, c, v, n: t.length, grain: df.grain,
    heuresSession: df.heuresSession, ecartees: df.ecartees,
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
  let seauEntre = null;

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
      const cand = haut * (1 - d * trailing);
      return d * cand > d * sl ? cand : sl;
    }
    if (!etapes.length || d * tp <= d * px) return sl;
    const parcours = (extreme - px) / (tp - px) * 100;
    let nouveau = sl;
    for (const [seuil, niveau] of etapes) {
      if (parcours < seuil) continue;
      // niveau négatif = part du RISQUE encore assumée (−100 = stop initial,
      // −50 = risque réduit de moitié, 0 = point mort) ; positif = part du
      // chemin déjà sécurisée vers l'objectif. Continu en 0.
      let cand = niveau < 0
        ? px + (niveau / 100) * (px - sl0)
        : px + (niveau / 100) * (tp - px);
      // Butée STRICTE, en part du chemin : on ne sécurise jamais autant que
      // le chemin parcouru. Un stop posé pile sur le plus haut touché
      // encaisserait un simple passage intrabar comme un gain acquis.
      const part = Math.min(seuil, parcours) * 0.9;
      const atteint = px + (part / 100) * (tp - px);
      if (d * cand > d * atteint) cand = atteint;
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
  const reconstituee = bougiesReconstituees(df);
  const releve = reconstituee ? (i) => !reconstituee[i] : () => true;

  const majSecu = (i) => {
    const extreme = vente ? df.l[i] : df.h[i];
    if (trailing && d * extreme > d * plusHaut) { plusHaut = extreme; iPlusHaut = i; }
    const nouveau = niveauSecu(extreme);
    if (d * nouveau > d * sl) { sl = nouveau; be = trailing ? 1 : (d * nouveau > d * px ? 2 : 1); }
  };

  for (let i = Math.max(depart, 1); i < df.n; i++) {
    if (enPos) {
      // gap : le SL est un ordre stop, exécuté au cours d'ouverture
      // (rien ne peut être sécurisé avant l'ouverture)
      if (d * df.o[i] <= d * sl) {
        const gap = vente ? df.o[i] > df.h[i - 1] : df.o[i] < df.l[i - 1];
        const motif = be >= 2 ? 'be2' : be >= 1 ? 'be' : (gap ? 'sl_gap' : 'sl');
        trades.push(clore(df, iEnt, i, px, df.o[i], sl0, motif, be, false, vente));
        enPos = false; continue;
      }
      // bougie reconstituée : ni sortie ni palier ne s'y lisent (voir `releve`)
      if (!releve(i)) continue;
      // « bougie favorable » : haussière à l'achat, baissière à la vente — c'est elle
      // qui décide si l'extrême favorable est atteint avant le stop
      const haussiere = d * (df.c[i] - df.o[i]) >= 0;
      if (!haussiere && !prudent && armerAvant) majSecu(i);
      const ordre = (haussiere || prudent) ? ['sl', 'tp'] : ['tp', 'sl'];
      // bougie ambiguë : elle contient le stop ET l'objectif. L'ordre réel des
      // mouvements y est inconnu, donc le sort du trade est décidé par une
      // convention, pas par la donnée. Compté pour pouvoir le dire.
      const pire = vente ? df.h[i] : df.l[i], mieux = vente ? df.l[i] : df.h[i];
      // Stop que l'extrême de CETTE bougie justifie. Une bougie peut monter assez pour
      // armer un palier PUIS redescendre le toucher : la H1 ne dit pas dans quel ordre.
      // Le moteur ne le voyait pas — il testait la sortie avec l'ancien stop, encaissait
      // l'objectif, et n'armait qu'ensuite. Mesuré sur BITCOIN le 23 avril 2025 : haut
      // 94 036 (objectif 92 920 atteint) et bas 90 954 (point mort 91 098 touché) dans la
      // MÊME heure. Le moteur inscrivait +2,00 R, le testeur 0,00 R.
      const slArme = niveauSecu(mieux);
      const ambigu = (d * pire <= d * sl && d * mieux >= d * tp)
        || (d * pire <= d * slArme && d * mieux >= d * tp)
        || (vente && df.h[i] >= sl && df.l[i] <= tp);
      // en lecture BASSE, le stop testé est celui que la bougie a armé : on tranche
      // contre soi. En lecture haute, l'ancien stop, comme avant.
      const slTeste = prudent ? slArme : sl;
      let sortie = null;
      for (const q of ordre) {
        if (q === 'sl' && d * pire <= d * slTeste) { sortie = ['sl', slTeste]; break; }
        if (q === 'tp' && d * mieux >= d * tp) { sortie = ['tp', tp]; break; }
      }
      if (sortie) {
        let motif = sortie[0];
        if (motif === 'sl') {
          // le palier armé PAR cette bougie compte : sans ça, une sortie au point mort
          // se serait étiquetée « sl » et aurait fait croire à une perte pleine
          const niv = d * slTeste > d * px ? 2 : d * slTeste > d * sl0 ? 1 : 0;
          const b = Math.max(be, niv);
          motif = b >= 2 ? 'be2' : b >= 1 ? 'be' : 'sl';
        }
        const tr = clore(df, iEnt, i, px, sortie[1], sl0, motif, be, ambigu, vente);
        // sortie par le stop dans la bougie même qui a fixé le plus haut : le gain
        // suppose que le stop a suivi le sommet tick par tick, ce que H1 ne dit pas
        if (trailing && sortie[0] === 'sl' && i === iPlusHaut) tr.sommet = true;
        trades.push(tr);
        enPos = false; continue;
      }
      if (dureeMax && (i - iEnt) >= dureeMax) {
        trades.push(clore(df, iEnt, i, px, df.c[i], sl0, 'temps', be, false, vente));
        enPos = false; continue;
      }
      majSecu(i);
      continue;
    }

    if (df.t[i] >= finEntrees) continue;
    if (!signal[i] || (autorise && !autorise[i])) continue;
    if (seauEnt && seauEnt[i] === seauEntre) continue;   // ce signal a déjà été joué
    if (delai && (i - derniere) < delai) continue;

    px = df.o[i] * (1 + d * spreadDe(i));
    sl0 = px * (1 - d * slPct);
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
    tp = px + (px - sl0) * rr;
    enPos = true; iEnt = i; derniere = i; be = 0; plusHaut = vente ? df.l[i] : df.h[i];
    if (seauEnt) seauEntre = seauEnt[i];
    iPlusHaut = i;

    // la bougie d'entrée peut déjà toucher SL ou TP — et, si elle est baissière,
    // avoir sécurisé la position avant d'y redescendre
    const haussiere = d * (df.c[i] - df.o[i]) >= 0;
    if (!haussiere && !prudent && armerAvant) majSecu(i);
    const pire0 = vente ? df.h[i] : df.l[i], mieux0 = vente ? df.l[i] : df.h[i];
    // Même règle que sur les bougies suivantes : la bougie d'entrée peut monter assez
    // pour armer un palier PUIS redescendre le toucher, et la H1 ne dit pas dans quel
    // ordre. C'est le cas le plus fréquent, l'entrée et le palier tombant dans la même
    // heure — sur BITCOIN, 31 trades sur 420 contre 2 comptés auparavant.
    const slArme0 = niveauSecu(mieux0);
    const ambigu0 = (d * pire0 <= d * sl && d * mieux0 >= d * tp)
      || (d * pire0 <= d * slArme0 && d * mieux0 >= d * tp);
    const slTeste0 = prudent ? slArme0 : sl;
    for (const q of ((haussiere || prudent) ? ['sl', 'tp'] : ['tp', 'sl'])) {
      if (q === 'sl' && d * pire0 <= d * slTeste0) {
        const niv = d * slTeste0 > d * px ? 2 : d * slTeste0 > d * sl0 ? 1 : 0;
        const b = Math.max(be, niv);
        const motif = b >= 2 ? 'be2' : b >= 1 ? 'be' : 'sl';
        trades.push(clore(df, i, i, px, slTeste0, sl0, motif, b, ambigu0, vente)); enPos = false; break;
      }
      if (q === 'tp' && d * mieux0 >= d * tp) { trades.push(clore(df, i, i, px, tp, sl0, 'tp', 0, ambigu0, vente)); enPos = false; break; }
    }
    if (enPos && (haussiere || prudent)) majSecu(i);
  }

  // frais, rapportés au risque du trade (règle du moteur Python)
  const frais = cfg.frais || {};
  for (const tr of trades) {
    const slP = Math.abs(tr.entree - tr.sl_initial) / tr.entree * 100;
    // le spread n'est plus déduit ici : il est déjà dans le prix d'entrée, et donc dans
    // le R du trade. Le compter deux fois doublerait le coût réel.
    const comm = (frais.commission_pct || 0) * 2 / slP;
    const nuits = (tr.sortie_t - tr.entree_t) / 86400000;
    // Le relevé ne donne que le swap LONG. À la vente, prendre son opposé transformait
    // un coût en crédit : la plupart des courtiers facturent le portage dans les DEUX
    // sens, ils ne vous paient pas pour vendre. Sans relevé du swap court, on garde donc
    // le coût, jamais le crédit. Un taux positif au comptant (portage favorable) reste
    // crédité à l'achat, où il est réel.
    const brut = Number(frais.swap_annuel_pct) || 0;
    const taux = (tr.sens === 'vente') ? -Math.abs(brut) : brut;
    const swap = -(taux / 360) * nuits / slP;
    tr.R_net = tr.R - comm - swap;
  }
  return trades;
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
  const acceptable = (i) => traitable(i) && sousPlafond(i);

  const parSeau = new Map();
  for (let i = df.n - 1; i >= 0; i--) {
    if (!executable(i)) continue;
    const b = seau(df.t[i]);
    if (!parSeau.has(b)) parSeau.set(b, []);
    parSeau.get(b).push(i);
  }
  const force = new Array(df.n).fill(false);
  const seauDe = new Float64Array(df.n).fill(NaN);
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
      force[idx[z]] = true;
      seauDe[idx[z]] = sup.t[k];
    }
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

export function resume(trades) {
  if (!trades.length) return { n: 0, total: 0, winRate: 0, nGains: 0, nPertes: 0, neutres: 0, ambigus: 0, pf: 0, pfMesurable: false, dd: 0, moyenne: 0, rAn: 0, annees: 0 };
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
