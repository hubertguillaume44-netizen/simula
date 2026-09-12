// ————— LES DIX SÉRIES D'EXEMPLE NE DOIVENT PAS MENTIR —————
//
// Elles sont ENGENDRÉES, pas livrées : quelques kilooctets de code, zéro octet de
// données, les mêmes séries pour tout le monde. Rien des exports d'un utilisateur
// n'entre dans le produit.
//
// Le test fait tourner LE VRAI générateur, extrait de `Vena.dc.html`. Une copie du
// code dans le test prouverait que la copie fonctionne, ce qui n'intéresse personne.
//
// LA GARDE QUI COMPTE EST LA DERNIÈRE : l'absence d'artefact exploitable. Si les
// rendements horaires portent une autocorrélation, un balayage trouvera un « signal »
// qui n'existe que dans le générateur — et le premier utilisateur qui le voit croira
// que son idée fonctionne. C'est le seul défaut de ce chantier qui pourrait coûter la
// crédibilité de l'outil : les autres gardes protègent le produit, celle-ci protège
// l'honnêteté de la démonstration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const RACINE = new URL("../../", import.meta.url);
const SOURCE = readFileSync(new URL("Vena.dc.html", RACINE), "utf8");

const DEBUT_BLOC = "// ————— LES DIX SÉRIES D'EXEMPLE SONT ENGENDRÉES, JAMAIS LIVRÉES —————";
const FIN_BLOC = "// ————— FIN DU GÉNÉRATEUR D'EXEMPLES —————";

/** Le générateur, tel qu'il est dans la source — pas une copie. */
async function charger() {
  const i = SOURCE.indexOf(DEBUT_BLOC);
  const j = SOURCE.indexOf(FIN_BLOC);
  assert.ok(i > 0 && j > i, "le bloc du générateur ne se délimite plus dans Vena.dc.html");
  const code = SOURCE.slice(i, j)
    + "\nexport { GRAINE_EXEMPLE, EXEMPLES, SEANCES_EXEMPLE, REGIMES_EXEMPLE,"
    + " engendrerExemple, facteurMacro, regimeDe, decalageRegime };";
  return import("data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64"));
}

const G = await charger();
// Une date FIXE : le générateur ne lit aucune horloge — une série qui changerait avec
// le jour ne serait pas reproductible, et un scan d'hier ne se relirait pas.
const DEBUT = Date.UTC(2022, 8, 12, 0, 0, 0);
const HEURES = 3 * 365 * 24;
const macro = G.facteurMacro(HEURES);
const series = new Map(G.EXEMPLES.map(([id]) => [id, G.engendrerExemple(id, DEBUT, macro)]));

/** Les rendements logarithmiques d'une série, de clôture à clôture. */
function rendements(df) {
  const r = [];
  for (let i = 1; i < df.n; i++) r.push(Math.log(df.c[i] / df.c[i - 1]));
  return r;
}

/** L'autocorrélation des rendements au retard k. */
function autocorrelation(r, k) {
  let m = 0;
  for (const x of r) m += x;
  m /= r.length;
  let num = 0, den = 0;
  for (let i = 0; i < r.length - k; i++) num += (r[i] - m) * (r[i + k] - m);
  for (const x of r) den += (x - m) * (x - m);
  return den ? num / den : 0;
}

test("la graine est gelée, versionnée, et la table porte dix familles", () => {
  // ON NE CHOISIT PAS UNE GRAINE, ON LA VERSIONNE. Gelée, parce qu'un scan enregistré
  // hier doit se relire sur les mêmes bougies. Versionnée, parce que le jour où le
  // générateur change, les bougies changent : le numéro suit, et la rupture devient
  // visible au lieu de silencieuse. La v2 date du lissage et de la dispersion des
  // régimes ; la v1 était l'escalier commun aux dix familles.
  //
  // Ce test échoue donc à CHAQUE changement du générateur, et c'est voulu : il oblige à
  // décider si les bougies ont bougé — et à le dire — plutôt qu'à s'en apercevoir le
  // jour où un scan enregistré ne se relit plus.
  assert.equal(G.GRAINE_EXEMPLE, "vena-exemple-v2");
  assert.equal(G.EXEMPLES.length, 10, "dix familles attendues");
  const ids = G.EXEMPLES.map((e) => e[0]);
  assert.deepEqual([...new Set(ids)], ids, "deux familles portent le même identifiant");
  for (const [id, lib] of G.EXEMPLES) {
    // identifiant machine en minuscules sans accent, libellé humain en capitales
    assert.match(id, /^vx-[a-z0-9]+$/, `« ${id} » n’est pas un identifiant machine`);
    assert.equal(lib, lib.toUpperCase(), `« ${lib} » n’est pas le libellé humain`);
    // un ticker manifestement inventé : personne ne doit le confondre avec un vrai
    assert.match(lib, /^VX-/, `« ${lib} » pourrait passer pour un instrument réel`);
  }
});

