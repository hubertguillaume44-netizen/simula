import { demoSeries } from "@/lib/demo";
import { DEFAULT_SETTINGS, controles, runBacktest, toScanRow } from "@/lib/engine";
import { verdict } from "@/lib/format";
import type { Controle, ScanRow } from "@/lib/types";

export type PreuveRow = ScanRow & { verdict: string; tone: "up" | "warn" | "down" | "muted" };

let cached: PreuveRow[] | null = null;

function key(r: ScanRow) {
  return `${r.sym}|${r.periode}|${r.sl}|${r.rr}`;
}

export function computePreuve(): PreuveRow[] {
  if (cached) return cached;
  const series = demoSeries();
  const grid = [
    { periode: 26, sl: 2.0, rr: 2.5 },
    { periode: 26, sl: 3.0, rr: 3 },
    { periode: 50, sl: 2.0, rr: 2.5 },
    { periode: 9, sl: 1.5, rr: 1.5 },
    { periode: 20, sl: 1.0, rr: 3 },
    { periode: 9, sl: 1.0, rr: 4 },
  ];
  const rows: ScanRow[] = [];
  for (const id of Object.keys(series)) {
    const df = series[id]!;
    for (const g of grid) {
      const out = runBacktest(df, { ...DEFAULT_SETTINGS, symbol: id }, g);
      if (out.resume.n < 20) continue;
      rows.push(toScanRow(id, g.periode, g.sl, g.rr, out.resume, out.segs, out.trades));
    }
  }
  rows.sort((a, b) => b.total - a.total);

  const picked: ScanRow[] = [];
  const take = (r: ScanRow | undefined) => {
    if (!r) return;
    if (picked.some((p) => key(p) === key(r))) return;
    picked.push(r);
  };

  take(rows[0]);
  take(rows.find((r) => r.positifs <= 3));
  take([...rows].sort((a, b) => a.positifs - b.positifs || b.total - a.total)[0]);
  const bySym = new Set(picked.map((r) => r.sym));
  for (const r of rows) {
    if (bySym.has(r.sym)) continue;
    take(r);
    bySym.add(r.sym);
    if (picked.length >= 5) break;
  }
  while (picked.length < 5) {
    const next = rows.find((r) => !picked.some((p) => key(p) === key(r)));
    if (!next) break;
    take(next);
  }
  picked.sort((a, b) => b.total - a.total);

  cached = picked.map((r) => {
    const v = verdict(r.positifs, r.segTotal);
    return { ...r, verdict: v.label, tone: v.tone };
  });
  return cached;
}

// ————— LA MESURE DE L'ACCUEIL, CALCULÉE ET NON ÉCRITE —————
//
// L'accueil montre une mesure à côté de son titre. Elle ne peut pas être un chiffre
// tapé dans le JSX : un nombre en dur devient faux le jour où le moteur change, et il
// n'y a rien pour le signaler — la vitrine se met alors à décrire un produit qui
// n'existe plus. Celle-ci sort du VRAI moteur, sur les séries de démonstration, par le
// même chemin que le tableau de la page Méthode.
//
// QUELLE LIGNE. Celle du plus gros gain brut PARMI CELLES QUI ÉCHOUENT à un contrôle —
// c'est-à-dire le plus beau chiffre que Véna refuse de retenir. C'est tout l'argument :
// une carte qui passerait cinq contrôles sur cinq ferait publicité, et l'intérêt est
// précisément que l'outil contredise son propriétaire.
//
// La règle est un TRI, pas un choix écrit : si un jour toutes les configurations
// passent, on retombe sur la première et la carte reste vraie — elle montrera alors
// cinq contrôles tenus, ce qui sera le cas. On ne fabrique pas un échec.
export type Vitrine = {
  row: PreuveRow;
  controles: Controle[];
  passes: number;
  total: number;
};

export function vitrine(): Vitrine | null {
  const rows = computePreuve();
  if (!rows.length) return null;
  const echoue = (r: PreuveRow) => controles(r).some((x) => x.ok === false);
  // `computePreuve()` trie déjà par gain brut décroissant : la première qui échoue est
  // donc la plus grosse de celles-là.
  const row = rows.find(echoue) ?? rows[0]!;
  const c = controles(row);
  // `ok === null` = non mesurable. Ni réussite ni échec : il ne compte pas au total,
  // et sa valeur s'écrit « — ».
  const mesures = c.filter((x) => x.ok !== null);
  return {
    row,
    controles: c,
    passes: mesures.filter((x) => x.ok === true).length,
    total: mesures.length,
  };
}
