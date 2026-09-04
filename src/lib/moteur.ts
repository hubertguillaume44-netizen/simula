/* Simula engine — faithful TS port of moteur.js (H1 confirmed-bar backtester). */
// @ts-nocheck
export async function chargerCsv(url) {
  const txt = await (await fetch(url)).text();
  return texteVersDf(txt);
}
export function texteVersDf(txt) {
  const lignes = txt.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!lignes.length) return nettoyer({ t: [], o: [], h: [], l: [], c: [], v: [], n: 0 });
  const sep = [',', ';', '\t'].reduce((a, s) =>
    (lignes[0].split(s).length > lignes[0].split(a).length ? s : a), ',');
  const enTete = lignes[0].toLowerCase();
  const debut = /date|time|open/.test(enTete) ? 1 : 0;
  const t = [], o = [], h = [], l = [], c = [], v = [];
  for (let i = debut; i < lignes.length; i++) {
    const p = lignes[i].split(sep);
    if (p.length < 5) continue;
    let d = p[0].trim().replace(/["']/g, '');
    let heure = '';
    if (!/[ T]/.test(d) && /^\d{1,2}:\d{2}/.test((p[1] || '').trim())) {
      heure = p[1].trim(); p.splice(1, 1);
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
  }
  return nettoyer({ t, o, h, l, c, v, n: t.length });
}
function jourUtc(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
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
  const t = [], o = [], h = [], l = [], c = [], v = [];
  for (let i = 0; i < df.n; i++) {
    const d = new Date(df.t[i]);
    if (debut !== null && df.t[i] < debut) continue;
    if (d.getUTCFullYear() < depart || !heures.has(d.getUTCHours())) continue;
    t.push(df.t[i]); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); v.push(df.v[i]);
  }
  return { t, o, h, l, c, v, n: t.length, ecartees: df.n - t.length, heuresSession: [...heures].sort((a, b) => a - b) };
}
export const AMORCE_JOURS = 400;
export function decouper(df, debut, fin) {
  if (debut === undefined && fin === undefined) return df;
  const d0 = debut !== undefined ? debut - AMORCE_JOURS * 86400000 : -Infinity;
  const d1 = fin !== undefined ? fin : Infinity;
  const t = [], o = [], h = [], l = [], c = [], v = [];
  for (let i = 0; i < df.n; i++) {
    if (df.t[i] < d0 || df.t[i] > d1) continue;
    t.push(df.t[i]); o.push(df.o[i]); h.push(df.h[i]); l.push(df.l[i]); c.push(df.c[i]); v.push(df.v[i]);
  }
  return { t, o, h, l, c, v, n: t.length };
}
export function ema(src, p) {
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (p + 1);
  let somme = 0;
  for (let i = 0; i < src.length; i++) {
    if (i < p) { somme += src[i]; if (i === p - 1) out[i] = somme / p; continue; }
    out[i] = src[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}
export function sma(src, p) {
  const out = new Array(src.length).fill(NaN);
  let somme = 0;
  for (let i = 0; i < src.length; i++) {
    somme += src[i];
    if (i >= p) somme -= src[i - p];
    if (i >= p - 1) out[i] = somme / p;
  }
  return out;
}
export function mediane(df, p) {
  const out = new Array(df.n).fill(NaN);
  for (let i = p - 1; i < df.n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let k = i - p + 1; k <= i; k++) { if (df.h[k] > hi) hi = df.h[k]; if (df.l[k] < lo) lo = df.l[k]; }
    out[i] = (hi + lo) / 2;
  }
  return out;
}
function ligne(df, nom, p) {
  if (nom === 'mediane' || nom === 'tenkan' || nom === 'kijun') return mediane(df, p);
  if (nom === 'ma') return sma(df.c, p);
  return ema(df.c, p);
}
export function resampler(df, ut) {
  if (ut === 'H1') return df;
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
function aligner(sup, valeurs, df) {
  const out = new Array(df.n).fill(false);
  let j = 0;
  for (let i = 0; i < df.n; i++) {
    while (j + 1 < sup.n && sup.t[j + 1] <= df.t[i]) j++;
    out[i] = !!valeurs[j];
  }
  return out;
}
export function croisementPrix(df, cfg) {
  const li = ligne(df, cfg.ligne, cfg.periode);
  const cross = new Array(df.n).fill(false);
  for (let i = 1; i < df.n; i++) {
    if (isNaN(li[i]) || isNaN(li[i - 1])) continue;
    cross[i] = df.c[i] > li[i] && df.c[i - 1] <= li[i - 1];
  }
  return decaler(cross);
}
export function rebond(df, cfg) {
  const li = ligne(df, cfg.ligne, cfg.periode);
  const tol = (cfg.tolerance_pct || 0) / 100;
  const s = new Array(df.n).fill(false);
  for (let i = 0; i < df.n; i++) {
    if (isNaN(li[i])) continue;
    s[i] = df.l[i] <= li[i] * (1 + tol) && df.c[i] > li[i];
  }
  return decaler(s);
}
export function croisementLignes(df, cfg) {
  const rapide = ligne(df, cfg.rapide || 'ema', cfg.p_rapide || 9);
  const lente = ligne(df, cfg.lente || 'ema', cfg.p_lente || 26);
  const cross = new Array(df.n).fill(false);
  for (let i = 1; i < df.n; i++) {
    if (isNaN(rapide[i]) || isNaN(lente[i]) || isNaN(rapide[i - 1]) || isNaN(lente[i - 1])) continue;
    cross[i] = rapide[i] > lente[i] && rapide[i - 1] <= lente[i - 1];
  }
  return decaler(cross);
}
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
export function tendanceMtf(df, cfg) {
  const sup = resampler(df, cfg.ut);
  const li = ligne(sup, cfg.ligne || 'tenkan', cfg.periode);
  const cond = new Array(sup.n).fill(false);
  for (let i = 1; i < sup.n; i++) cond[i] = !isNaN(li[i - 1]) && sup.c[i - 1] > li[i - 1];
  return aligner(sup, cond, df);
}
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
export function rsi(src, p = 14) {
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
export function atr(df, p = 14) {
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
export function adx(df, p = 14) {
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
export function filtreZoneResistance(df, cfg) {
  const sup = resampler(df, cfg.ut || 'D1');
  const k = cfg.ecart || 3;
  const tol = (cfg.tolerance_pct || 0.5) / 100;
  const touchesMin = cfg.touches || 3;
  const marge = 1 - (cfg.marge_pct || 1) / 100;
  const memoire = cfg.memoire || 250;
  const sommets = [];
  for (let i = k; i < sup.n - k; i++) {
    let max = true;
    for (let j = i - k; j <= i + k && max; j++) if (j !== i && sup.h[j] >= sup.h[i]) max = false;
    if (max) sommets.push({ i: i + k, t: sup.t[i + k], niveau: sup.h[i] });
  }
  const zones = [];
  for (const s of sommets) {
    let z = null;
    for (const c of zones) {
      if (s.i - c.dernier > memoire) continue;
      if (Math.abs(c.niveau - s.niveau) <= c.niveau * tol) { z = c; break; }
    }
    if (z) {
      z.touches++; z.niveau = Math.max(z.niveau, s.niveau); z.dernier = s.i;
      z.expire = sup.t[Math.min(sup.n - 1, s.i + memoire)];
      if (z.touches === touchesMin) z.depuis = s.t;
    } else {
      zones.push({ niveau: s.niveau, touches: 1, dernier: s.i, depuis: null, expire: sup.t[Math.min(sup.n - 1, s.i + memoire)] });
    }
  }
  const confirmees = zones.filter((z) => z.depuis !== null).sort((a, b) => a.depuis - b.depuis);
  const out = new Array(df.n).fill(false);
  let p = 0; const actives = [];
  for (let i = 0; i < df.n; i++) {
    while (p < confirmees.length && confirmees[p].depuis <= df.t[i]) {
      const z = confirmees[p++];
      let q = 0;
      while (q < actives.length && actives[q].niveau < z.niveau) q++;
      actives.splice(q, 0, z);
    }
    for (let q = actives.length - 1; q >= 0; q--) if (actives[q].expire < df.t[i]) actives.splice(q, 1);
    const c = df.c[i];
    let lo = 0, hi = actives.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (actives[mid].niveau <= c) lo = mid + 1; else hi = mid; }
    out[i] = !(lo < actives.length && c > actives[lo].niveau * marge);
  }
  return decaler(out);
}
export const ENTREES = {
  croisement_ou_rebond: 'Croisement ou rebond',
  croisement_prix: 'Uniquement croisement',
  rebond: 'Uniquement rebond',
  croisement_lignes: 'Croisement de deux lignes',
  cassure: 'Cassure d\u2019un plus haut',
};
export const LIGNES = { ema: 'MME (EMA)', ma: 'MM (SMA)', mediane: 'Médiane (Tenkan)', kijun: 'Kijun' };
export function signalDe(df, cfg) {
  const e = cfg.entree;
  if (e.type === 'rebond') return rebond(df, e);
  if (e.type === 'croisement_prix') return croisementPrix(df, e);
  if (e.type === 'croisement_lignes') return croisementLignes(df, { rapide: e.ligne, p_rapide: Math.max(2, Math.round(e.periode / 3)), lente: e.ligne, p_lente: e.periode });
  if (e.type === 'cassure') return cassure(df, { lookback: e.periode });
  const a = croisementPrix(df, e), b = rebond(df, e);
  return a.map((x, i) => x || b[i]);
}
export function backtester(df, cfg) {
  const signal = signalDe(df, cfg);
  let autorise = new Array(df.n).fill(true);
  let delai = 0;
  for (const f of cfg.filtres || []) {
    if (f.actif === false) continue;
    if (f.type === 'delai_bougies') { delai = f.n; continue; }
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
    if (s) for (let i = 0; i < df.n; i++) autorise[i] = autorise[i] && s[i];
  }
  const slPct = cfg.sortie.sl.valeur / 100;
  const rr = cfg.sortie.tp.valeur;
  const sec = cfg.sortie.securisation || {};
  const etapes = sec.type === 'be_progressif' ? (sec.etapes || []) : [];
  const trailing = sec.type === 'trailing' ? (sec.distance_pct || 0) / 100 : 0;
  const i0 = cfg.debut ? df.t.findIndex((x) => x >= cfg.debut) : 0;
  const depart = i0 < 0 ? df.n : i0;
  const trades = [];
  let enPos = false, px = 0, sl0 = 0, sl = 0, tp = 0, iEnt = -1, derniere = -1e9, be = 0, plusHaut = 0;
  for (let i = Math.max(depart, 1); i < df.n; i++) {
    if (enPos) {
      if (df.o[i] <= sl) {
        const motif = be >= 2 ? 'be2' : be >= 1 ? 'be' : (df.o[i] < df.l[i - 1] ? 'sl_gap' : 'sl');
        trades.push(clore(df, iEnt, i, px, df.o[i], sl0, motif, be));
        enPos = false; continue;
      }
      const haussiere = df.c[i] >= df.o[i];
      const ordre = haussiere ? ['sl', 'tp'] : ['tp', 'sl'];
      let sortie = null;
      for (const q of ordre) {
        if (q === 'sl' && df.l[i] <= sl) { sortie = ['sl', sl]; break; }
        if (q === 'tp' && df.h[i] >= tp) { sortie = ['tp', tp]; break; }
      }
      if (sortie) {
        let motif = sortie[0];
        if (motif === 'sl') motif = be >= 2 ? 'be2' : be >= 1 ? 'be' : 'sl';
        trades.push(clore(df, iEnt, i, px, sortie[1], sl0, motif, be));
        enPos = false; continue;
      }
      if (trailing) {
        if (df.h[i] > plusHaut) plusHaut = df.h[i];
        const cand = plusHaut * (1 - trailing);
        if (cand > sl) { sl = cand; be = 1; }
      } else if (etapes.length && tp > px) {
        const parcours = (df.h[i] - px) / (tp - px) * 100;
        let nouveau = sl, stage = be;
        for (const [seuil, niveau] of etapes) {
          if (parcours >= seuil) {
            const cand = px + (niveau / 100) * (tp - px);
            if (cand > nouveau) nouveau = cand;
            stage = Math.max(stage, niveau <= 0 ? 1 : 2);
          }
        }
        if (nouveau > sl) { sl = nouveau; be = stage; }
      }
      continue;
    }
    if (!(signal[i] && autorise[i])) continue;
    if (delai && (i - derniere) < delai) continue;
    px = df.o[i]; sl0 = px * (1 - slPct); sl = sl0; tp = px + (px - sl0) * rr;
    enPos = true; iEnt = i; derniere = i; be = 0; plusHaut = df.h[i];
    const haussiere = df.c[i] >= df.o[i];
    for (const q of (haussiere ? ['sl', 'tp'] : ['tp', 'sl'])) {
      if (q === 'sl' && df.l[i] <= sl) { trades.push(clore(df, i, i, px, sl, sl0, 'sl', 0)); enPos = false; break; }
      if (q === 'tp' && df.h[i] >= tp) { trades.push(clore(df, i, i, px, tp, sl0, 'tp', 0)); enPos = false; break; }
    }
  }
  const frais = cfg.frais || {};
  for (const tr of trades) {
    const slP = (tr.entree - tr.sl_initial) / tr.entree * 100;
    const spread = (frais.spread_pct || 0) / slP;
    const comm = (frais.commission_pct || 0) * 2 / slP;
    const nuits = (tr.sortie_t - tr.entree_t) / 86400000;
    const swap = -((frais.swap_annuel_pct || 0) / 360) * nuits / slP;
    tr.R_net = tr.R - spread - comm - swap;
  }
  return trades;
}
function clore(df, iEnt, i, px, sortie, sl0, motif, be) {
  return {
    entree_t: df.t[iEnt], entree: px, sortie_t: df.t[i], sortie, motif,
    sl_initial: sl0, bougies: i - iEnt, be_max: be,
    R: (sortie - px) / (px - sl0),
  };
}
export function resume(trades) {
  if (!trades.length) return { n: 0, total: 0, winRate: 0, pf: 0, dd: 0, moyenne: 0, rAn: 0, annees: 0 };
  const col = (t) => (t.R_net !== undefined ? t.R_net : t.R);
  const n = trades.length;
  const gains = trades.filter((t) => col(t) > 0), pertes = trades.filter((t) => col(t) <= 0);
  const sg = gains.reduce((a, t) => a + col(t), 0), sp = pertes.reduce((a, t) => a + col(t), 0);
  const total = sg + sp;
  let eq = 0, pic = 0, dd = 0;
  for (const t of trades) { eq += col(t); if (eq > pic) pic = eq; if (eq - pic < dd) dd = eq - pic; }
  const annees = (trades[n - 1].sortie_t - trades[0].entree_t) / (365.25 * 86400000);
  return {
    n, total, winRate: gains.length / n * 100,
    pf: sp !== 0 ? sg / Math.abs(sp) : Infinity,
    dd, moyenne: total / n, annees, rAn: annees > 0 ? total / annees : total,
    tp: trades.filter((t) => t.motif === 'tp').length,
    sl: trades.filter((t) => t.motif === 'sl').length,
    be: trades.filter((t) => t.motif === 'be' || t.motif === 'be2').length,
    gap: trades.filter((t) => t.motif === 'sl_gap').length,
  };
}
export function segments(trades, k = 5) {
  if (!trades.length) return { positifs: 0, total: k, detail: [] };
  const taille = Math.ceil(trades.length / k);
  const detail = [];
  for (let s = 0; s < k; s++) {
    const part = trades.slice(s * taille, (s + 1) * taille);
    if (!part.length) { detail.push(null); continue; }
    detail.push(part.reduce((a, t) => a + (t.R_net !== undefined ? t.R_net : t.R), 0));
  }
  return { positifs: detail.filter((x) => x !== null && x > 0).length, total: detail.filter((x) => x !== null).length, detail };
}
export function courbe(trades) {
  let eq = 0;
  return trades.map((t) => { eq += (t.R_net !== undefined ? t.R_net : t.R); return { t: t.sortie_t, eq }; });
}
