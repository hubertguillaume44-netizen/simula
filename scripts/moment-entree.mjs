#!/usr/bin/env node
/**
 * Même signal, trois moments d'exécution.
 *
 * Le signal est lu sur la clôture de la bougie D1, comme aujourd'hui. Seule change la
 * bougie H1 sur laquelle l'ordre part :
 *
 *   ouverture  — la première bougie du jour (l'actuel : 00:00, l'heure du rollover)
 *   spread     — la première bougie du jour dont le spread passe sous la médiane de la série
 *   glissant   — la même chose, mais contre la médiane des 250 dernières séances : la prime
 *                du rollover grandit d'année en année, une médiane globale mélange les époques
 *   heure      — une heure fixe de séance (--heure, 08:00 par défaut)
 *
 * Dans les trois cas la position est ensuite suivie sur les bougies H1 : stop, objectif et
 * paliers voient la même granularité, sinon on comparerait aussi des sorties différentes.
 *
 *   node scripts/moment-entree.mjs --csv AUDCAD_H1.csv --ref AUDCAD
 *   node scripts/moment-entree.mjs --csv GOLD_H1.csv --ref GOLD:ema_5_SL0p6_RR3 --heure 1
 *
 * `--ref` prend la configuration exacte du robot exporté, filtres compris ; sans lui les
 * options individuelles s'appliquent et la mesure part sans filtre.
 */
import { readFileSync } from "node:fs";
import { chargerMoteur } from "./mt5/charger-moteur.mjs";
import { construireConfig, lirePaliers, PALIERS_REFERENCE } from "./mt5/config.mjs";
import { REFERENCES } from "./mt5/references.mjs";

