// ————— LE FILET : proposé au bon moment, et dit tant qu'il manque —————
//
// `choisirFichierAuto` est la meilleure protection de l'application — un vrai fichier
// sur le disque, réécrit chaque minute — et elle était rangée dans un tiroir. Personne
// ne la trouve avant d'avoir perdu quelque chose.
//
// Deux règles de moment, et elles sont symétriques. Ne rien demander au premier
// démarrage : l'utilisateur n'a rien à perdre, la demande est du bruit, et il apprend à
// la refuser. Ne pas insister ensuite : une proposition refusée ne revient pas, c'est
// l'état permanent qui prend le relais, et il ne bloque rien.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../../Vena.dc.html", import.meta.url), "utf8");
const bloc = (debut, fin) => {
  const i = SOURCE.indexOf(debut);
  assert.ok(i > 0, `introuvable : ${debut.slice(0, 40)}`);
  const j = SOURCE.indexOf(fin, i);
  assert.ok(j > i, `fin introuvable après : ${debut.slice(0, 40)}`);
  return SOURCE.slice(i, j);
};

test("la proposition ne part ni sur des démos, ni deux fois, ni par-dessus un filet", () => {
  const corps = bloc("async proposerFilet() {", "  async choisirFichierAuto() {");
  // les trois refus, dans cet ordre : rien à perdre, déjà couvert, déjà proposé
  assert.match(corps, /if \(!this\.aDonneesReelles\(\) \|\| this\.aFilet\(\)\) return;/);
  assert.match(corps, /if \(localStorage\.getItem\(this\.CLE_FILET\)\) return;/,
    "une proposition refusée doit ne jamais revenir");
  // la marque est posée AVANT la proposition : un rechargement pendant l'affichage ne
  // doit pas la reposer
  const iMarque = corps.indexOf("localStorage.setItem(this.CLE_FILET");
  const iAffiche = corps.indexOf("filetPropose: true");
  assert.ok(iMarque > 0 && iAffiche > iMarque, "la marque doit précéder l’affichage");
  // et la protection est demandée AU MÊME MOMENT
  assert.match(corps, /await this\.reclamerPersistance\(false\);/);
});

test("« des données réelles » exclut les démonstrations", () => {
  const corps = bloc("aDonneesReelles() {", "  // Un filet en place");
  assert.match(corps, /!this\.SYM_DEMO\.includes\(x\)/);
});

test("un seul des deux filets suffit — pas de rappel de zèle", () => {
  const corps = bloc("aFilet() {", "  async proposerFilet() {");
  assert.match(corps, /this\.state\.autoNom && !this\.state\.autoAttente/);
  assert.match(corps, /this\.state\.persistEtat === 'accordee'/);
  assert.match(corps, /\|\|/, "les deux conditions doivent être alternatives, pas cumulatives");
});

test("la protection n’est plus DEMANDÉE au chargement, seulement lue", () => {
  // le navigateur l'accorde d'après l'usage du site : la demander au premier chargement,
  // c'est la gâcher au moment où elle a le plus de chances d'être refusée
  const corps = bloc("async protegerStockage() {", "let scan = null;");
  assert.match(corps, /await navigator\.storage\.persisted\(\);/);
  assert.ok(!/navigator\.storage\.persist\(\)/.test(corps),
    "protegerStockage ne doit plus réclamer la protection au chargement");
});

test("le rang d’état ne se referme pas : c’est un état, pas une nouvelle", () => {
  // jusqu'au rang suivant : le rang porte des sc-if imbriqués, s'arrêter au premier
  // « </sc-if> » couperait au milieu
  const rang = bloc('<sc-if value="{{ aSansFilet }}"', '<sc-if value="{{ aManquePlace }}"');
  // aucun bouton de fermeture : s'il gêne, c'est qu'il faut agir, et agir le fait partir
  assert.ok(!/Fermer|fermerSansFilet|masquer/i.test(rang),
    "le rang d’état ne doit pas être refermable");
  // les deux gestes y sont, et l'état est dit en clair
  assert.match(rang, /choisirFilet/);
  assert.match(rang, /demanderFiletProtection/);
  assert.match(rang, /\{\{ sansFiletEtat \}\}/);
});

test("l’état de la protection se dit en français, y compris « pas encore demandée »", () => {
  const corps = bloc("sansFiletEtat: 'Protection du stockage : '", "};");
  for (const mot of ["accordée", "refusée par le navigateur", "inconnue de ce navigateur",
    "pas encore demandée"]) {
    assert.ok(corps.includes(mot), `état manquant : ${mot}`);
  }
});

test("là où le navigateur ne sait pas écrire un fichier, on dit ce qui marche", () => {
  const corps = bloc("filetProposeTxt:", "// L'ÉTAT, PAS UNE NOUVELLE");
  // les deux cas déjà détectés ailleurs : vue intégrée, et navigateur sans l'API
  assert.match(corps, /this\.dansIframe\(\)/);
  assert.ok(corps.includes("exportez après chaque séance"),
    "le repli doit nommer ce qui reste possible");
});

test("aucun geste du filet ne bloque le travail", () => {
  const corps = bloc("choisirFilet: () =>", "demanderFiletProtection:");
  // chacun referme la proposition et rend la main ; aucune attente, aucun verrou
  for (const geste of ["choisirFilet", "exporterDepuisFilet", "plusTardFilet"]) {
    assert.ok(corps.includes(geste) || SOURCE.includes(geste + ": () =>"), `geste absent : ${geste}`);
  }
  assert.ok(!/disabled|bloquer|verrou/i.test(corps));
});
