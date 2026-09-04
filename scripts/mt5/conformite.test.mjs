/**
 * Le format du journal de conformité est un contrat entre le robot MQL5 et ce harnais.
 * Les champs sont positionnels : en déplacer un casse la comparaison SANS erreur — le
 * lecteur rendrait des nombres plausibles mais faux. Ces tests figent l'ordre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { lireConformite } from "./conformite.mjs";
import { genererMQ5 } from "../../robot-mt5.js";
import { REFERENCES } from "./references.mjs";
import { etatDepuisReference } from "./etat-depuis-reference.mjs";
import { contexteRapport, lireRapportMt5 } from "./parse-mt5.mjs";
import { readFileSync } from "node:fs";
import { chargerMoteur } from "./charger-moteur.mjs";
import { construireConfig } from "./config.mjs";

const M = await chargerMoteur();

const JOURNAL = [
  "bruit du testeur avant",
  "XX 0 12:00:00 Core 1 CONF|D|2020.05.19 00:00|1|0.90914|0.90447|0.90779|0.90748|0.91077|0.90427|",
  "XX 0 12:00:00 Core 1 CONF|D|2020.05.20 00:00|0|0.90800|0.90914|0.90790|0.90779|0.91000|0.90700|pas de croisement",
  "XX 0 12:00:00 Core 1 CONF|T|2020.05.19 00:00|0.051697|0.034204|0|premiere|spread",
  "XX 0 12:00:00 Core 1 CONF|T|2020.05.19 01:00|0.034122|0.034204|1|reprise|",
  "XX 0 12:00:00 Core 1 CONF|E|2020.05.19 01:00|2020.05.19 01:00|0.90961|0.90506|0.91871|0.66",
  "XX 0 12:00:00 Core 1 CONF|P|2020.05.19 03:00|52.10|0.90506|0.90961|0.91200",
].join("\n");

test("le journal se lit malgré le bruit du testeur autour", () => {
  const c = lireConformite(JOURNAL);
  assert.equal(c.D.size, 2);
  assert.equal(c.E.size, 1);
  assert.equal(c.P.length, 1);
});

test("les champs de la ligne D gardent leur ordre", () => {
  const j = Math.floor(Date.UTC(2020, 4, 19) / 86400000);
  const d = lireConformite(JOURNAL).D.get(j);
  assert.equal(d.signal, true);
  assert.equal(d.c1, 0.90914);   // c1 avant c2 : les inverser retournerait le croisement
  assert.equal(d.c2, 0.90447);
  assert.equal(d.l1, 0.90779);
  assert.equal(d.l2, 0.90748);
  assert.equal(d.haut1, 0.91077);
  assert.equal(d.bas1, 0.90427);
  const refus = lireConformite(JOURNAL).D.get(j + 1);
  assert.equal(refus.signal, false);
  assert.equal(refus.raison, "pas de croisement");
});

test("les tentatives sont groupées par jour, dans l'ordre, avec leur verdict", () => {
  const j = Math.floor(Date.UTC(2020, 4, 19) / 86400000);
  const t = lireConformite(JOURNAL).T.get(j);
  assert.equal(t.length, 2);
  assert.equal(t[0].accepte, false);
  assert.equal(t[0].raison, "spread");
  assert.equal(t[0].sp, 0.051697);
  assert.equal(t[0].plafond, 0.034204);
  assert.equal(t[1].accepte, true);
  assert.equal(t[1].quand, "reprise");
  assert.ok(t[1].t > t[0].t, "les tentatives ne sont pas dans l'ordre chronologique");
});

test("l'entrée distingue la bougie visée de l'instant réel du fill", () => {
  // Sur HongKong50 la séance ouvre à 03:31 : le robot entre à 03:31 sur la bougie de
  // 03:00. Confondre les deux ferait conclure à un écart d'entrée inexistant.
  const c = lireConformite(
    "CONF|E|2020.01.03 03:00|2020.01.03 03:31|25123.50|24922.50|25425.75|0.87",
  );
  const e = [...c.E.values()][0];
  assert.equal(new Date(e.t).getUTCHours(), 3);
  assert.equal(new Date(e.t).getUTCMinutes(), 0);
  assert.equal(new Date(e.reel).getUTCMinutes(), 31);
});

test("le palier porte le parcours atteint et les deux stops", () => {
  const p = lireConformite(JOURNAL).P[0];
  assert.equal(p.parcours, 52.10);
  assert.equal(p.avant, 0.90506);
  assert.equal(p.apres, 0.90961);
  assert.ok(p.apres > p.avant, "un palier ne peut que resserrer le stop");
});

test("le robot généré émet les quatre types de ligne", () => {
  const ref = REFERENCES.find((r) => r.sym === "AUDCAD");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260101_0000", magic: 1, paliers: [[25, 0]],
      spreadFacteur: 1.5 },
  );
  assert.match(src, /input bool {3}InpConformite/);
  for (const type of ["D", "T", "E", "P"]) {
    assert.ok(src.includes(`Conf(StringFormat("${type}|`),
      `le robot n'émet aucune ligne de type ${type}`);
  }
  // le journal ne doit rien coûter quand il est éteint
  assert.match(src, /void Conf\(string ligne\)\s*\{\s*if\(!InpConformite\) return;/);
});

test("un rapport joué sur le mauvais symbole est signalé, pas exploité", () => {
  // MT5 exécute l'expert sur le symbole DU GRAPHIQUE. Un robot HongKong50 déposé sur un
  // graphique Germany40 rend un rapport d'apparence normale : 94 trades au lieu de 67,
  // dix journées communes sur 94, et la conclusion — à tort — qu'une correction récente
  // avait tout cassé. Une heure perdue, et une accusation portée contre du code sain.
  const faux = contexteRapport(
    "Expert: Sivula_HongKong50_Achat_mediane_6_SL0p8_RR1p5_260904_0930\nSymbole: #Germany40\n",
  );
  assert.equal(faux.attendu, "HongKong50");
  assert.equal(faux.symbole, "#Germany40");
  assert.equal(faux.concorde, false);

  // le « # » du courtier et la casse ne doivent pas déclencher de faux positif
  const bon = contexteRapport(
    "Expert: Sivula_Japan225_Achat_mediane_10_SL2_RR1p5_260904_0930\nSymbole: #Japan225\n",
  );
  assert.equal(bon.concorde, true);
});

test("l'avertissement remonte au lecteur de rapport", () => {
  const r = lireRapportMt5(
    "Expert: Sivula_HongKong50_Achat_mediane_6_SL0p8_RR1p5_260904_0930\nSymbole: #Germany40\n",
  );
  assert.ok(r.avertissements.some((a) => /symbole DU GRAPHIQUE/.test(a)),
    "aucun avertissement sur le symbole");
  assert.equal(r.contexte.concorde, false);
});

test("le journal de conformité part dans son propre fichier, pas dans celui du testeur", () => {
  // Passé par Print(), il se noyait dans le journal général : 473 Mo pour une journée de
  // tests, toutes exécutions mélangées, et le fichier récupéré s'est révélé être celui
  // d'une exécution ANTÉRIEURE — sans que rien ne le signale. Un fichier par symbole et
  // par build, dans le dossier commun du terminal, supprime la question.
  const ref = REFERENCES.find((r) => r.sym === "HongKong50");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260904_TEST", magic: 1, paliers: [], spreadFacteur: 1.5 },
  );
  assert.match(src, /_conformite_260904_TEST\.csv/);
  assert.match(src, /FILE_COMMON/, "le fichier n'irait pas dans le dossier commun : "
    + "chaque agent de test a son propre bac à sable, introuvable");
  assert.match(src, /StringReplace\(nom, "#", ""\)/, "le # de #HongKong50 n'est pas retiré du nom");
  assert.match(src, /int OnInit\(\)\s*\{\s*ConfOuvrir\(\);/);
  assert.match(src, /OnDeinit\(const int reason\) \{ ConfFermer\(\);/);
  // les fins de ligne doivent rester des ÉCHAPPEMENTS dans le MQL5, pas de vrais sauts
  assert.ok(src.includes('"CONF|" + ligne + "\\r\\n"'),
    "les \\r\\n ont été interprétés à la génération : le fichier sortirait sur une seule ligne");
  // et il ne coûte rien quand il est éteint
  assert.match(src, /void Conf\(string ligne\)\s*\{\s*if\(!InpConformite\) return;/);
});

test("un spread nul est refusé par le robot comme par le moteur", () => {
  // Un spread à zéro n'est pas un spread bon marché : c'est l'absence de cotation.
  // `acceptable()` du moteur exige sp > 0 ; le robot l'acceptait et dépensait sa
  // tentative de l'heure sur une bougie où l'ordre ne pouvait pas passer. Vu sur
  // HongKong50 le 4 novembre 2020 : tentative à 00:00 avec un spread de 0.000000,
  // « acceptée », ordre refusé, et la journée décalée de deux heures.
  const ref = REFERENCES.find((r) => r.sym === "HongKong50");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260904_TEST", magic: 1, paliers: [], spreadFacteur: 1.5 },
  );
  assert.match(src, /if\(barre <= 0\.0\) \{ g_confRefus = "pas de cotation sur la bougie"; return false; \}/);

  // et côté moteur : une bougie sans spread ne peut pas être choisie
  const n = 24 * 400;
  const t = [], c = [], sp = [];
  for (let i = 0; i < n; i++) {
    const ms = Date.UTC(2021, 0, 1) + i * 3600000;
    t.push(ms); c.push(100);
    sp.push(new Date(ms).getUTCHours() === 0 ? 0 : 10);   // 00:00 non coté
  }
  const df = { n, t, o: c.slice(), h: c.slice(), l: c.slice(), c, sp, grain: { decimales: 2 } };
  const seuil = M.seuilSpread(df, 1.5), pct = M.spreadEnPct(df);
  const minuit = n - new Date(df.t[n - 1]).getUTCHours() - 1;
  assert.equal(pct[minuit], 0);
  assert.ok(!(pct[minuit] > 0 && pct[minuit] <= seuil[minuit]),
    "le moteur accepterait une bougie non cotée");
});

test("la ligne T porte le sort de l'ORDRE, pas seulement celui du garde-fou", () => {
  // Écrite avant l'appel à Entrer(), elle montrait « accepté » sur trois tentatives
  // d'affilée qui n'avaient rien exécuté — et le journal ne disait pas pourquoi.
  const ref = REFERENCES.find((r) => r.sym === "HongKong50");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260904_TEST", magic: 1, paliers: [], spreadFacteur: 1.5 },
  );
  for (const bloc of ["entre1 = ok1 && Entrer()", "entre = ok && Entrer()"]) {
    assert.ok(src.includes(bloc), `le sort de l'ordre n'est pas capturé : ${bloc}`);
  }
  // le verdict journalisé doit être celui de l'entrée
  assert.ok(src.includes("entre1 ? 1 : 0") && src.includes("entre ? 1 : 0"),
    "la ligne T journalise encore le verdict du garde-fou au lieu de celui de l'ordre");
});

test("la colonne « session » interdit d'entrer sur une bougie non traitable", () => {
  // Une bougie peut être COTÉE sans être TRAITABLE. Sur #HongKong50 les bougies de 03:00
  // et 04:00 portent un spread normal — 0,080 % et 0,019 %, sous le plafond — et l'ordre
  // y est refusé : la séance de négociation ouvre après la séance de cotation. Le moteur
  // y inscrivait un prix que personne ne pouvait traiter, deux heures avant l'entrée
  // réelle du robot.
  const enTete = "date,open,high,low,close,volume,spread,session";
  const lignes = [enTete];
  for (let i = 0; i < 24 * 60; i++) {
    const d = new Date(Date.UTC(2021, 0, 1) + i * 3600000);
    const h = d.getUTCHours();
    const px = (100 + i * 0.01).toFixed(2);
    lignes.push([
      d.toISOString().slice(0, 16).replace("T", " ").replace(/-/g, "."),
      px, px, px, px, 100, 10, h >= 5 ? 1 : 0,   // traitable seulement à partir de 05:00
    ].join(","));
  }
  const df = M.nettoyer(M.texteVersDf(lignes.join("\n")));
  assert.equal(df.sessRenseigne, true, "la colonne n'a pas été lue");
  for (let i = 0; i < df.n; i++) {
    const h = new Date(df.t[i]).getUTCHours();
    assert.equal(df.sess[i], h >= 5 ? 1 : 0, `bougie ${h}h mal étiquetée`);
  }
});

test("sans colonne « session », rien ne change pour les séries déjà exportées", () => {
  const sans = "date,open,high,low,close,volume,spread\n2021.01.04 03:00,100,101,99,100,10,12";
  const df = M.nettoyer(M.texteVersDf(sans));
  assert.equal(df.sessRenseigne, false);
  assert.equal(df.sess[0], 1, "une série sans la colonne doit rester entièrement traitable");
});

test("le moteur n'entre jamais hors séance", () => {
  const n = 24 * 500;
  const t = [], o = [], h = [], l = [], c = [], sp = [], sess = [];
  let px = 100, a = 13579;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    const ms = Date.UTC(2021, 0, 1) + i * 3600000;
    const ouv = px; px *= 1 + (rnd() - 0.5) * 0.004;
    t.push(ms); o.push(ouv); c.push(px);
    h.push(Math.max(ouv, px) * 1.001); l.push(Math.min(ouv, px) * 0.999);
    sp.push(10);
    sess.push(new Date(ms).getUTCHours() >= 5 ? 1 : 0);
  }
  const df = { n, t, o, h, l, c, sp, sess, grain: { decimales: 2 } };
  const cfg = construireConfig({ entree: "croisement_prix", ligne: "ma", periode: 5,
    sl: 0.5, rr: 2, paliers: [] });
  const sans = M.backtesterSuivi(df, { ...cfg, sess: undefined }, "D1");
  const avec = M.backtesterSuivi(df, cfg, "D1");
  assert.ok(avec.length > 10, "gabarit sans trades : test sans portée");
  for (const tr of avec) {
    assert.ok(new Date(tr.entree_t).getUTCHours() >= 5,
      `entrée à ${new Date(tr.entree_t).getUTCHours()}h, hors séance`);
  }
  assert.ok(sans.length >= avec.length);
});

test("tout refus d'entrée porte un motif", () => {
  // Sur BITCOIN, 1097 tentatives sur 2866 étaient journalisées SANS motif : les chemins
  // « volume nul » et « stop sous le minimum courtier » de Entrer() ne renseignaient pas
  // g_confRefus. Le journal disait qu'il n'y avait pas eu d'entrée sans dire pourquoi,
  // sur plus d'un tiers des cas — donc sans permettre de conclure.
  const ref = REFERENCES.find((r) => r.sym === "BITCOIN");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260904_TEST", magic: 1, paliers: [], spreadFacteur: 1.5 },
  );
  const entrer = src.slice(src.indexOf("bool Entrer()"), src.indexOf("void OnTick()"));
  // chaque « return false » de Entrer() doit être précédé d'une affectation du motif
  const retours = entrer.split("return false;");
  assert.ok(retours.length > 3, "moins de trois chemins d'échec : le test ne couvre rien");
  for (let i = 0; i < retours.length - 1; i++) {
    assert.match(retours[i], /g_confRefus = /,
      `un chemin d'échec de Entrer() ne renseigne pas le motif (bloc ${i + 1})`);
  }
  // et le refus du courtier doit porter les prix, pas seulement le libellé
  assert.match(entrer, /trade\.ResultRetcode\(\)/, "le code de retour du courtier n'est pas journalisé");
  assert.match(entrer, /prix=%s stop=%s objectif=%s/,
    "les prix tentés ne sont pas journalisés : « invalid stops » resterait inexploitable");

  // Même exigence sur le garde-fou, et pour la même raison : sur GOLD, 2 947 refus sur
  // 3 243 sortaient sans motif parce que le plafond de spread et « position déjà
  // ouverte » étaient les deux seuls chemins muets. Les distinguer était impossible,
  // alors que ce sont deux causes opposées — l'une se corrige, l'autre s'explique.
  const garde = src.slice(src.indexOf("bool ExecutionAutorisee()"), src.indexOf("double Volume("));
  const g = garde.split("return false;");
  assert.ok(g.length > 4, "moins de quatre chemins d'échec : le test ne couvre rien");
  for (let i = 0; i < g.length - 1; i++) {
    assert.match(g[i], /g_confRefus = /,
      `un chemin d'échec d'ExecutionAutorisee() ne renseigne pas le motif (bloc ${i + 1})`);
  }
});

test("la sortie est journalisée, avec ses frais séparés", () => {
  // La demande d'origine était de comparer entrées, sorties et frais SÉPARÉMENT. Le
  // journal ne portait que les entrées : une entrée juste avec une sortie fausse donnait
  // le même nombre de trades et un R différent, sans que rien ne le nomme.
  const ref = REFERENCES.find((r) => r.sym === "GOLD");
  const src = genererMQ5(
    { sym: ref.sym, sens: "achat", entree: ref.entree, ligne: ref.ligne,
      periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1" },
    { etat: etatDepuisReference(ref), stamp: "260904_TEST", magic: 1, paliers: [], spreadFacteur: 1.5 },
  );
  assert.match(src, /Conf\(StringFormat\("S\|/, "aucune ligne de sortie");
  assert.match(src, /DEAL_SWAP/, "le swap n'est pas journalisé");
  assert.match(src, /DEAL_COMMISSION/, "la commission n'est pas journalisée");
  // sur TOUTES les opérations de la position : la commission est facturée à l'entrée
  // comme à la sortie, et ne lire que la dernière montrait la moitié du coût réel
  assert.match(src, /swapTot \+= HistoryDealGetDouble\(dd, DEAL_SWAP\);/);
  assert.match(src, /commTot \+= HistoryDealGetDouble\(dd, DEAL_COMMISSION\);/);
  assert.match(src, /DoubleToString\(swapTot, 2\)/);
  assert.match(src, /DoubleToString\(commTot, 2\)/);
  assert.match(src, /DEAL_REASON/, "le motif de sortie n'est pas journalisé : stop et objectif se confondent");
  // le ticket doit être retenu à l'entrée, sinon la sortie n'est jamais rattachée
  assert.match(src, /g_posTicket = tk;/);
  assert.match(src, /SurveillerSortie\(\);/);

  // et le lecteur doit savoir les relire
  const { S } = lireConformite(
    "CONF|S|2021.03.11 05:00|2021.03.11 07:42|1761.44|312.50|-4.20|-1.10|DEAL_REASON_TP\n");
  assert.equal(S.size, 1);
  const s0 = [...S.values()][0];
  assert.equal(s0.prix, 1761.44);
  assert.equal(s0.resultat, 312.5);
  assert.equal(s0.swap, -4.2);
  assert.equal(s0.commission, -1.1);
  assert.equal(s0.motif, "DEAL_REASON_TP");
});

test("le spread écrit est celui de la PREMIÈRE M1 de l'heure, pas de l'heure pile", () => {
  // Exiger l'égalité d'horodatage ratait la bougie d'ouverture de la journée : la séance
  // de #Germany40 ouvre à 03:31, il n'existe donc aucune M1 à 03:00, et l'export
  // retombait sur l'agrégat H1 — la valeur basse et tardive — au lieu du spread
  // d'ouverture que le robot paie. Mesuré sur le journal du 6 septembre 2026 : 45
  // spreads sur 462 s'écartaient de ce que lit le robot, TOUS sur la bougie de 03:00,
  // jusqu'à 38 fois trop bas (0,00100 écrit contre 0,03793 payé). Sur GOLD, 16 sur
  // 2 933, tous à 00:00 ou 01:00.
  const src = readFileSync(new URL("../../Export_H1_Sivula.mq5", import.meta.url), "utf8");
  assert.match(src, /if\(iM1 < nM1 && m1\[iM1\]\.time < r\[i\]\.time \+ 3600\) sp = m1\[iM1\]\.spread;/,
    "le spread n'est pas repris sur la première M1 de l'heure");
  assert.doesNotMatch(src, /m1\[iM1\]\.time == r\[i\]\.time\) sp =/,
    "l'égalité stricte d'horodatage est revenue : la bougie d'ouverture retombera sur l'agrégat H1");
});

test("la séance se lit en chevauchement, et seulement dans l'état d'heure d'été de l'export", () => {
  // SymbolInfoSessionTrade ne rend que la table du JOUR de l'export, et les deux tables
  // du courtier ne se déduisent pas l'une de l'autre. Mesuré sur le journal
  // #HongKong50 du 6 septembre 2026, 67 trades sur six ans : d'avril à septembre le
  // testeur entre à 04:15, DANS la bougie de 04:00 ; d'octobre à mars il refuse 03:00 et
  // 04:00 (« market closed ») et entre à 05:00. Ne tester que la minute d'ouverture de
  // la bougie écartait 04:00 : 38 des 67 trades tombaient sur une bougie tenue pour
  // fermée, et le résultat changeait de signe — +6,63 R au testeur, -5,30 au moteur.
  const src = readFileSync(new URL("../../Export_H1_Sivula.mq5", import.meta.url), "utf8");
  const f = src.slice(src.indexOf("bool Traitable("), src.indexOf("bool Exporter("));
  assert.match(f, /int deb = d\.hour \* 60 \+ d\.min, fin = deb \+ 60;/,
    "la bougie n'est pas testée sur l'heure entière");
  assert.match(f, /bool memeSaison = \(HeureEte\(t\) == HeureEte\(TimeCurrent\(\)\)\);/,
    "la lecture permissive n'est pas restreinte à l'état d'heure d'été de l'export");
  assert.match(f, /memeSaison \? \(deb < m2 && fin > m1\) : \(deb >= m1 && deb < m2\)/,
    "le repli hors saison n'est pas la lecture stricte");
  // et le calcul de l'heure d'été suit bien la règle européenne
  assert.match(src, /if\(d\.mon < 3 \|\| d\.mon > 10\) return false;/);
  assert.match(src, /int DernierDimanche\(int annee, int mois\)/);
});

test("le relevé de symboles porte les colonnes que l'application cherche", () => {
  // Sivula bascule sur le format « export brut de terminal » quand l'en-tête contient
  // Symbol ET Point, et n'y trouve la contrainte que sous le nom StopsLevel. Renommer
  // une seule de ces colonnes fait relire le fichier comme un relevé retraité, sans
  // minimum de stop — et le contrôle de faisabilité redevient muet, en silence.
  const src = readFileSync(new URL("../../Export_Symboles_Sivula.mq5", import.meta.url), "utf8");
  const entete = src.match(/FileWriteString\(f, "([^"]+)"\s*\n?\s*"([^"]*)"/);
  assert.ok(entete, "en-tête introuvable dans le script");
  const cols = (entete[1] + entete[2]).replace(/\\r\\n/, "").split(";").map((x) => x.trim());
  for (const c of ["Symbol", "Point", "StopsLevel", "Bid", "Spread", "SwapMode",
    "SwapLong", "SwapShort", "ContractSize", "FreezeLevel"]) {
    assert.ok(cols.includes(c), `colonne « ${c} » absente de l'en-tête`);
  }
  assert.ok(!cols.includes("Symbole"),
    "« Symbole » ferait lire le fichier comme un relevé retraité, sans StopsLevel");
  // le séparateur doit être le point-virgule : l'analyseur ne lit que celui-là
  assert.ok(!/FileWriteString\(f, "[^"]*,[^"]*Point/.test(src),
    "l'en-tête semble séparé par des virgules");
});