test("déterminisme : deux générations donnent la même série, au bit près", () => {
  const condense = (df) => createHash("sha256")
    .update(JSON.stringify([df.t, df.o, df.h, df.l, df.c, df.v])).digest("hex").slice(0, 16);
  for (const [id] of G.EXEMPLES) {
    const a = condense(series.get(id));
    const b = condense(G.engendrerExemple(id, DEBUT, G.facteurMacro(HEURES)));
    assert.equal(a, b, `${id} diverge d’une génération à l’autre`);
  }
});

test("cohérence OHLC : le haut et le bas ne contredisent jamais le chemin", () => {
  for (const [id, lib, , , , , , digits] of G.EXEMPLES) {
    const df = series.get(id);
    const pas = Math.pow(10, digits);
    for (let i = 0; i < df.n; i++) {
      const haut = Math.max(df.o[i], df.c[i]), bas = Math.min(df.o[i], df.c[i]);
      assert.ok(df.h[i] >= haut, `${lib} bougie ${i} : haut sous le corps`);
      assert.ok(df.l[i] <= bas, `${lib} bougie ${i} : bas au-dessus du corps`);
      assert.ok(df.l[i] > 0, `${lib} bougie ${i} : prix nul ou négatif`);
      // arrondi aux digits de la famille : un prix à quinze décimales trahirait le calcul
      for (const v of [df.o[i], df.h[i], df.l[i], df.c[i]]) {
        assert.ok(Math.abs(v * pas - Math.round(v * pas)) < 1e-6,
          `${lib} bougie ${i} : ${v} n’est pas arrondi à ${digits} décimales`);
      }
    }
  }
});

test("cadence : une heure pleine, et rien hors séance", () => {
  for (const [id, lib, , seance] of G.EXEMPLES) {
    const df = series.get(id);
    const s = G.SEANCES_EXEMPLE[seance];
    for (let i = 1; i < df.n; i++) {
      assert.equal((df.t[i] - df.t[i - 1]) % 3600000, 0,
        `${lib} : un écart qui n’est pas un multiple de soixante minutes`);
    }
    for (let i = 0; i < df.n; i++) {
      const d = new Date(df.t[i]);
      assert.ok(s.semaine.includes(d.getUTCDay()), `${lib} : une bougie hors jours de séance`);
      if (s.h) {
        assert.ok(d.getUTCHours() >= s.h[0] && d.getUTCHours() <= s.h[1],
          `${lib} : une bougie à ${d.getUTCHours()} h, hors séance`);
      }
    }
    // le week-end n'existe que pour la crypto
    const weekend = [...df.t].some((ms) => [0, 6].includes(new Date(ms).getUTCDay()));
    assert.equal(weekend, seance === "continu7",
      `${lib} : présence de week-end incohérente avec sa séance`);
  }
});

test("volume de bougies : à 10 % près du compte attendu sur trois ans", () => {
  for (const [id, lib, , seance] of G.EXEMPLES) {
    const s = G.SEANCES_EXEMPLE[seance];
    const parJour = s.h ? s.h[1] - s.h[0] + 1 : 24;
    const attendu = parJour * s.semaine.length * (365 * 3 / 7);
    const vu = series.get(id).n;
    const ecart = Math.abs(vu - attendu) / attendu;
    assert.ok(ecart <= 0.10,
      `${lib} : ${vu} bougies, ${Math.round(attendu)} attendues — ${(ecart * 100).toFixed(1)} % d’écart`);
  }
});