const num = (x, d) => (x === undefined ? d : Number(String(x).replace(",", ".")));
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "—");
const sgn = (x, d = 2) =>
  Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d).replace(".", ",")}` : "—";

function args(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [cle, val] = a.slice(2).split("=");
    if (val !== undefined) {
      o[cle] = val;
      continue;
    }
    const suiv = argv[i + 1];
    if (suiv === undefined || suiv.startsWith("--")) o[cle] = true;
    else {
      o[cle] = suiv;
      i++;
    }
  }
  return o;
}

const jourDe = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Indices H1 de chaque journée, dans l'ordre. */
function joursH1(df) {
  const m = new Map();
  for (let i = 0; i < df.n; i++) {
    const j = jourDe(df.t[i]);
    if (!m.has(j)) m.set(j, []);
    m.get(j).push(i);
  }
  return m;
}

function medianeSpread(sp, n) {
  const v = [];
  for (let i = 0; i < n; i++) if (sp[i] > 0) v.push(sp[i]);
  v.sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

async function main() {
  const o = args(process.argv);
  if (!o.csv) {
    console.error("Manque --csv");
    process.exit(1);
  }
  const M = await chargerMoteur();

  const debut = o.depuis ? Date.parse(`${o.depuis}T00:00:00Z`) : Date.UTC(2020, 0, 1);
  const df = M.decouper(M.texteVersDf(readFileSync(o.csv, "utf8")), debut, undefined);
  const sp = M.spreadEnPct(df);
  if (!sp) {
    console.error(
      "Le CSV ne porte pas de colonne de spread exploitable : la variante « spread » n'aurait aucun sens.",
    );
    process.exit(2);
  }
  const medSpread = medianeSpread(sp, df.n);

  // --ref AUDCAD, --ref GOLD:ema_5_SL0p6_RR3 : la configuration exacte du robot exporté,
  // filtres compris. Les retaper en options revenait à mesurer autre chose : cinq des huit
  // références portent un filtre, et trois n'utilisent pas l'entrée par défaut.
  let ref = null;
  if (o.ref) {
    const [sym, variante] = String(o.ref).split(":");
    ref = REFERENCES.find((x) => x.sym === sym && (!variante || x.variante === variante));
    if (!ref) {
      console.error(`Référence inconnue : ${o.ref}. Connues : `
        + REFERENCES.map((x) => x.sym + (x.variante ? ":" + x.variante : "")).join(", "));
      process.exit(2);
    }
  }

  const reglages = {
    entree: o.entree || ref?.entree || "croisement_ou_rebond",
    ligne: o.ligne || ref?.ligne || "mediane",
    periode: num(o.periode, ref?.periode ?? 15),
    sl: num(o.sl, ref?.sl ?? 0.5),
    rr: num(o.rr, ref?.rr ?? 2),
    filtres: ref?.filtres ?? [],
    sens: o.sens === "vente" ? "vente" : "achat",
    paliers: o.paliers !== undefined ? lirePaliers(o.paliers) : PALIERS_REFERENCE,
    commission: num(o.commission, 0),
    swap: num(o.swap, 0),
    debut,
  };

  // ---- le signal, lu sur la D1, identique aux trois variantes ----
  const base = M.resampler(df, "D1");
  const cfgBase = construireConfig(reglages);
  const sigD1 = M.signalDe(base, cfgBase);
  // Les filtres décident sur la MÊME bougie que le signal. Les omettre ici mesurait la
  // configuration sans eux : cinq des huit références en portent un.
  const autoriseD1 = M.autorisePar(base, cfgBase.filtres);
  const parJour = joursH1(df);
  const heureFixe = num(o.heure, 8);

  // Médiane glissante : pour chaque bougie, la médiane des ~250 séances précédentes.
  // Recalculée par pas de 24 bougies, ce qui suffit à suivre une dérive annuelle.
  const FENETRE = 250 * 24;
  const medGlissante = new Float64Array(df.n);
  {
    let ancre = -1,
      val = medSpread;
    for (let i = 0; i < df.n; i++) {
      if (ancre < 0 || i - ancre >= 24) {
        const a = Math.max(0, i - FENETRE);
        const v = [];
        for (let k = a; k < i; k++) if (sp[k] > 0) v.push(sp[k]);
        if (v.length > 100) {
          v.sort((x, y) => x - y);
          val = v[Math.floor(v.length / 2)];
        }
        ancre = i;
      }
      medGlissante[i] = val;
    }
  }

  const choisir = {
    ouverture: (idx) => idx[0],
    spread: (idx) => {
      for (const i of idx) if (sp[i] > 0 && sp[i] <= medSpread) return i;
      return idx[0];
    },
    glissant: (idx) => {
      for (const i of idx) if (sp[i] > 0 && sp[i] <= medGlissante[i]) return i;
      return idx[0];
    },
    heure: (idx) => {
      for (const i of idx) if (new Date(df.t[i]).getUTCHours() === heureFixe) return i;
      for (const i of idx) if (new Date(df.t[i]).getUTCHours() > heureFixe) return i;
      return null;
    },
  };

  const lignes = [];
  for (const [nom, prendre] of Object.entries(choisir)) {
    const force = new Array(df.n).fill(false);
    let signaux = 0,
      perdus = 0;
    const heures = new Map();
    for (let k = 0; k < base.n; k++) {
      if (!sigD1[k] || base.t[k] < debut) continue;
      if (autoriseD1 && !autoriseD1[k]) continue;
      signaux++;
      const idx = parJour.get(jourDe(base.t[k]));
      const i = idx ? prendre(idx) : null;
      if (i === null || i === undefined) {
        perdus++;
        continue;
      }
      force[i] = true;
      const h = new Date(df.t[i]).getUTCHours();
      heures.set(h, (heures.get(h) || 0) + 1);
    }

    const cfg = { ...construireConfig(reglages), signal_force: force, filtres: [] };
    const trades = M.backtester(df, cfg);
    const r = M.resume(trades);

    // Frais en R. Le spread n'est plus déduit du R : il est dans le prix d'entrée. On le
    // rechiffre avec la formule du moteur (coût ≈ spread% / stop%) pour pouvoir le lire.
    let spreadR = 0,
      commR = 0,
      swapR = 0,
      spreadPct = 0;
    for (const t of trades) {
      const slP = (Math.abs(t.entree - t.sl_initial) / t.entree) * 100;
      // le spread payé est celui de la bougie d'entrée
      const iEnt = df.t.indexOf(t.entree_t);
      const s = iEnt >= 0 && sp[iEnt] > 0 ? sp[iEnt] : df.spreadPctMoyen || 0;
      spreadPct += s;
      spreadR += s / slP;
      commR += (reglages.commission * 2) / slP;
      const nuits = (t.sortie_t - t.entree_t) / 86400000;
      swapR += -(reglages.swap / 360) * (nuits / slP);
    }
    const n = trades.length || 1;
    lignes.push({
      nom,
      signaux,
      perdus,
      r,
      trades,
      spreadR,
      commR,
      swapR,
      fraisR: spreadR + commR + swapR,
      spreadMoyen: spreadPct / n,
      heures: [...heures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    });
  }

  // ---------- rendu ----------
  const ETIQ = {
    ouverture: `ouverture du jour (actuel)`,
    spread: `1re bougie sous le spread médian (série)`,
    glissant: `1re bougie sous le spread médian (250 séances)`,
    heure: `heure fixe ${String(heureFixe).padStart(2, "0")}:00`,
  };
  console.log(`# Moment d'entrée — ${o.symbole || o.csv}`);
  console.log();
  console.log(
    `Règle : ${reglages.entree} · ${reglages.ligne} ${reglages.periode} · SL ${fr(reglages.sl, 2)} % · R/R ${fr(reglages.rr, 2)} · signal lu en D1, position suivie en H1`,
  );
  console.log(
    `Spread médian de la série : ${fr(medSpread, 4)} % · commission ${fr(reglages.commission, 4)} % · swap ${fr(reglages.swap, 3)} %/an`,
  );
  console.log();
  console.log(
    "| moment d'entrée | trades | R net | facteur de profit | frais totaux (R) | dont spread (R) | spread moyen payé | R net hors spread |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const l of lignes) {
    console.log(
      `| ${ETIQ[l.nom]} | ${l.r.n} | ${sgn(l.r.total, 1)} | ${fr(l.r.pf, 2)} | ${sgn(-l.fraisR, 1)} | ${sgn(-l.spreadR, 1)} | ${fr(l.spreadMoyen, 4)} % | ${sgn(l.r.total + l.spreadR, 1)} |`,
    );
  }
  console.log();
  console.log(
    "| moment d'entrée | tp | sl | point mort | gap | taux de réussite | creux (R) | signaux perdus |",
  );
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const l of lignes) {
    console.log(
      `| ${ETIQ[l.nom]} | ${l.r.tp} | ${l.r.sl} | ${l.r.be} | ${l.r.gap} | ${fr(l.r.winRate, 1)} % | ${fr(l.r.dd, 1)} | ${l.perdus} / ${l.signaux} |`,
    );
  }
  console.log();
  for (const l of lignes) {
    console.log(
      `${ETIQ[l.nom]} — heures d'exécution : ${l.heures.map(([h, n]) => `${String(h).padStart(2, "0")}:00 × ${n}`).join(" · ")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
