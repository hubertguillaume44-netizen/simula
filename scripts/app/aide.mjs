#!/usr/bin/env node
/**
 * Fabrique `aide-index.json` : toutes les explications déjà écrites dans la page.
 *
 * L'application contient plusieurs centaines d'attributs `title=` — « lecture basse »,
 * « pire creux », « 1 R », « segments positifs », « bougie ambiguë ». C'est exactement ce
 * qu'un client va demander, et c'est déjà rédigé. Le panneau d'aide n'a rien à rédiger :
 * il a besoin de cet index.
 *
 * À LA CONSTRUCTION, pas au chargement. Parcourir le DOM à l'ouverture du panneau
 * coûterait une seconde d'attente au premier clic — l'arbre de cette page est énorme.
 *
 *   node scripts/app/aide.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(new URL("../../", import.meta.url).pathname);

// Les vues de l'application, telles que le gabarit les déclare. Une explication porte les
// pages où elle apparaît : c'est ce qu'une infobulle ne peut pas faire, et ça vaut la
// moitié de l'intérêt du panneau.
const VUES = {
  vueCourtiers: "Mes instruments",
  vueMarche: "Marché",
  vuePortefeuille: "Portefeuille",
  vueScan: "Nouveau scan",
  vueHistorique: "Historique",
  vueBacktest: "Backtest",
  vueJournal: "Journal",
};

/** Les plages de lignes de chaque vue, par comptage de profondeur des <sc-if>. */
function plagesDeVues(lignes) {
  const plages = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/<sc-if value="\{\{ (vue[A-Za-zÀ-ÿ]+) \}\}"/);
    if (!m || !VUES[m[1]]) continue;
    let prof = 0;
    let j = i;
    for (; j < lignes.length; j++) {
      prof += (lignes[j].match(/<sc-if\b/g) || []).length;
      prof -= (lignes[j].match(/<\/sc-if>/g) || []).length;
      if (prof <= 0) break;
    }
    plages.push({ vue: VUES[m[1]], debut: i, fin: j });
  }
  return plages;
}

/** Le mot que l'infobulle explique : le texte de la balise, ou celui qui la précède. */
function termeDe(avant, dedans) {
  const propre = (t) =>
    t
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\{\{[^}]*\}\}/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // une balise qui porte son propre libellé le donne : <button title="…">Relancer</button>
  const dedansPropre = propre(dedans || "");
  if (dedansPropre && dedansPropre !== "?" && dedansPropre.length <= 60) return dedansPropre;
  // sinon, le point d'interrogation suit le mot qu'il explique. On coupe au premier « > »
  // pour ne pas partir du milieu d'une balise : le reste serait lu comme du texte, et le
  // terme récolterait des morceaux de style CSS.
  let avantP = avant.slice(-1500);
  const g = avantP.indexOf(">");
  if (g >= 0) avantP = avantP.slice(g + 1);
  let queue = propre(avantP);
  if (!queue) return "";
  // Le libellé cherché est ce qui suit le DERNIER point d'interrogation déjà posé : au-delà
  // commence l'explication d'un autre terme. Même chose après un point ou un deux-points.
  queue = queue.split(/[?:.!]/).pop();
  // les symboles d'interface — ×, ·, −, +, %, / — ne sont pas des mots
  queue = queue.replace(/[×·−–+/%*]/g, " ").replace(/\s+/g, " ").trim();
  if (!queue) return "";
  const mots = queue.split(" ").filter((x) => x.length > 1 || /[A-ZÀ-Þ0-9]/.test(x));
  return mots.slice(-5).join(" ").trim();
}

const src = readFileSync(path.join(RACINE, "Sivula.dc.html"), "utf8");
const lignes = src.split("\n");
const plages = plagesDeVues(lignes);
// décalages de début de ligne, pour retrouver la ligne d'un indice de caractère
const debutLigne = [];
{
  let n = 0;
  for (const l of lignes) {
    debutLigne.push(n);
    n += l.length + 1;
  }
}
const ligneDe = (i) => {
  let a = 0;
  let b = debutLigne.length - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (debutLigne[m] <= i) a = m;
    else b = m - 1;
  }
  return a;
};