test("la volatilité réalisée est celle qui est annoncée", () => {
  // ANNONCER UN CHIFFRE ET EN LIVRER UN AUTRE est le défaut qu'on reproche aux
  // backtests. Sans les deux corrections du générateur — le choc macro divisé par √SOUS,
  // et les régimes normalisés — chaque famille réalisait 1,9 fois sa volatilité.
  for (const [id, lib, , seance, volAn] of G.EXEMPLES) {
    const s = G.SEANCES_EXEMPLE[seance];
    const parAn = (s.h ? s.h[1] - s.h[0] + 1 : 24) * s.semaine.length * 52;
    const r = rendements(series.get(id));
    let m = 0;
    for (const x of r) m += x;
    m /= r.length;
    let v = 0;
    for (const x of r) v += (x - m) * (x - m);
    const vu = Math.sqrt(v / (r.length - 1)) * Math.sqrt(parAn);
    assert.ok(Math.abs(vu - volAn) / volAn <= 0.15,
      `${lib} : ${(vu * 100).toFixed(1)} % réalisés pour ${(volAn * 100).toFixed(0)} % annoncés`);
  }
});

test("aucun artefact exploitable : |autocorrélation| < 0,08 aux retards 1 à 48", () => {
  // CELUI-LÀ NE SE SAUTE PAS. Un motif horaire ou hebdomadaire répétable donnerait à un
  // balayage un « signal » qui n'existe que dans le générateur, et le premier
  // utilisateur qui le voit croirait que son idée fonctionne.
  let pire = { v: 0 };
  for (const [id, lib] of G.EXEMPLES) {
    const r = rendements(series.get(id));
    for (let k = 1; k <= 48; k++) {
      const a = Math.abs(autocorrelation(r, k));
      if (a > pire.v) pire = { v: a, lib, k };
      assert.ok(a < 0.08, `${lib} : autocorrélation ${a.toFixed(4)} au retard ${k}`);
    }
  }
  assert.ok(pire.v < 0.08, `pire cas : ${pire.lib} au retard ${pire.k}`);
});

test("la baisse maximale est plausible pour la volatilité annoncée", () => {
  // LA DIXIÈME GARDE, et elle manquait. Les neuf autres mesurent la volatilité et
  // l'autocorrélation — aucune ne regarde la BAISSE. Or c'est par là qu'une série
  // d'exemple se trahit : une défensive à 15 % qui perd 60 % se lit comme faux, et une
  // famille qui ne recule jamais se lit comme une publicité.
  //
  // L'ÉCHELLE EST σ√T, PAS σ. La première écriture de cette garde comparait le creux de
  // TROIS ANS à la volatilité d'UN an, avec une plage 0,6–3 relevée sur les dix familles
  // d'alors. C'est deux fautes : une marche aléatoire s'écarte en √T, donc le creux de
  // trois ans se compare à σ√3 ; et une borne relevée sur dix observations d'un seul
  // tirage n'est pas une borne, c'est une description de ce tirage — au changement de
  // graine, `VX-EUR` sortait à 3,54 sans que rien ne soit cassé.
  //
  // La borne vient donc du calcul et non du relevé : pour une marche sans dérive, le
  // creux attendu sur [0, T] vaut environ 1,25 σ√T. Les régimes en ajoutent dans les
  // deux sens — une dérive baissière le creuse, une dérive haussière le comble — d'où
  // une plage large, 0,3 à 2,5. En deçà, la série monte sans jamais faire douter ;
  // au-delà, elle s'effondre plus que sa volatilité ne l'annonce, et le chiffre du
  // tableau devient un mensonge de plus.
  const creux = (c) => {
    let haut = -Infinity, pire = 0;
    for (const x of c) {
      if (x > haut) haut = x;
      const d = (x - haut) / haut;
      if (d < pire) pire = d;
    }
    return pire;
  };
  for (const [id, lib, , , volAn] of G.EXEMPLES) {
    const d = Math.abs(creux(series.get(id).c));
    const rapport = d / (volAn * Math.sqrt(3));
    assert.ok(rapport >= 0.3 && rapport <= 2.5,
      `${lib} : creux de ${(d * 100).toFixed(1)} % pour ${(volAn * 100).toFixed(0)} % de volatilité `
      + `— ${rapport.toFixed(2)} fois σ√3, hors de la plage 0,3 à 2,5`);
    // et aucune famille ne doit perdre presque tout : même la crypto reste lisible
    assert.ok(d < 0.85, `${lib} : creux de ${(d * 100).toFixed(1)} %, la série s’effondre`);
  }
});

