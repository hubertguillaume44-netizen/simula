/**
 * Fabrique un couple (CSV H1, rapport MT5) dont on connaît la vérité terrain.
 *
 * On part des trades réellement produits par le moteur du dépôt, puis on injecte
 * des écarts connus (heure serveur, spread, commission, swap, trades manquants ou
 * en trop, sorties divergentes). Le harnais doit les retrouver : c'est ce qui
 * permet de lui faire confiance avant de le lancer sur un vrai rapport.
 */
import { chargerDemo, chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig } from "./config.mjs";

export const DEBUT = Date.UTC(2020, 0, 1);

const DEFAUTS = {
  symbole: "DEMO-FX",
  decalageH: 2, // heure serveur MT5 = UTC + 2
  spread: 0.0004, // payé une fois, à l'entrée
  commission: -7, // € par aller-retour
  swapParNuit: -1.2, // € par jour de détention
  eurParR: 250,
  manquants: 3, // trades Simula que MT5 n'a pas pris
  ajoutes: 2, // trades MT5 que Simula n'a pas vus
  divergents: 2, // sorties de motif différent
  forme: "deals", // 'deals' | 'positions'
};

const stamp = (ms) => {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};
const eur = (x) =>
  (x < 0 ? "-" : "") +
  Math.abs(x)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export async function fabriquer(options = {}) {
  const opt = { ...DEFAUTS, ...options };
  const moteur = await chargerMoteur();
  const demo = await chargerDemo();

  const series = demo.demoSeries();
  const id = opt.serie ?? Object.keys(series)[0];
  const csv = demo.seriesToCsv(id, series[id]);

  const reglages = {
    symbol: opt.symbole,
    entree: "croisement_ou_rebond",
    ligne: "mediane",
    periode: 15,
    sl: 0.5,
    rr: 2,
    sens: "achat",
    paliers: [],
    capital: 25000,
    risquePct: 1,
    debut: DEBUT,
    ...(opt.reglages ?? {}),
  };
  const df = moteur.decouper(moteur.texteVersDf(csv), DEBUT, undefined);
  const sim = moteur.backtester(df, construireConfig(reglages));

  const dec = opt.decalageH * 3600000;
  const pas = Math.max(2, Math.ceil(sim.length / Math.max(1, opt.manquants)));
  const retire = new Set(
    opt.manquants ? sim.filter((_, i) => i % pas === 0).slice(0, opt.manquants) : [],
  );
  const garde = sim.filter((t) => !retire.has(t));
  const manquants = [...retire];

  const lignes = [];
  let flip = 0;
  for (let i = 0; i < garde.length; i++) {
    const t = garde[i];
    const eurParPoint = opt.eurParR / (t.entree - t.sl_initial);
    const entree = t.entree + opt.spread;
    let sortie = t.sortie;
    let sortie_t = t.sortie_t;
    let motif = t.motif === "tp" ? "tp" : t.motif === "sl_gap" ? "sl" : t.motif;
    // Quelques sorties volontairement divergentes : MT5 encaisse le stop, plus tôt,
    // là où Simula finit par prendre le gain.
    if (flip < opt.divergents && motif === "tp" && t.sortie_t > t.entree_t + 3600000) {
      sortie = t.sl_initial;
      sortie_t = t.entree_t + 3600000;
      motif = "sl";
      flip++;
    }
    const nuits = Math.floor((sortie_t - t.entree_t) / 86400000);
    lignes.push({
      entree_t: t.entree_t + dec,
      sortie_t: sortie_t + dec,
      entree,
      sortie,
      volume: 1,
      motif,
      commission: opt.commission,
      swap: nuits * opt.swapParNuit,
      profit: (sortie - entree) * eurParPoint,
      sl: t.sl_initial,
      tp: t.entree + (t.entree - t.sl_initial) * reglages.rr,
    });
  }
  // Trades que MT5 prend et que Simula n'a jamais vus : glissés dans un vrai trou,
  // pour qu'aucune position MT5 ne se chevauche (ce serait un artefact du gabarit).
  const ajoutes = [];
  const trous = [];
  for (let i = 0; i + 1 < lignes.length; i++) {
    if (lignes[i + 1].entree_t - lignes[i].sortie_t > 6 * 3600000) trous.push(i);
  }
  for (let i = 0; i < opt.ajoutes && trous.length; i++) {
    const j = trous[Math.floor(((i + 1) * trous.length) / (opt.ajoutes + 1))];
    const base = lignes[j];
    const a = {
      ...base,
      entree_t: base.sortie_t + 2 * 3600000,
      sortie_t: base.sortie_t + 3 * 3600000,
      motif: "sl",
      profit: -opt.eurParR,
      commission: opt.commission,
      swap: 0,
    };
    ajoutes.push(a);
    lignes.push(a);
  }
  lignes.sort((a, b) => a.entree_t - b.entree_t);

  const rapport =
    opt.forme === "positions" ? rapportPositions(lignes, opt) : rapportDeals(lignes, opt);

  return {
    csv,
    rapport,
    reglages,
    verite: {
      nSim: sim.length,
      nMt5: lignes.length,
      manquants: manquants.length,
      ajoutes: ajoutes.length,
      divergents: flip,
      decalageMs: dec,
      spread: opt.spread,
      eurParR: opt.eurParR,
      commissionTotale: lignes.reduce((a, x) => a + x.commission, 0),
      swapTotal: lignes.reduce((a, x) => a + x.swap, 0),
      netTotal: lignes.reduce((a, x) => a + x.profit + x.commission + x.swap, 0),
    },
  };
}

