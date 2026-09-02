// Un cœur de calcul. Reçoit un jeu de bougies puis des lots de variantes à mesurer,
// et renvoie les lignes de résultat. Aucune logique métier ici : tout vient du noyau,
// le même que celui du fil principal.
import { mesurerVariante } from './scan-noyau.js';

let df = null;

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'bougies') {
    // le jeu de bougies est envoyé une fois par instrument, pas par variante
    df = m.df;
    self.postMessage({ type: 'pret', sym: m.sym });
    return;
  }
  if (m.type === 'lot') {
    if (!df) { self.postMessage({ type: 'lot', id: m.id, out: [], echecs: ['bougies absentes'] }); return; }
    const out = [];
    const echecs = [];
    for (const v of m.variantes) {
      const r = mesurerVariante(df, v, m.periodes, m.sls, m.rrs);
      for (const x of r.out) out.push(x);
      for (const x of r.echecs) echecs.push(x);
    }
    self.postMessage({ type: 'lot', id: m.id, out, echecs });
  }
};