test("le facteur commun agit : les familles ne sont pas dix marches indépendantes", () => {
  // Sans lui, un portefeuille de dix lignes paraîtrait dix fois moins risqué qu'il ne
  // l'est — et un scan à dix instruments n'apprendrait rien sur la corrélation, qui est
  // la première chose qu'un portefeuille doit regarder.
  const parDate = (id) => {
    const df = series.get(id), m = new Map();
    for (let i = 1; i < df.n; i++) m.set(df.t[i], Math.log(df.c[i] / df.c[i - 1]));
    return m;
  };
  const cor = (X, Y) => {
    const ks = [...X.keys()].filter((k) => Y.has(k));
    const mx = ks.reduce((s, k) => s + X.get(k), 0) / ks.length;
    const my = ks.reduce((s, k) => s + Y.get(k), 0) / ks.length;
    let n = 0, dx = 0, dy = 0;
    for (const k of ks) {
      const a = X.get(k) - mx, b = Y.get(k) - my;
      n += a * b; dx += a * a; dy += b * b;
    }
    return n / Math.sqrt(dx * dy);
  };
  const deuxIndices = cor(parDate("vx-500"), parDate("vx-2000"));
  assert.ok(deuxIndices > 0.3,
    `deux indices de bêta 1,0 et 1,2 ne sont corrélés qu’à ${deuxIndices.toFixed(2)}`);
  // VX-OR porte un bêta négatif pour qu'une famille aille à contre-courant
  const or = cor(parDate("vx-500"), parDate("vx-or"));
  assert.ok(or < 0, `VX-OR devrait aller à contre-courant, corrélation ${or.toFixed(2)}`);
});

test("les dix familles n’entrent pas en crise le même jour", () => {
  // ————— LA ONZIÈME GARDE, ET C'EST LA PLUS DIFFICILE À VOIR —————
  //
  // Le profil de régime était un escalier COMMUN : à une heure connue d'avance, la même
  // pour tout le monde à jamais, la volatilité des dix familles triplait d'un coup. Un
  // balayage de sortie de volatilité — l'usage même de l'outil — se serait déclenché là,
  // sur une propriété du générateur et non d'un marché.
  //
  // AUCUNE DES DIX AUTRES GARDES NE LE VOIT. L'autocorrélation mesure une dépendance
  // dans la MOYENNE des rendements, et reste aveugle à un changement de VARIANCE :
  // 0,049 passait pendant que l'escalier était là. La volatilité annoncée est une
  // moyenne sur trois ans, donc elle passe aussi. Le creux ne regarde que le prix.
  //
  // ON A D'ABORD CHERCHÉ CE DÉFAUT À L'ŒIL, sur l'allure des courbes : des fondus de 15,
  // 45 et 75 jours donnaient des tracés indiscernables, on a conclu qu'il n'y avait rien
  // et on a retiré le fondu. C'était mesurer la mauvaise grandeur. Deux courbes
  // indiscernables peuvent porter des profils de variance opposés — la forme n'est pas
  // la statistique.
  //
  // LA MESURE : toutes les douze bougies, le rapport des volatilités réalisées sur les
  // 240 bougies suivantes et les 240 précédentes. Son maximum absolu tombe, pour chaque
  // famille, à l'entrée du choc — c'est voulu, un régime de volatilité EXISTE. Ce qui
  // n'est pas voulu, c'est que les dix dates soient la même : sur l'escalier commun
  // elles tenaient dans DEUX jours, `VX-OR` et son bêta négatif compris — une excursion
  // de prix partagée ne peut pas produire ça, la variance dépend de l'amplitude du
  // facteur et non de son signe.
  //
  // LA GARDE PORTE DONC SUR L'ÉTALEMENT, pas sur la hauteur du rapport. Un seuil sur la
  // hauteur interdirait la fonction (un régime de volatilité) en croyant interdire le
  // défaut (qu'il soit synchrone) : 240 bougies valent dix jours pour une devise et
  // trente-quatre pour une action, donc cette fenêtre compare deux régimes entiers et
  // reste au-dessus de 1,8 quel que soit le lissage — mesuré sur cinq largeurs de fondu.
  const N = 240, PAS = 12;
  const ecartType = (a) => {
    let m = 0; for (const x of a) m += x; m /= a.length;
    let s2 = 0; for (const x of a) s2 += (x - m) * (x - m);
    return Math.sqrt(s2 / (a.length - 1));
  };
  const dates = [];
  for (const [id, lib] of G.EXEMPLES) {
    const df = series.get(id), r = rendements(df);
    let haut = 0, quand = -1;
    for (let k = N; k + N <= r.length; k += PAS) {
      const rap = ecartType(r.slice(k, k + N)) / ecartType(r.slice(k - N, k));
      if (rap > haut) { haut = rap; quand = k; }
    }
    assert.ok(quand > 0, `${lib} : trop court pour la mesure`);
    dates.push(df.t[quand + 1]);
  }
  const etalement = (Math.max(...dates) - Math.min(...dates)) / 86400000;
  assert.ok(etalement >= 30,
    `les dix maxima de variance tiennent en ${etalement.toFixed(1)} jours — un vrai marché a `
    + `des crises communes, il n’a pas le maximum de variance de chaque instrument le même jour`);
});

