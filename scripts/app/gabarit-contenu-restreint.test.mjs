// ————— UNE BOUCLE DE GABARIT DANS UN CONTENEUR À CONTENU RESTREINT —————
//
// `<select>`, `<table>`, `<tbody>`, `<tr>`, `<ul>`… ne se remplissent pas comme un
// `<div>`. La norme HTML leur donne un MODE D'INSERTION propre : en mode « in select »,
// toute balise d'ouverture qui n'est ni `option`, ni `optgroup`, ni `hr`, ni un script
// est ignorée ; en mode « in table body », un élément étranger est extrait de la table
// et reposé avant elle. Une `sc-for` ou une `sc-if` placée là dépend donc du moteur.
//
// MESURÉ sur le fichier livré, analysé par le vrai analyseur HTML sans exécuter les
// scripts : sur 452 balises de gabarit, 27 sont enfants directs d'un `<select>` — ce
// Chromium-là les garde — et 37 portant des `<tr>`/`<td>` se retrouvent REPOSÉES HORS
// de leur table. Chez un utilisateur, en vue intégrée, le sélecteur de comptes
// n'affichait qu'une option vide : la liste n'arrivait jamais au DOM.
//
// CE TEST EST UN CLIQUET, pas une interdiction. Tout convertir demanderait de refaire
// vingt-cinq menus déroulants et dix-sept tableaux, ce qui n'est pas une passe à mener
// la veille d'une publication. Il fige donc ce qui existe et refuse tout AJOUT : la
// classe de défaut ne peut plus grandir, et le reste se traite en une passe dédiée.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");

// Les conteneurs dont la norme restreint le contenu, et qui ont donc un mode
// d'insertion propre dans l'analyseur.
const RESTREINTS = new Set(["select", "table", "thead", "tbody", "tfoot", "tr", "ul", "ol", "dl", "optgroup"]);
const AUTOFERMANTS = new Set(["br", "hr", "img", "input", "meta", "link", "source", "track",
  "area", "base", "col", "embed", "param", "wbr"]);

// ————— LES COMMENTAIRES NE SONT PAS DU BALISAGE —————
//
// L'analyseur de ce test empile les balises au fil du texte. Il lisait donc aussi celles
// des COMMENTAIRES — et le commentaire qui explique pourquoi le menu de comptes n'est
// plus un `<select>` en contient un, cité en exemple. Ce faux `<select>` restait empilé
// et tout ce qui suivait dans le fichier passait pour être dedans.
//
// Ça ne s'était jamais vu parce qu'une `</sc-if>` proche le dépilait par ricochet : le
// dépilement remonte jusqu'à la balise de même nom et jette tout ce qui traîne au-dessus.
// En retirant cette condition, devenue toujours vraie, le compte a sauté de 25 à 27 sans
// qu'une seule balise ait bougé. Les commentaires sont donc effacés d'abord, en gardant
// les sauts de ligne pour que les numéros de ligne rapportés restent justes.
const NU = SOURCE.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));

/** Toute balise de gabarit dont le PARENT DIRECT restreint son contenu. */
function occurrences() {
  const pile = [];
  const out = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(NU))) {
    const [, fermant, nom, , auto] = m;
    const t = nom.toLowerCase();
    if (fermant) {
      for (let i = pile.length - 1; i >= 0; i--) if (pile[i] === t) { pile.length = i; break; }
      continue;
    }
    if ((t === "sc-for" || t === "sc-if") && RESTREINTS.has(pile[pile.length - 1])) {
      out.push({ quoi: t, parent: pile[pile.length - 1],
        ligne: NU.slice(0, m.index).split("\n").length });
    }
    if (!auto && !AUTOFERMANTS.has(t)) pile.push(t);
  }
  return out;
}

// L'état connu au moment où le cliquet est posé. Ces nombres ne doivent que DESCENDRE.
const CONNUS = { select: 25, tbody: 17 };

test("aucune boucle de gabarit dans un conteneur à contenu restreint NON connu", () => {
  const par = {};
  for (const o of occurrences()) par[o.parent] = (par[o.parent] || 0) + 1;
  const inconnus = Object.keys(par).filter((p) => !(p in CONNUS));
  assert.deepEqual(inconnus, [],
    `nouveau conteneur touché : ${inconnus.join(", ")} — une sc-for ou une sc-if y dépend `
    + "du moteur d’analyse, elle peut être ignorée ou déplacée sans que rien ne le signale");
});

test("le cliquet ne remonte pas : aucun ajout dans les conteneurs déjà touchés", () => {
  const par = {};
  for (const o of occurrences()) par[o.parent] = (par[o.parent] || 0) + 1;
  for (const [parent, connu] of Object.entries(CONNUS)) {
    const vu = par[parent] || 0;
    assert.ok(vu <= connu,
      `<${parent}> : ${vu} boucles de gabarit, contre ${connu} connues. Un ajout, pas une `
      + "correction — construisez la liste dans la logique et posez-la en une valeur, ou "
      + "remplacez le conteneur par un menu en <div>, comme l’en-tête.");
  }
});

test("l’en-tête n’a plus de <select> : son menu de comptes est en <div>", () => {
  // le seul défaut confirmé : le sélecteur de comptes n'affichait qu'une option vide
  // La borne haute était `{{ aBoutonDemo }}`, la condition qui gardait ce menu hors de
  // la page de présentation. Cette page a disparu, la condition avec elle, et la
  // délimitation rendait alors une chaîne VIDE — un test qui passe sur rien du tout.
  // Elle s'accroche donc au bouton lui-même, qui est ce qu'on mesure.
  const entete = SOURCE.slice(SOURCE.indexOf("{{ basculerMenuComptes }}") - 400,
    SOURCE.indexOf("<sc-if value=\"{{ aBoutonTiroir }}\""));
  assert.ok(entete.length > 400, "l’en-tête ne se délimite plus");
  // sans les commentaires HTML : celui qui explique le défaut a le droit de nommer la
  // balise qu’on bannit, le balisage non
  const sansNotes = entete.replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/<select/.test(sansNotes), "le sélecteur natif est revenu dans l’en-tête");
  assert.match(sansNotes, /\{\{ basculerMenuComptes \}\}/);
  assert.match(sansNotes, /\{\{ compteTeteTxt \}\}/);
  // et chaque entrée porte son propre geste : plus de valeur à retrouver dans une liste
  assert.match(sansNotes, /\{\{ ct\.choisir \}\}/);
});

test("le libellé du bouton ne peut pas annoncer un compte que le menu n’offre pas", () => {
  const i = SOURCE.indexOf("compteTeteTxt: (() => {");
  assert.ok(i > 0, "le libellé du bouton a disparu");
  const corps = SOURCE.slice(i, SOURCE.indexOf("chevronComptes:", i));
  // il se lit dans la MÊME liste que le menu, pas dans compteActif directement
  assert.match(corps, /liste\.find\(\(\[c\]\) => c === this\.compteActif\)/);
  assert.match(corps, /liste\[0\]/, "sans repli, un compte actif hors liste laisserait le bouton vide");
});