// Une explication par TEXTE : la même phrase répétée sur trois pages fait une entrée
// portant trois pastilles, pas trois entrées identiques.
const parTexte = new Map();
const re = /title="([^"]{25,})"/g;
let m;
while ((m = re.exec(src))) {
  const texte = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // une infobulle dont le texte est un trou n'explique rien à la construction
  if (/\{\{/.test(texte)) continue;
  const finBalise = src.indexOf(">", re.lastIndex);
  const debutBalise = src.lastIndexOf("<", m.index);
  const nomBalise = (src.slice(debutBalise + 1, debutBalise + 12).match(/^[a-zA-Z-]+/) || [""])[0];
  const ferme = finBalise >= 0 ? src.indexOf("</" + nomBalise + ">", finBalise) : -1;
  const dedans = ferme > 0 && ferme - finBalise < 400 ? src.slice(finBalise + 1, ferme) : "";
  const terme = termeDe(src.slice(0, debutBalise), dedans);
  // un terme qui porte encore du gabarit n'est pas un terme
  if (!terme || /["{}<>=;]/.test(terme) || terme.length > 60) continue;
  const l = ligneDe(m.index);
  const vue = plages.find((p) => l >= p.debut && l <= p.fin);
  const cle = texte.slice(0, 120);
  if (!parTexte.has(cle)) parTexte.set(cle, { terme, texte, vues: [] });
  const e = parTexte.get(cle);
  // le terme le plus court est le plus probable : « Pire creux » plutôt que la phrase
  // entière de la cellule qui le précède
  if (terme.length < e.terme.length) e.terme = terme;
  const nom = vue ? vue.vue : "Toutes les pages";
  if (!e.vues.includes(nom)) e.vues.push(nom);
}

// LES EXPLICATIONS DYNAMIQUES. Les deux tiers des infobulles ne sont pas écrites dans le
// gabarit : elles sont calculées et posées par un trou, `title="{{ x.aide }}"`. Leur texte
// existe quand même, en clair, dans les chaînes du rendu. On les prend là, et le terme
// vient de la clé voisine qui nomme la chose expliquée — `nom`, `titre`, `txt`, `label`.
const reJs = /\b(?:aide|Aide)[A-Za-z]*: '((?:[^'\\]|\\.){40,})'/g;
let mj;
while ((mj = reJs.exec(src))) {
  const texte = mj[1]
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\n/g, " ")
    .replace(/\\\\/g, "\\");
  if (/\$\{|' \+ |\+ '/.test(mj[1])) continue;   // chaîne assemblée : pas un texte figé
  const avant = src.slice(Math.max(0, mj.index - 600), mj.index);
  const noms = [...avant.matchAll(/\b(?:nom|titre|txt|label|terme|libelle): '((?:[^'\\]|\\.){2,60})'/g)];
  const brut = noms.length ? noms[noms.length - 1][1] : "";
  const terme = brut
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\'/g, "'")
    .trim();
  if (!terme || /["{}<>=;]/.test(terme)) continue;
  const cle = texte.slice(0, 120);
  if (!parTexte.has(cle)) parTexte.set(cle, { terme, texte, vues: ["Toutes les pages"] });
}

const entrees = [...parTexte.values()].sort((a, b) => a.terme.localeCompare(b.terme, "fr"));
const sortie = path.join(RACINE, "aide-index.json");
writeFileSync(sortie, JSON.stringify({ entrees }, null, 1) + "\n");
console.log(`aide-index.json écrit — ${entrees.length} explications, `
  + `${new Set(entrees.flatMap((e) => e.vues)).size} pages.`);