test("le profil de régime ne fait pas de marche, et chaque famille a la sienne", () => {
  // Le complément déterministe de la garde précédente : celle-là mesure un ÉCHANTILLON
  // de prix, avec son bruit d'estimation ; celle-ci mesure le PROFIL, qui n'en a pas.
  // Les deux peuvent tomber pour des raisons différentes, et c'est le but.
  const MOIS_H = 365 * 24 / 12;
  let pire = 0;
  for (const [id, lib] of G.EXEMPLES) {
    const dec = G.decalageRegime(id);
    for (let h = 0; h + 24 <= 3 * 365 * 24; h += 24) {
      const a = G.regimeDe(h / MOIS_H, dec).facteurVol;
      const b = G.regimeDe((h + 24) / MOIS_H, dec).facteurVol;
      const v = Math.abs(b / a - 1);
      if (v > pire) pire = v;
      assert.ok(v < 0.10,
        `${lib} : la volatilité change de ${(v * 100).toFixed(1)} % en vingt-quatre heures`);
    }
  }
  assert.ok(pire > 0.001, "le profil ne bouge plus du tout : les cinq régimes ont disparu");

  // et les dix décalages sont bien DISTINCTS — un tirage qui les collerait tous à zéro
  // remettrait l'escalier commun sans qu'aucune autre garde ne le dise
  const decs = G.EXEMPLES.map(([id]) => G.decalageRegime(id));
  const jours = decs.map((d) => d * 365 / 12);
  assert.ok(Math.max(...jours) - Math.min(...jours) > 20,
    `les dix entrées en régime tiennent en ${(Math.max(...jours) - Math.min(...jours)).toFixed(1)} jours`);
});

test("le générateur ne lit aucune horloge et n’écrit nulle part", () => {
  // Une série qui changerait avec la date du jour ne serait pas reproductible. Et une
  // série écrite dans le stockage de l’utilisateur cesserait d’être un exemple : elle
  // deviendrait une donnée, à migrer, à exporter, à peser dans la jauge.
  const i = SOURCE.indexOf(DEBUT_BLOC), j = SOURCE.indexOf(FIN_BLOC);
  const bloc = SOURCE.slice(i, j);
  assert.ok(!/Date\.now\(\)|new Date\(\)/.test(bloc),
    "le générateur lit une horloge : ses séries ne seraient pas reproductibles");
  assert.ok(!/localStorage|indexedDB|garderSerie|poserBareme/.test(bloc),
    "le générateur écrit dans le stockage : un exemple n’est pas une donnée");
});