function tr(cs, tag = "td") {
  return `<tr>${cs.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
}

function rapportDeals(lignes, opt) {
  const out = [
    "<html><body><table>",
    tr([`<b>Strategy Tester Report</b>`]),
    tr(["Deals"]),
    tr(
      [
        "Time",
        "Deal",
        "Symbol",
        "Type",
        "Direction",
        "Volume",
        "Price",
        "Order",
        "Commission",
        "Swap",
        "Profit",
        "Balance",
        "Comment",
      ],
      "th",
    ),
    tr([
      stamp(lignes[0].entree_t - 86400000),
      "1",
      "",
      "balance",
      "",
      "",
      "",
      "",
      "0.00",
      "0.00",
      "0.00",
      "25 000.00",
      "",
    ]),
  ];
  let n = 2,
    solde = 25000;
  for (const l of lignes) {
    out.push(
      tr([
        stamp(l.entree_t),
        String(n++),
        opt.symbole,
        "buy",
        "in",
        l.volume.toFixed(2),
        l.entree.toFixed(5),
        String(n),
        eur(l.commission),
        "0.00",
        "0.00",
        eur(solde + l.commission),
        "",
      ]),
    );
    solde += l.profit + l.commission + l.swap;
    out.push(
      tr([
        stamp(l.sortie_t),
        String(n++),
        opt.symbole,
        "sell",
        "out",
        l.volume.toFixed(2),
        l.sortie.toFixed(5),
        String(n),
        "0.00",
        eur(l.swap),
        eur(l.profit),
        eur(solde),
        `${l.motif} ${l.sortie.toFixed(5)}`,
      ]),
    );
  }
  out.push("</table></body></html>");
  return out.join("\n");
}

function rapportPositions(lignes, opt) {
  const out = [
    "<html><body><table>",
    tr(["Positions"]),
    tr(
      [
        "Time",
        "Position",
        "Symbol",
        "Type",
        "Volume",
        "Price",
        "S / L",
        "T / P",
        "Time",
        "Price",
        "Commission",
        "Swap",
        "Profit",
      ],
      "th",
    ),
  ];
  let n = 1;
  for (const l of lignes) {
    out.push(
      tr([
        stamp(l.entree_t),
        String(n++),
        opt.symbole,
        "buy",
        l.volume.toFixed(2),
        l.entree.toFixed(5),
        l.sl.toFixed(5),
        l.tp.toFixed(5),
        stamp(l.sortie_t),
        l.sortie.toFixed(5),
        eur(l.commission),
        eur(l.swap),
        eur(l.profit),
      ]),
    );
  }
  out.push("</table></body></html>");
  return out.join("\n");
}
