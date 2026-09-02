/**
 * Lecture d'un rapport du testeur de stratégies MetaTrader 5.
 *
 * Accepte, sans configuration :
 *   - le rapport HTML complet (ReportTester-….html, « Rapport » / « Rapport ouvert XML »),
 *   - un copier-coller des onglets « Transactions » / « Ordres » / « Positions »,
 *   - un export CSV/TSV de ces mêmes onglets.
 *
 * Produit une liste de trades aller-retour normalisée :
 *   { entree_t, entree, sortie_t, sortie, motif, volume, commission, swap, profit, net }
 * où les temps sont des millisecondes epoch lues telles quelles (heure du serveur,
 * sans conversion) : le décalage éventuel est mesuré ensuite par le comparateur.
 */

const ENTITES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&#160;": " ",
};

function decoder(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTITES[e.toLowerCase()] ?? e)
    .replace(/[\u00a0\u202f\u2009]/g, " ");
}

/** Nombre MT5 : « 1 234.56 », « -2 863,00 », « 0.87654 ». Espaces = séparateurs de milliers. */
export function nombre(x) {
  if (typeof x === "number") return x;
  let s = String(x ?? "")
    .replace(/[\u2212\u2012\u2013\u2014\u2011]/g, "-") // signes moins typographiques
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/[^0-9,.+-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const dernierPoint = s.lastIndexOf(".");
  const derniereVirgule = s.lastIndexOf(",");
  if (dernierPoint >= 0 && derniereVirgule >= 0) {
    // Les deux présents : le dernier est le séparateur décimal.
    if (dernierPoint > derniereVirgule) s = s.replace(/,/g, "");
    else s = s.replace(/\./g, "").replace(",", ".");
  } else if (derniereVirgule >= 0) {
    // MT5 sépare les milliers par une espace : une virgule seule est décimale.
    s = s.replace(",", ".");
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

/** Horodatage MT5 : « 2024.03.15 09:00:00 », « 15.03.2024 09:00 », « 2024-03-15T09:00 ». */
export function horodatage(x) {
  const s = String(x ?? "").trim();
  const m = /(\d{1,4})[.\-/](\d{1,2})[.\-/](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
    s,
  );
  if (!m) return null;
  const a = +m[1],
    b = +m[2],
    c = +m[3];
  const an = String(m[1]).length === 4 ? a : c;
  const jour = String(m[1]).length === 4 ? c : a;
  const ms = Date.UTC(an, b - 1, jour, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return Number.isFinite(ms) ? ms : null;
}

/** Découpe le texte collé en lignes de cellules, que ce soit du HTML ou du texte tabulé. */
export function cellules(texte) {
  const brut = String(texte ?? "");
  if (/<t[rd]\b/i.test(brut)) {
    const lignes = [];
    for (const tr of brut.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cs = [];
      for (const td of tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []) {
        cs.push(
          decoder(td.replace(/<[^>]*>/g, ""))
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
      if (cs.length) lignes.push(cs);
    }
    return lignes;
  }
  const lignes = [];
  for (const ligne of brut.replace(/^\ufeff/, "").split(/\r?\n/)) {
    const l = decoder(ligne).replace(/\s+$/, "");
    if (!l.trim()) continue;
    let cs;
    if (l.includes("\t")) cs = l.split("\t");
    else if (/;/.test(l) && l.split(";").length >= 4) cs = l.split(";");
    else if (/ {2,}/.test(l)) cs = l.split(/ {2,}/);
    else cs = [l];
    lignes.push(cs.map((c) => c.trim()));
  }
  return lignes;
}

const CLES = {
  heure: ["time", "heure", "open time", "heure d'ouverture", "date"],
  transaction: ["deal", "transaction", "trade", "op\u00e9ration", "operation"],
  position: ["position"],
  ordre: ["order", "ordre"],
  symbole: ["symbol", "symbole"],
  type: ["type"],
  direction: ["direction", "sens"],
  volume: ["volume", "lots", "size"],
  prix: ["price", "prix", "cours"],
  sl: ["s / l", "s/l", "sl", "stop loss"],
  tp: ["t / p", "t/p", "tp", "take profit"],
  commission: ["commission", "commissions"],
  swap: ["swap", "swaps", "\u00e9change", "echange"],
  profit: ["profit", "b\u00e9n\u00e9fice", "benefice", "resultat", "r\u00e9sultat", "p/l"],
  balance: ["balance", "solde"],
  etat: ["state", "état", "etat"],
  commentaire: ["comment", "commentaire"],
};

function cle(nom) {
  const n = nom.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [k, alias] of Object.entries(CLES)) if (alias.includes(n)) return k;
  return null;
}

/** Reconnaît une ligne d'en-tête et renvoie la carte colonne → index (doublons suffixés _2). */
function enTete(cs) {
  const carte = {};
  let connus = 0;
  cs.forEach((c, i) => {
    const k = cle(c);
    if (!k) return;
    connus++;
    carte[k in carte ? `${k}_2` : k] = i;
  });
  if (connus < 4) return null;
  if (!("heure" in carte) || !("prix" in carte)) return null;
  return carte;
}

const SECTIONS = {
  transactions: /^(deals?|transactions?|trades)$/i,
  ordres: /^(orders?|ordres?)$/i,
  positions: /^(positions?)$/i,
};

function section(cs) {
  const seul = cs.filter((c) => c !== "");
  if (seul.length !== 1) return null;
  for (const [nom, re] of Object.entries(SECTIONS)) if (re.test(seul[0])) return nom;
  return null;
}

const ENTRANT = /^(in|entr|buy in|achat)/i;
const SORTANT = /^(out|sort|sell out|vente)/i;

function motifDe(commentaire, type) {
  const c = String(commentaire ?? "").toLowerCase();
  if (/\bt\s*\/?\s*p\b|\btp\b|take profit/.test(c)) return "tp";
  if (/\bs\s*\/?\s*l\b|\bsl\b|stop loss/.test(c)) return "sl";
  if (/\bso\b|stop out/.test(c)) return "so";
  if (/close at stop|clôture à la fin|end of test|fin du test/i.test(c)) return "fin";
  if (
    String(type ?? "")
      .toLowerCase()
      .includes("balance")
  )
    return "balance";
  return c.trim() ? "autre" : "";
}

/**
 * MT5 commente « sl » toute sortie au stop, y compris quand ce stop a été remonté au
 * point mort : le rapport ne distingue pas un stop plein d'un trade rendu à l'équilibre.
 * On les sépare sur le seul indice présent dans le rapport — le profit — étalonné sur la
 * perte médiane des stops de CE rapport, sans rien supposer de l'instrument.
 * Le motif d'origine reste lisible dans `motifBrut`.
 */
export function separerPointsMorts(trades, fraction = 0.25) {
  const pertes = trades.filter((t) => t.motif === "sl" && t.profit < 0).map((t) => -t.profit);
  if (pertes.length < 3) return trades;
  const v = [...pertes].sort((a, b) => a - b);
  const perteMediane = v[Math.floor(v.length / 2)];
  const seuil = perteMediane * fraction;
  for (const t of trades) {
    if (t.motif !== "sl") continue;
    t.motifBrut = "sl";
    if (Math.abs(t.profit) < seuil) t.motif = "be";
  }
  return trades;
}

/**
 * Analyse un rapport MT5 et renvoie
 * { trades, sections: {…nb de lignes lues…}, source: 'positions'|'transactions', avertissements }
 */
export function lireRapportMt5(texte) {
  const lignes = cellules(texte);
  const avertissements = [];
  const tables = { transactions: [], ordres: [], positions: [] };
  let courante = null;
  let carte = null;

  for (const cs of lignes) {
    const s = section(cs);
    if (s) {
      courante = s;
      carte = null;
      continue;
    }
    const h = enTete(cs);
    if (h) {
      carte = h;
      if (!courante) {
        // En-tête sans titre de section : on devine d'après les colonnes.
        courante =
          "direction" in h || "transaction" in h
            ? "transactions"
            : "etat" in h
              ? "ordres"
              : "position" in h || "prix_2" in h
                ? "positions"
                : "transactions";
      }
      continue;
    }
    if (!carte || !courante) continue;
    const val = (k) => (carte[k] === undefined ? undefined : cs[carte[k]]);
    if (horodatage(val("heure")) === null) continue;
    tables[courante].push({ cs, val });
  }

  const compte = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));

  // 1) Les « Positions » donnent directement l'aller-retour : c'est la source la plus sûre.
  if (tables.positions.length) {
    const trades = [];
    for (const { val } of tables.positions) {
      const type = String(val("type") ?? "").toLowerCase();
      if (type.includes("balance")) continue;
      const entree_t = horodatage(val("heure"));
      const sortie_t = horodatage(val("heure_2")) ?? entree_t;
      const entree = nombre(val("prix"));
      const sortie = nombre(val("prix_2"));
      if (entree === null || sortie === null) continue;
      const commission = nombre(val("commission")) ?? 0;
      const swap = nombre(val("swap")) ?? 0;
      const profit = nombre(val("profit")) ?? 0;
      trades.push({
        entree_t,
        entree,
        sortie_t,
        sortie,
        sens: type.includes("sell") ? "sell" : "buy",
        volume: nombre(val("volume")) ?? 0,
        sl_mt5: nombre(val("sl")),
        tp_mt5: nombre(val("tp")),
        motif: motifDe(val("commentaire"), type),
        commission,
        swap,
        profit,
        net: profit + commission + swap,
      });
    }
    if (trades.length) {
      return {
        trades: separerPointsMorts(trades.sort((a, b) => a.entree_t - b.entree_t)),
        source: "positions",
        compte,
        avertissements,
      };
    }
  }

  // 2) Sinon on apparie les transactions « in » → « out ».
  if (!tables.transactions.length) {
    avertissements.push(
      "Aucune table exploitable trouvée dans le rapport MT5 (ni Positions, ni Transactions/Deals).",
    );
    return { trades: [], source: "aucune", compte, avertissements };
  }

  const deals = tables.transactions
    .map(({ val }) => ({
      t: horodatage(val("heure")),
      type: String(val("type") ?? "").toLowerCase(),
      direction: String(val("direction") ?? "").toLowerCase(),
      volume: nombre(val("volume")) ?? 0,
      prix: nombre(val("prix")),
      commission: nombre(val("commission")) ?? 0,
      swap: nombre(val("swap")) ?? 0,
      profit: nombre(val("profit")) ?? 0,
      commentaire: val("commentaire") ?? "",
    }))
    .filter((d) => d.t !== null && !d.type.includes("balance"))
    .sort((a, b) => a.t - b.t);

  const trades = [];
  let ouverte = null;
  for (const d of deals) {
    const entrant = ENTRANT.test(d.direction) || (!d.direction && !ouverte);
    const sortant = SORTANT.test(d.direction) || (!d.direction && !!ouverte);
    if (entrant && !sortant) {
      if (ouverte) {
        avertissements.push(
          `Transaction entrante à ${new Date(d.t).toISOString()} alors qu'une position est ouverte : position précédente abandonnée.`,
        );
      }
      ouverte = {
        entree_t: d.t,
        entree: d.prix,
        sens: d.type.includes("sell") ? "sell" : "buy",
        volume: d.volume,
        reste: d.volume,
        commission: d.commission,
        swap: d.swap,
        profit: 0,
        sortie_num: 0,
        sortie_den: 0,
        sortie_t: d.t,
        motif: "",
      };
      continue;
    }
    if (!sortant || !ouverte) continue;
    ouverte.commission += d.commission;
    ouverte.swap += d.swap;
    ouverte.profit += d.profit;
    ouverte.sortie_num += (d.prix ?? 0) * (d.volume || 1);
    ouverte.sortie_den += d.volume || 1;
    ouverte.sortie_t = d.t;
    ouverte.motif = motifDe(d.commentaire, d.type) || ouverte.motif;
    ouverte.reste -= d.volume;
    if (ouverte.reste > 1e-8) continue;
    trades.push({
      entree_t: ouverte.entree_t,
      entree: ouverte.entree,
      sortie_t: ouverte.sortie_t,
      sortie: ouverte.sortie_num / (ouverte.sortie_den || 1),
      sens: ouverte.sens,
      volume: ouverte.volume,
      sl_mt5: null,
      tp_mt5: null,
      motif: ouverte.motif,
      commission: ouverte.commission,
      swap: ouverte.swap,
      profit: ouverte.profit,
      net: ouverte.profit + ouverte.commission + ouverte.swap,
    });
    ouverte = null;
  }
  if (ouverte)
    avertissements.push("Une position MT5 reste ouverte en fin de rapport : elle est ignorée.");
  return {
    trades: separerPointsMorts(trades.sort((a, b) => a.entree_t - b.entree_t)),
    source: "transactions",
    compte,
    avertissements,
  };
}
