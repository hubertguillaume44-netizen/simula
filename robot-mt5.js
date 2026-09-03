// Générateur d'Expert Advisor MQL5 à partir d'une configuration validée dans Sivula.
//
// POURQUOI CE ROBOT AGRÈGE LUI-MÊME SES BOUGIES
// Le moteur ne lit que des H1 et reconstruit les unités supérieures avec ses propres
// règles : il prend l'horodatage du CSV tel quel (donc l'heure SERVEUR du courtier) et
// découpe les journées à minuit sur cette pendule, après avoir écarté les heures hors
// session et tronqué l'historique au premier mois réellement intraday. Les indicateurs
// natifs de MT5 liraient d'autres bougies. Le robot refait donc l'agrégation depuis les
// H1, sur l'horloge brute du serveur, pour la ligne de référence ET pour chaque filtre.
//
// Les cinq invariants du moteur sont codés en dur, pas paramétrables :
//   1. le signal est lu sur une bougie CLÔTURÉE ;
//   2. les unités supérieures ne fournissent que des bougies closes ;
//   3. l'entrée se fait à l'ouverture de la bougie H1 qui suit la clôture du signal ;
//   4. les conditions sont évaluées en booléen, dans l'ordre du moteur ;
//   5. sur bougie ambiguë, le stop est réputé touché d'abord (lecture basse).

const ENTREES = {
  croisement_prix: 'CROISEMENT',
  croisement_ou_rebond: 'CROISEMENT_OU_REBOND',
};
const LIGNES = { ema: 'EMA', ma: 'SMA', mediane: 'MEDIANE' };
// secondes par bougie agrégée, sur la même horloge que le moteur
const SECONDES = { H1: 3600, H4: 14400, D1: 86400, W1: 604800 };

const INCONNUS = {
  fNuage: 'Au-dessus du nuage', fPivot: 'Au-dessus du pivot',
  fResist: 'Sous résistance', fZone: 'Hors zone de résistance',
};
const REGLAGES_BLOQUANTS = { btDelai: 'Délai d\u2019entrée' };

function nb(v, def) { const x = Number(v); return Number.isFinite(x) ? x : def; }
function esc(s) { return String(s ?? '').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' '); }
function secs(u, def) { return SECONDES[String(u || '').toUpperCase()] || def; }

// UNE seule base de temps, en UTC, calculée une fois par export. Trois horodatages
// indépendants (dont deux dans des fuseaux différents) faisaient croire que le nom du
// fichier et l'empreinte du journal venaient de builds différents.
export function stampMaintenant() {
  const s = new Date().toISOString();          // 2026-09-01T15:08:…
  return s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10) + '_' + s.slice(11, 13) + s.slice(14, 16);
}
// Le nom porte cet horodatage : sans lui, chaque export dupliquait le même nom, Windows
// ajoutait « (1) », « (2) », et MT5 continuait de proposer les anciens .ex5.
export function nomRobot(cfg, stamp) {
  return ['Sivula', cfg.sym, cfg.sens === 'vente' ? 'Vente' : 'Achat', cfg.ligne || '',
    cfg.periode || '', 'SL' + String(cfg.sl).replace('.', 'p'),
    'RR' + String(cfg.rr).replace('.', 'p'), stamp || stampMaintenant()]
    .join('_').replace(/[^A-Za-z0-9_]/g, '_');
}

export function filtresBloquants(etat) {
  const l = Object.keys(INCONNUS).filter((k) => etat && etat[k]).map((k) => INCONNUS[k]);
  for (const k of Object.keys(REGLAGES_BLOQUANTS)) {
    if (etat && Number(etat[k]) > 0) l.push(REGLAGES_BLOQUANTS[k]);
  }
  return l;
}

// Appel d'une ligne de référence agrégée : LigneAgr(secondes, mode, période, shift)
function appelLigne(sec, mode, per, shift) {
  return `LigneAgr(${sec}, ${mode === 'MEDIANE' ? 'M_MEDIANE' : mode === 'SMA' ? 'M_SMA' : 'M_EMA'}, ${per}, ${shift})`;
}

export function genererMQ5(cfg, ctx = {}) {
  const etat = ctx.etat || {};
  const bloquants = filtresBloquants(etat);
  if (bloquants.length) {
    throw new Error('Réglage non transposable en MQL5 : ' + bloquants.join(', ')
      + '. Ce robot ne peut pas reproduire la mesure.');
  }

  const stamp = ctx.stamp || stampMaintenant();
  const nom = nomRobot(cfg, stamp);
  // Le commentaire d'ordre est tronqué à 31 caractères par MT5 : le nom complet y perdait
  // son horodatage. On y met une étiquette courte, l'horodatage en tête.
  const marque = 'SIV_' + stamp;
  const vente = cfg.sens === 'vente';
  const periode = nb(cfg.periode, 20);
  const sl = nb(cfg.sl, 1);
  const rr = nb(cfg.rr, 2);
  const mode = LIGNES[cfg.ligne] || 'EMA';
  const entree = ENTREES[cfg.entree] || 'CROISEMENT';
  const secSig = secs(ctx.ut || etat.ut, 86400);
  // Les heures de séance retenues par le nettoyage de la mesure : sans elles, le robot
  // agrège des bougies que le backtest avait écartées et ne voit pas les mêmes signaux.
  const hs = Array.isArray(ctx.heuresSession) ? ctx.heuresSession.map((x) => nb(x, -1)).filter((x) => x >= 0 && x <= 23) : [];
  const heuresSession = hs.length && hs.length < 24 ? hs.join(',') : '';
  const heuresN = heuresSession ? hs.length : 24;
  const paliers = (ctx.paliers && ctx.paliers.length ? ctx.paliers : []).slice(0, 3);
  const p = (i, j) => (paliers[i] ? nb(paliers[i][j], 0) : 0);
  const spreadMax = Math.max(0.01, nb(ctx.spreadMaxPct, 0.05));
  // La mesure inscrite dans l'en-tête et dans le tableau de bord vient de la ligne validée.
  // Si elle a été produite sous une règle de moteur antérieure, le robot ne doit pas la
  // présenter comme sa référence : c'est ce chiffre que l'utilisateur compare à son vécu.
  const mesureVieille = !!ctx.mesureVieille;

  // Creux de référence de CETTE configuration, pas celui du portefeuille : afficher
  // un chiffre emprunté à un autre calcul serait une affirmation sans support.
  const ddLigne = Number(cfg.dd);
  const refCreux = Number.isFinite(ddLigne) && ddLigne !== 0
    ? ' · mesure : ' + Math.round(Math.abs(ddLigne)) + ' pertes d\u2019affilée au pire'
    : '';
  const tests = [];
  const resume = [];

  if (etat.btMtf) {
    const m = LIGNES[etat.ligneMtf] || 'EMA';
    const per = nb(etat.periodeMtf, 9);
    const s = secs(etat.utMtf, 86400);
    tests.push(`   // tendance supérieure : clôture ${vente ? 'sous' : 'au-dessus de'} la ligne
   {
      double c = C_(${s}, 1), l = ${appelLigne(s, m, per, 1)};
      if(c <= 0.0 || l <= 0.0) return false;
      if(${vente ? 'c >= l' : 'c <= l'}) { g_raison = StringFormat("tendance supérieure : clôture %.2f vs ligne %.2f", c, l); return false; }
   }`);
    resume.push('tendance ' + (etat.utMtf || 'D1') + ' ' + (etat.ligneMtf || 'ema') + ' ' + per);
  }

  if (etat.fRsi) {
    const per = nb(etat.periodeRsi, 14);
    const s = secs(etat.utRsi, 3600);
    const seuil = vente ? 100 - nb(etat.fRsiSeuil, 50) : nb(etat.fRsiSeuil, 50);
    tests.push(`   // RSI ${vente ? 'sous' : 'au-dessus de'} ${seuil}, calculé sur les bougies agrégées
   {
      double v = RsiAgr(${s}, ${per}, 1);
      if(v < 0.0) return false;
      if(${vente ? 'v >= ' + seuil : 'v <= ' + seuil}) { g_raison = StringFormat("RSI %.1f", v); return false; }
   }`);
    resume.push('RSI ' + (etat.utRsi || 'H1') + ' ' + per + (vente ? ' < ' : ' > ') + seuil);
  }

  if (etat.fAdx) {
    const per = nb(etat.periodeAdx, 14);
    const s = secs(etat.utAdx, 3600);
    const seuil = nb(etat.fAdxSeuil, 20);
    tests.push(`   // ADX au-dessus de ${seuil} : il faut une tendance, quel que soit le sens
   {
      double v = AdxAgr(${s}, ${per}, 1);
      if(v < 0.0) return false;
      if(v <= ${seuil}) { g_raison = StringFormat("ADX %.2f <= ${seuil}", v); return false; }
   }`);
    resume.push('ADX ' + (etat.utAdx || 'H1') + '(' + per + ') > ' + seuil);
  }

  if (etat.fMa) {
    const per = nb(etat.periodeMa, 200);
    const s = secs(etat.utMa, 86400);
    tests.push(`   // ${vente ? 'sous' : 'au-dessus de'} la moyenne mobile ${per}
   {
      double c = C_(${s}, 1), m = ${appelLigne(s, 'SMA', per, 1)};
      if(c <= 0.0 || m <= 0.0) return false;
      if(${vente ? 'c >= m' : 'c <= m'}) { g_raison = StringFormat("MM : clôture %.2f vs MM %.2f", c, m); return false; }
   }`);
    resume.push((vente ? 'sous' : 'au-dessus') + ' MM ' + (etat.utMa || 'D1') + ' ' + per);
  }

  if (etat.fPente) {
    const m = LIGNES[etat.lignePente] || 'EMA';
    const per = nb(etat.periodeMtf, 9);
    const s = secs(etat.utPente, 14400);
    const recul = nb(etat.fPenteRecul, 3);
    tests.push(`   // pente ${vente ? 'baissière' : 'haussière'} sur ${recul} bougies
   {
      double a = ${appelLigne(s, m, per, 1)}, b = ${appelLigne(s, m, per, 1 + recul)};
      if(a <= 0.0 || b <= 0.0) return false;
      if(${vente ? 'a >= b' : 'a <= b'}) { g_raison = StringFormat("pente : %.2f vs %.2f", a, b); return false; }
   }`);
    resume.push('pente ' + (etat.utPente || 'H4') + ' recul ' + recul);
  }

  const signal = entree === 'CROISEMENT_OU_REBOND'
    ? (vente
      ? `   // croisement : la clôture passe SOUS la ligne (elle était au-dessus avant)
   bool croisement = (c2 >= l2 && c1 < l1);
   // rebond, port exact de rebond() : le HAUT touche la ligne et la clôture reste
   // dessous. Aucune condition sur la bougie précédente — en exiger une (c2 < l2)
   // retirait des trades que la mesure prend.
   double haut1 = H_(SEC_SIGNAL, 1);
   bool rebond = (haut1 >= l1 && c1 < l1);
   if(!(croisement || rebond)) { g_raison = StringFormat("ni croisement ni rebond : c2=%s l2=%s c1=%s l1=%s haut1=%s", DoubleToString(c2, _Digits), DoubleToString(l2, _Digits), DoubleToString(c1, _Digits), DoubleToString(l1, _Digits), DoubleToString(haut1, _Digits)); return false; }`
      : `   // croisement : la clôture passe AU-DESSUS de la ligne (elle était dessous avant)
   bool croisement = (c2 <= l2 && c1 > l1);
   // rebond, port exact de rebond() : le BAS touche la ligne et la clôture reste
   // au-dessus. Aucune condition sur la bougie précédente — en exiger une (c2 > l2)
   // retirait des trades que la mesure prend.
   double bas1 = L_(SEC_SIGNAL, 1);
   bool rebond = (bas1 <= l1 && c1 > l1);
   if(!(croisement || rebond)) { g_raison = StringFormat("ni croisement ni rebond : c2=%s l2=%s c1=%s l1=%s bas1=%s", DoubleToString(c2, _Digits), DoubleToString(l2, _Digits), DoubleToString(c1, _Digits), DoubleToString(l1, _Digits), DoubleToString(bas1, _Digits)); return false; }`)
    : (vente
      ? `   if(!(c2 >= l2 && c1 < l1)) { g_raison = StringFormat("pas de croisement : c2=%s l2=%s c1=%s l1=%s", DoubleToString(c2, _Digits), DoubleToString(l2, _Digits), DoubleToString(c1, _Digits), DoubleToString(l1, _Digits)); return false; }`
      : `   if(!(c2 <= l2 && c1 > l1)) { g_raison = StringFormat("pas de croisement : c2=%s l2=%s c1=%s l1=%s", DoubleToString(c2, _Digits), DoubleToString(l2, _Digits), DoubleToString(c1, _Digits), DoubleToString(l1, _Digits)); return false; }`);

  return `//+------------------------------------------------------------------+
//|  ${nom}
//|  Généré par Sivula · build ${stamp} (UTC) · marque des ordres : SIV_${stamp}
//|
//|  Instrument      : ${esc(cfg.sym)}
//|  Sens            : ${vente ? 'VENTE à découvert' : 'ACHAT'}
//|  Configuration   : ${esc(cfg.entree)} · ${esc(cfg.ligne)} ${periode} · stop ${sl} % · objectif ${rr} R
//|  Filtres générés : ${resume.length ? esc(resume.join(' · ')) : 'aucun'}
//|  Paliers         : ${paliers.length ? paliers.map((x) => x[0] + '→' + x[1]).join(' / ') : 'aucun'}
//|  Durée maximale  : ${nb(etat.btDureeMax, 0) > 0 ? nb(etat.btDureeMax, 0) + ' bougies H1' : 'aucune'}
//|  Mesuré          : ${nb(cfg.n, 0)} trades · ${nb(cfg.total, 0)} R cumulés · ${nb(cfg.rAn, 0).toFixed(1)} R/an${mesureVieille ? ' — MESURE ANTÉRIEURE À LA RÈGLE ACTUELLE, à remesurer' : ''}
//|  Contrôle hasard : ${esc(ctx.hasard || 'non contrôlé')}
//|
//|  L'EMA, le RSI et l'ADX sont récursifs sur tout l'historique : leur valeur dépend de
//|  la longueur du tampon agrégé (InpBougiesAgr). Gardez la valeur par défaut pour rester
//|  comparable à la mesure.
//|
//|  À ATTACHER SUR UN GRAPHIQUE H1. Le robot reconstruit ses bougies supérieures depuis
//|  les H1, à minuit heure serveur, et recalcule tous ses indicateurs dessus.
//|
//|  AVERTISSEMENT — ces chiffres sont une mesure du passé sur une configuration choisie
//|  parmi des milliers. Ils ne prédisent rien. Faites tourner ce robot en démo assez
//|  longtemps pour constater vous-même l'écart avec le backtest avant d'engager du capital.
//|  Si le nombre de trades diverge, c'est un filtre mal transposé — pas du bruit.
//+------------------------------------------------------------------+
#property copyright "Sivula"
#property version   "2.00"
#property strict

#include <Trade\\Trade.mqh>

//--- Risque et exécution
input double InpRisquePct       = 1.00;   // Risque par trade, en % du capital
input int    InpTaillePolice    = 9;      // Taille du texte du tableau de bord
// 0 = aucune limite. Le backtest compte déjà les frais relevés ; un plafond serré
// rejetait les entrées justement quand le spread s'élargit à l'ouverture — 30 trades
// perdus sur Spain35, tous des signaux valides.
input double InpSpreadMaxPct    = 0;  // Spread maximum à l'entrée, % du prix (0 = pas de limite ; relevé : ${spreadMax.toFixed(4)})
input int    InpMaxPositions    = 1;     // Positions simultanées sur cet instrument
input bool   InpPasDebutSemaine = true;  // Interdire dimanche et les premières heures du lundi
input int    InpSlippagePoints  = 20;    // Déviation maximale acceptée
input int    InpBougiesAgr      = 400;   // Bougies agrégées conservées (≥ période la plus longue + marge)
input bool   InpDiagnostic      = false; // Journal détaillé : pourquoi chaque journée n'a pas déclenché
input string InpDiagDu          = "2020.01.01"; // Diagnostic à partir de cette date
input string InpDiagAu          = "2020.12.31"; // Diagnostic jusqu'à cette date
input ulong  InpMagic           = ${nb(ctx.magic, 20260901)};

//--- Configuration mesurée (ne pas modifier : le backtest ne serait plus valable)
#define STOP_PCT        ${sl}
#define OBJECTIF_R      ${rr}
#define SEC_SIGNAL      ${secSig}
#define PER_SIGNAL      ${periode}
#define M_SIGNAL        ${mode === 'MEDIANE' ? 'M_MEDIANE' : mode === 'SMA' ? 'M_SMA' : 'M_EMA'}
#define DUREE_MAX       ${nb(etat.btDureeMax, 0)}   // en bougies H1, comme le moteur
// Paliers de sécurisation : en PARAMÈTRES et non en constantes, pour pouvoir les mettre
// à zéro dans le testeur et voir ce que la sécurisation coûte ou rapporte, sans
// recompiler. Les valeurs par défaut sont celles de la mesure : les changer rend le
// backtest de Sivula non comparable.
input int InpPalier1Seuil  = ${p(0, 0)};  // Palier 1 — chemin parcouru (%) ; 0 = palier désactivé
input int InpPalier1Niveau = ${p(0, 1)};  // Palier 1 — stop porté à (%)
input int InpPalier2Seuil  = ${p(1, 0)};  // Palier 2 — chemin parcouru (%) ; 0 = palier désactivé
input int InpPalier2Niveau = ${p(1, 1)};  // Palier 2 — stop porté à (%)
input int InpPalier3Seuil  = ${p(2, 0)};  // Palier 3 — chemin parcouru (%) ; 0 = palier désactivé
input int InpPalier3Niveau = ${p(2, 1)};  // Palier 3 — stop porté à (%)
${vente ? '#define SENS_VENTE' : '#define SENS_ACHAT'}

// Heures de séance conservées par la MESURE. Sivula écarte les heures qui ne sont pas
// présentes toutes les années (nettoyage : fenêtre horaire homogène) avant d'agréger les
// bougies H1. Agréger ici TOUTES les bougies donnerait des bougies D1 différentes — donc
// d'autres moyennes, d'autres pentes et d'autres signaux. Vide = aucune heure écartée.
const string HEURES_SESSION = "${heuresSession}";
#define HEURES_N ${heuresN}

#define M_SMA      0
#define M_EMA      1
#define M_MEDIANE  2

CTrade   trade;
long     dernierSeau = -1;      // seau du dernier signal évalué
// Un signal dont l'ordre est refusé (marché fermé à 00:00, spread, position ouverte)
// était perdu : le seau était consommé et jamais réévalué. On le garde en attente et on
// réessaie aux ticks suivants du MÊME seau — c'est l'entrée « à l'ouverture suivante ».
long     seauEnAttente = -1;
// pic d'équité depuis le lancement : sert à afficher le creux réellement traversé,
// le seul chiffre comparable au « creux une fois sur vingt » de la mesure
double   g_pic = 0.0;
datetime g_lancement = 0;

//+------------------------------------------------------------------+
//| AGRÉGATION DES BOUGIES DEPUIS LES H1, SUR L'HORLOGE DU SERVEUR    |
//|                                                                   |
//| On lit les H1 avec CopyRates et on les regroupe par seau de N      |
//| secondes, comme resamplerBrut(). Seuls les seaux CLOS sont         |
//| conservés : l'indice 1 est le dernier seau fermé, l'indice 2 celui |
//| d'avant, comme le .shift(1) du moteur.                             |
//+------------------------------------------------------------------+
double g_o[], g_h[], g_l[], g_c[];
long   g_seau[];
int    g_n = 0;
// dernières valeurs d'agrégation, rapportées par le diagnostic : sans elles, un échec
// d'historique reste invérifiable
int    g_besoin = 0, g_dispo = 0, g_lus = 0;
datetime g_diagDerniere = 0;
long   g_secCache = -1;
datetime g_bougieCache = 0;

// Découpage sur l'horloge BRUTE du serveur, sans conversion.
// Le moteur lit les horodatages des CSV FxPro littéralement comme de l'UTC
// (moteur.js : Date.UTC(an, mois-1, jour, h, m)) alors qu'ils sont en heure serveur :
// sa « journée UTC » EST donc la journée du serveur. Soustraire un décalage ici
// désalignait ce qui l'était déjà — et un décalage figé au démarrage aurait en plus
// dérivé d'une heure au passage à l'heure d'été.
long SeauDe(datetime tServeur, long sec)
{
   long t = (long)tServeur;
   if(t < 0) t = 0;
   return t / sec;
}

// Construit la série agrégée pour « sec ». Renvoie false si l'historique manque.
bool Agreger(long sec)
{
   datetime derH1 = 0;
   {
      datetime tt[];
      if(CopyTime(_Symbol, PERIOD_H1, 0, 1, tt) < 1) return false;
      derH1 = tt[0];
   }
   if(g_secCache == sec && g_bougieCache == derH1 && g_n > 0) return true;

   // Demander un nombre FIXE de bougies fait échouer CopyRates tant que cet historique
   // n'existe pas : dans le testeur, le robot ne tradait rien pendant les trois premières
   // années (9 648 bougies H1 ≈ 760 séances). On plafonne donc la demande au disponible.
   // Le filtre horaire écarte une partie des bougies : il en faut d'autant plus pour
   // remplir le tampon agrégé attendu par les indicateurs.
   int besoin = (int)(InpBougiesAgr * (sec / 3600) * 24.0 / HEURES_N + 48);
   if(besoin < 100) besoin = 100;
   int dispo = Bars(_Symbol, PERIOD_H1);
   if(dispo > 0 && besoin > dispo) besoin = dispo;
   MqlRates r[];
   int lus = CopyRates(_Symbol, PERIOD_H1, 0, besoin, r);
   // repli : certaines implémentations rendent -1 sur une demande trop large
   if(lus < 2 && besoin > 200) lus = CopyRates(_Symbol, PERIOD_H1, 0, 200, r);
   g_besoin = besoin; g_dispo = dispo; g_lus = lus;
   if(lus < 2) return false;
   // CopyRates rend les bougies du plus ancien au plus récent

   ArrayResize(g_o, lus); ArrayResize(g_h, lus);
   ArrayResize(g_l, lus); ArrayResize(g_c, lus); ArrayResize(g_seau, lus);
   g_n = 0;
   long seauCourant = -1;
   for(int i = 0; i < lus; i++)
   {
      if(!HeureGardee(r[i].time)) continue;
      long s = SeauDe(r[i].time, sec);
      if(s != seauCourant)
      {
         seauCourant = s;
         g_seau[g_n] = s;
         g_o[g_n] = r[i].open;
         g_h[g_n] = r[i].high;
         g_l[g_n] = r[i].low;
         g_c[g_n] = r[i].close;
         g_n++;
      }
      else
      {
         int k = g_n - 1;
         if(r[i].high > g_h[k]) g_h[k] = r[i].high;
         if(r[i].low  < g_l[k]) g_l[k] = r[i].low;
         g_c[k] = r[i].close;
      }
   }
   // le dernier seau est en cours de formation : on ne le garde pas
   if(g_n > 0) g_n--;
   g_secCache = sec;
   g_bougieCache = derH1;
   return (g_n > 1);
}

bool HeureGardee(datetime t)
{
   if(StringLen(HEURES_SESSION) == 0) return true;
   MqlDateTime d; TimeToStruct(t, d);
   return StringFind("," + HEURES_SESSION + ",", "," + IntegerToString(d.hour) + ",") >= 0;
}

// shift 1 = dernier seau CLOS, 2 = celui d'avant…
int IdxDe(int shift) { return g_n - shift; }

double C_(long sec, int shift)
{
   if(!Agreger(sec)) return 0.0;
   int i = IdxDe(shift);
   if(i < 0 || i >= g_n) return 0.0;
   return g_c[i];
}
double H_(long sec, int shift)
{
   if(!Agreger(sec)) return 0.0;
   int i = IdxDe(shift);
   if(i < 0 || i >= g_n) return 0.0;
   return g_h[i];
}
double L_(long sec, int shift)
{
   if(!Agreger(sec)) return 0.0;
   int i = IdxDe(shift);
   if(i < 0 || i >= g_n) return 0.0;
   return g_l[i];
}
long SeauCourant(long sec)
{
   if(!Agreger(sec)) return -1;
   int i = IdxDe(1);
   if(i < 0 || i >= g_n) return -1;
   return g_seau[i];
}

//--- lignes calculées sur les bougies agrégées
double LigneAgr(long sec, int mode, int per, int shift)
{
   if(per < 1) return 0.0;
   if(!Agreger(sec)) return 0.0;
   int fin = IdxDe(shift);
   if(fin < 0 || fin >= g_n) return 0.0;
   if(fin - per + 1 < 0) return 0.0;

   if(mode == M_MEDIANE)
   {
      // médiane des clôtures, comme le moteur : tri, pas de moyenne
      double v[]; ArrayResize(v, per);
      for(int i = 0; i < per; i++) v[i] = g_c[fin - i];
      ArraySort(v);
      int m = per / 2;
      if(per % 2 == 1) return v[m];
      return (v[m - 1] + v[m]) / 2.0;
   }
   if(mode == M_SMA)
   {
      double s = 0.0;
      for(int i = 0; i < per; i++) s += g_c[fin - i];
      return s / per;
   }
   // EMA récursive, comme emaBrut() du moteur : amorce sur les p PREMIÈRES bougies du
   // tampon, puis lissage jusqu'à la bougie visée. Amorcer sur les p DERNIÈRES donnait une
   // moyenne — la boucle de lissage n'avait alors aucune itération à faire.
   if(g_n < per) return 0.0;
   double s2 = 0.0;
   for(int i = 0; i < per; i++) s2 += g_c[i];
   double ema = s2 / per;
   double k = 2.0 / (per + 1.0);
   for(int i = per; i <= fin; i++) ema = g_c[i] * k + ema * (1.0 - k);
   return ema;
}

//--- RSI de Wilder sur les bougies agrégées.
//    Port de rsiBrut() : amorce sur les p premiers écarts du tampon, PUIS récursion
//    jusqu'à la bougie visée. Une moyenne simple sur les p dernières bougies ne donne
//    que la valeur d'amorce — un RSI différent, donc un filtre différent.
double RsiAgr(long sec, int per, int shift)
{
   if(!Agreger(sec)) return -1.0;
   int fin = IdxDe(shift);
   if(fin < per + 1 || g_n < per + 2) return -1.0;
   double g = 0.0, pe = 0.0, val = -1.0;
   for(int i = 1; i <= fin; i++)
   {
      double d = g_c[i] - g_c[i - 1];
      double up = (d > 0.0) ? d : 0.0;
      double dn = (d < 0.0) ? -d : 0.0;
      if(i <= per)
      {
         g += up; pe += dn;
         if(i == per) { g /= per; pe /= per; val = 100.0 - 100.0 / (1.0 + g / ((pe > 0.0) ? pe : 1e-12)); }
         continue;
      }
      g  = (g  * (per - 1) + up) / per;
      pe = (pe * (per - 1) + dn) / per;
      val = 100.0 - 100.0 / (1.0 + g / ((pe > 0.0) ? pe : 1e-12));
   }
   return val;
}

//--- ADX de Wilder sur les bougies agrégées.
//    Port de adxBrut() + wilder() : alpha = 1/p amorcé à la PREMIÈRE bougie du tampon,
//    DX moyenné sur i = p..2p-1 puis récursé jusqu'au bout. Démarrer la récursion
//    quelques dizaines de bougies avant la fin laissait une influence d'amorce de
//    plusieurs pour cent — décisive pour un seuil posé à 20.
double AdxAgr(long sec, int per, int shift)
{
   if(!Agreger(sec)) return -1.0;
   int fin = IdxDe(shift);
   if(fin < 2 * per || g_n < 2 * per + 2) return -1.0;
   double a = 1.0 / per;
   double st = 0.0, sp = 0.0, sm = 0.0;      // lissages de TR, DM+ et DM−
   bool   amorce = false;
   double sommeDx = 0.0, adx = -1.0;
   int    nDx = 0;
   for(int i = 1; i <= fin; i++)
   {
      double up = g_h[i] - g_h[i - 1];
      double dn = g_l[i - 1] - g_l[i];
      double pP = (up > dn && up > 0.0) ? up : 0.0;
      double pM = (dn > up && dn > 0.0) ? dn : 0.0;
      double cPrec = g_c[i - 1];
      double tr = MathMax(g_h[i] - g_l[i], MathMax(MathAbs(g_h[i] - cPrec), MathAbs(g_l[i] - cPrec)));
      if(!amorce) { st = tr; sp = pP; sm = pM; amorce = true; }
      else
      {
         st += a * (tr - st);
         sp += a * (pP - sp);
         sm += a * (pM - sm);
      }
      double dx = 0.0;
      if(st > 0.0)
      {
         double diP = 100.0 * sp / st;
         double diM = 100.0 * sm / st;
         double somme = diP + diM;
         if(somme > 0.0) dx = 100.0 * MathAbs(diP - diM) / somme;
      }
      if(i < per) continue;
      nDx++;
      if(nDx <= per)
      {
         sommeDx += dx;
         if(nDx == per) adx = sommeDx / per;
         continue;
      }
      adx = (adx * (per - 1) + dx) / per;
   }
   return adx;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason) { PanneauNettoyer(); ChartRedraw(0); }

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFillingBySymbol(_Symbol);
   // Empreinte : sans elle, impossible de savoir quelle version a réellement tourné
   // quand un ancien .ex5 traîne dans MQL5\\Experts.
   // arguments séparés par des virgules : MQL5 n'accepte PAS la juxtaposition de
   // littéraux à la C, le fichier ne compilait pas
   Print("=== SIVULA ROBOT · build ${stamp} (UTC)",
         " · ${esc(cfg.sym)} ${vente ? 'VENTE' : 'ACHAT'} ${esc(cfg.ligne)} ${periode}",
         " · stop ${sl}% R/R ${rr} · attendu ${nb(cfg.n, 0)} trades ===");
   Print("Journées découpées à 00:00 heure serveur, comme les horodatages des CSV mesurés.");
   if(StringCompare(_Symbol, "${esc(cfg.sym)}", false) != 0)
      Print("ATTENTION : ce robot a été mesuré sur ${esc(cfg.sym)}, il tourne sur ", _Symbol);
   if(Period() != PERIOD_H1)
      Print("ATTENTION : attachez ce robot sur un graphique H1 — il agrège lui-même les unités supérieures.");
   // le dernier seau déjà clos ne doit pas être joué au démarrage : son ouverture est
   // passée, l'ordre partirait au prix courant des heures plus tard
   dernierSeau = SeauCourant(SEC_SIGNAL);
   g_lancement = TimeCurrent();
   g_pic = AccountInfoDouble(ACCOUNT_EQUITY);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
string g_raison = "";     // pourquoi la journée n'a pas déclenché
bool Signal()
{
   g_raison = "";
   double c1 = C_(SEC_SIGNAL, 1);
   double c2 = C_(SEC_SIGNAL, 2);
   double l1 = LigneAgr(SEC_SIGNAL, M_SIGNAL, PER_SIGNAL, 1);
   double l2 = LigneAgr(SEC_SIGNAL, M_SIGNAL, PER_SIGNAL, 2);
   if(c1 <= 0.0 || c2 <= 0.0 || l1 <= 0.0 || l2 <= 0.0)
   {
      g_raison = StringFormat("données incomplètes (c1=%s c2=%s l1=%s l2=%s, %d bougies agrégées)",
                              DoubleToString(c1, _Digits), DoubleToString(c2, _Digits),
                              DoubleToString(l1, _Digits), DoubleToString(l2, _Digits), g_n);
      return false;
   }

${signal}

${tests.join('\n\n')}

   return true;
}

//+------------------------------------------------------------------+
bool ExecutionAutorisee()
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask <= 0.0 || bid <= 0.0) return false;

   double spreadPct = (ask - bid) / ask * 100.0;
   if(InpSpreadMaxPct > 0.0 && spreadPct > InpSpreadMaxPct)
   {
      Print("Entrée refusée : spread ", DoubleToString(spreadPct, 4), " % > ",
            DoubleToString(InpSpreadMaxPct, 4), " %");
      return false;
   }

   if(InpPasDebutSemaine)
   {
      MqlDateTime t; TimeToStruct(TimeCurrent(), t);
      if(t.day_of_week == 0) return false;
      if(t.day_of_week == 1 && t.hour < 2) return false;
   }

   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol
         && PositionGetInteger(POSITION_MAGIC) == (long)InpMagic) n++;
   if(n >= InpMaxPositions) return false;

   return true;
}

//+------------------------------------------------------------------+
double Volume(double prix, double stop)
{
   double capital   = AccountInfoDouble(ACCOUNT_BALANCE);
   double risqueEur = capital * InpRisquePct / 100.0;
   double distance  = MathAbs(prix - stop);
   if(distance <= 0.0) return 0.0;

   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSz  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal <= 0.0 || tickSz <= 0.0) return 0.0;

   double perteParLot = distance / tickSz * tickVal;
   if(perteParLot <= 0.0) return 0.0;

   double lots = risqueEur / perteParLot;
   double pas  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double mini = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxi = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(pas > 0.0) lots = MathFloor(lots / pas) * pas;
   if(lots < mini) return 0.0;
   if(lots > maxi) lots = maxi;
   return lots;
}

//+------------------------------------------------------------------+
//| Extrême atteint depuis l'ouverture, RECALCULÉ par position :      |
//| un slot global se remettait à zéro dès deux positions et se       |
//| perdait au redémarrage du terminal.                               |
//+------------------------------------------------------------------+
double ExtremeDepuis(datetime ouverture, double d)
{
   int n = Bars(_Symbol, PERIOD_H1, ouverture, TimeCurrent());
   if(n < 1) n = 1;
   double b[];
   int lus = (d > 0.0) ? CopyHigh(_Symbol, PERIOD_H1, 0, n, b)
                       : CopyLow(_Symbol, PERIOD_H1, 0, n, b);
   if(lus < 1) return 0.0;
   double ext = b[0];
   for(int i = 1; i < lus; i++)
      if(d * b[i] > d * ext) ext = b[i];
   return ext;
}

//+------------------------------------------------------------------+
//| Sécurisation par paliers — port fidèle de majSecu (moteur.js)     |
//|  · déclencheur = parcours EXTRÊME atteint, pas le prix courant ;  |
//|  · niveau négatif = part du RISQUE, positif = part du chemin ;    |
//|  · butée stricte à 90 % du chemin réellement parcouru.            |
//+------------------------------------------------------------------+
void GererPaliers()
{
   if(InpPalier1Seuil <= 0 && InpPalier2Seuil <= 0 && InpPalier3Seuil <= 0) return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;

      ulong  ticket = (ulong)PositionGetInteger(POSITION_TICKET);
      double ouv    = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl     = PositionGetDouble(POSITION_SL);
      double tp     = PositionGetDouble(POSITION_TP);
      if(tp <= 0.0 || ouv <= 0.0) continue;

#ifdef SENS_VENTE
      double d = -1.0;
      double prix = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
#else
      double d = 1.0;
      double prix = SymbolInfoDouble(_Symbol, SYMBOL_BID);
#endif
      double sl0 = ouv * (1.0 - d * STOP_PCT / 100.0);

      datetime ouverture = (datetime)PositionGetInteger(POSITION_TIME);
      double extreme = ExtremeDepuis(ouverture, d);
      if(extreme <= 0.0) extreme = prix;
      if(d * prix > d * extreme) extreme = prix;

      double parcours = (extreme - ouv) / (tp - ouv) * 100.0;
      if(parcours <= 0.0) continue;

      double nouveau = sl;
      bool   trouve  = false;
      int    seuils[3];  seuils[0]  = InpPalier1Seuil;  seuils[1]  = InpPalier2Seuil;  seuils[2]  = InpPalier3Seuil;
      int    niveaux[3]; niveaux[0] = InpPalier1Niveau; niveaux[1] = InpPalier2Niveau; niveaux[2] = InpPalier3Niveau;

      for(int k = 0; k < 3; k++)
      {
         if(seuils[k] <= 0) continue;
         if(parcours < seuils[k]) continue;

         double cand = (niveaux[k] < 0)
            ? ouv + (niveaux[k] / 100.0) * (ouv - sl0)
            : ouv + (niveaux[k] / 100.0) * (tp - ouv);

         double part    = MathMin((double)seuils[k], parcours) * 0.9;
         double atteint = ouv + (part / 100.0) * (tp - ouv);
         if(d * cand > d * atteint) cand = atteint;

         if(!trouve || d * cand > d * nouveau) { nouveau = cand; trouve = true; }
      }
      if(!trouve) continue;

      nouveau = NormalizeDouble(nouveau, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
      if(sl <= 0.0 || d * nouveau > d * sl + _Point / 2.0)
         trade.PositionModify(ticket, nouveau, tp);
   }
}

//+------------------------------------------------------------------+
void GererDuree()
{
   if(DUREE_MAX <= 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      datetime ouverture = (datetime)PositionGetInteger(POSITION_TIME);
      // Le moteur compte des bougies de la série de BASE, donc des H1 (moteur.js :
      // i - iEnt >= dureeMax, sur les indices de df). Compter des seaux du signal
      // fermait 24 fois trop tard sur une ligne D1, week-ends inclus. Bars() ne
      // dénombre que les bougies réellement présentes : les jours fériés ne comptent pas.
      int barres = Bars(_Symbol, PERIOD_H1, ouverture, TimeCurrent());
      if(barres > DUREE_MAX)
         trade.PositionClose((ulong)PositionGetInteger(POSITION_TICKET));
   }
}

// Le tableau est dessiné en OBJETS (cadre + libellés) et non par Comment() : le
// commentaire se superpose aux bougies et reste illisible sur fond sombre.
#define PAN_PREF "SIV_PAN_"
#define PAN_MAX  16
// Les lignes sont d'abord mises en tampon, puis mesurées : la police est réduite et le
// cadre dimensionné sur la ligne la plus longue, sinon le texte sortait du graphique.
string g_lig[PAN_MAX];
string g_court[PAN_MAX];
color  g_col[PAN_MAX];
int    g_nlig   = 0;
int    g_taille = 9;

void Ligne(string texte, color couleur, string court = "")
{
   if(g_nlig >= PAN_MAX) return;
   g_lig[g_nlig]   = texte;
   g_court[g_nlig] = (court == "" ? texte : court);
   g_col[g_nlig]   = couleur;
   g_nlig++;
}

void PanneauLigne(int idx, string texte, color couleur)
{
   string nom = PAN_PREF + "L" + IntegerToString(idx);
   if(ObjectFind(0, nom) < 0)
   {
      ObjectCreate(0, nom, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, nom, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, nom, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, nom, OBJPROP_HIDDEN, true);
      ObjectSetString(0, nom, OBJPROP_FONT, "Consolas");
   }
   ObjectSetInteger(0, nom, OBJPROP_XDISTANCE, 12);
   ObjectSetInteger(0, nom, OBJPROP_YDISTANCE, 14 + idx * (g_taille + 7));
   ObjectSetInteger(0, nom, OBJPROP_FONTSIZE, g_taille);
   ObjectSetInteger(0, nom, OBJPROP_COLOR, couleur);
   ObjectSetString(0, nom, OBJPROP_TEXT, texte);
}

void PanneauFond(int nLignes, int largeur)
{
   string nom = PAN_PREF + "FOND";
   if(ObjectFind(0, nom) < 0)
   {
      ObjectCreate(0, nom, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, nom, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, nom, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, nom, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, nom, OBJPROP_BACK, false);
      ObjectSetInteger(0, nom, OBJPROP_BGCOLOR, C'18,20,24');
      ObjectSetInteger(0, nom, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, nom, OBJPROP_COLOR, clrDimGray);
   }
   ObjectSetInteger(0, nom, OBJPROP_XDISTANCE, 6);
   ObjectSetInteger(0, nom, OBJPROP_YDISTANCE, 6);
   ObjectSetInteger(0, nom, OBJPROP_XSIZE, largeur);
   ObjectSetInteger(0, nom, OBJPROP_YSIZE, 16 + nLignes * (g_taille + 7));
}

void PanneauDessiner()
{
   int large = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   // Deux jeux de libellés : le complet, et une version abrégée pour les graphiques
   // étroits (fenêtre non redimensionnable, panneaux MT5 ancrés). On rétrécit d'abord la
   // police sur le texte complet ; s'il ne rentre toujours pas à 8 pt, on passe aux
   // abrégés plutôt que de descendre à une taille illisible.
   int taille = InpTaillePolice, plusLong = 0;
   bool court = false;
   for(int essai = 0; essai < 2; essai++)
   {
      court = (essai == 1);
      taille = InpTaillePolice;
      for(;; taille--)
      {
         TextSetFont("Consolas", -taille * 10);
         plusLong = 0;
         for(int k = 0; k < g_nlig; k++)
         {
            uint w = 0, h = 0;
            TextGetSize(court ? g_court[k] : g_lig[k], w, h);
            if((int)w > plusLong) plusLong = (int)w;
         }
         if(large <= 0 || plusLong + 30 <= large) break;
         if(taille <= (court ? 6 : 8)) break;
      }
      if(large <= 0 || plusLong + 30 <= large) break;
   }
   g_taille = taille;

   // Le fond est posé AVANT les libellés : MQL5 peint les objets dans leur ordre de
   // création, donc un rectangle opaque créé en dernier recouvrait tout le texte.
   PanneauFond(g_nlig, plusLong + 20);
   for(int k = 0; k < g_nlig; k++) PanneauLigne(k, court ? g_court[k] : g_lig[k], g_col[k]);
   for(int k = g_nlig; k < PAN_MAX; k++) ObjectDelete(0, PAN_PREF + "L" + IntegerToString(k));
   g_nlig = 0;
   ChartRedraw(0);
}

void PanneauNettoyer() { ObjectsDeleteAll(0, PAN_PREF); }

//+------------------------------------------------------------------+
//| Tableau de bord sur le graphique : dire si le robot est en marche  |
//| et ce qu'il a fait aujourd'hui, ce mois, depuis le début.          |
//+------------------------------------------------------------------+
double PnlDepuis(datetime debut)
{
   double somme = 0.0;
   if(!HistorySelect(debut, TimeCurrent())) return 0.0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
      if((ulong)HistoryDealGetInteger(t, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      somme += HistoryDealGetDouble(t, DEAL_PROFIT)
             + HistoryDealGetDouble(t, DEAL_SWAP)
             + HistoryDealGetDouble(t, DEAL_COMMISSION);
   }
   return somme;
}

int NbTradesDepuis(datetime debut)
{
   int c = 0;
   if(!HistorySelect(debut, TimeCurrent())) return 0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
      if((ulong)HistoryDealGetInteger(t, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_OUT) c++;
   }
   return c;
}

void Tableau()
{
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   MqlDateTime j = t; j.hour = 0; j.min = 0; j.sec = 0;
   datetime debutJour = StructToTime(j);
   MqlDateTime m = j; m.day = 1;
   datetime debutMois = StructToTime(m);

   double solde   = AccountInfoDouble(ACCOUNT_BALANCE);
   double capital = AccountInfoDouble(ACCOUNT_EQUITY);
   double risque  = solde * InpRisquePct / 100.0;

   double pnlJour  = PnlDepuis(debutJour);
   double pnlMois  = PnlDepuis(debutMois);
   double pnlTotal = PnlDepuis(0);

   string pos = "aucune position ouverte";
   string posCourt = "aucune position";
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      double gain = PositionGetDouble(POSITION_PROFIT);
      double enR = (risque > 0.0) ? gain / risque : 0.0;
      pos = StringFormat("Position : depuis %s · %+.2f R (%+.2f EUR) · stop %.2f · objectif %.2f",
                         TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE | TIME_MINUTES),
                         enR, gain,
                         PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP));
      posCourt = StringFormat("Pos : %+.2f R (%+.0f EUR) · stop %.2f", enR, gain,
                              PositionGetDouble(POSITION_SL));
      break;
   }

   bool algo   = (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED);
   bool permis = (bool)MQLInfoInteger(MQL_TRADE_ALLOWED);
   bool prete  = (bool)AccountInfoInteger(ACCOUNT_TRADE_EXPERT);
   string etat = (algo && permis && prete) ? "EN MARCHE" : "ARRETE — activez le bouton Trading Algo";
   string etatCourt = (algo && permis && prete) ? "EN MARCHE" : "ARRETE (Trading Algo)";

   // creux courant : pic d'équité moins équité actuelle
   if(capital > g_pic) g_pic = capital;
   double creux = (g_pic > 0.0) ? (capital / g_pic - 1.0) * 100.0 : 0.0;
   double creuxEur = capital - g_pic;

   // rythme réellement observé, comparable au nombre de trades de la mesure
   int    nTotal = NbTradesDepuis(0);
   double jours  = (g_lancement > 0) ? (double)(TimeCurrent() - g_lancement) / 86400.0 : 0.0;
   double parAn  = (jours > 7.0) ? nTotal * 365.25 / jours : 0.0;

   color vert = C'110,200,130', rouge = C'225,110,110', gris = C'170,175,185', blanc = C'235,238,242';
   Ligne("SIVULA · ${nom}", blanc, "SIVULA");
   Ligne("Etat : " + etat, (etat == "EN MARCHE" ? vert : rouge), "Etat : " + etatCourt);
   Ligne("${esc(cfg.sym)} ${vente ? 'VENTE' : 'ACHAT'} · ${esc(cfg.ligne)} ${periode} · stop ${sl} % · R/R ${rr}", gris,
         "${esc(cfg.sym)} ${vente ? 'VENTE' : 'ACHAT'} · stop ${sl} % · R/R ${rr}");
   Ligne(StringFormat("Risque par trade : %.2f EUR = 1 R  (%.2f %% du capital)",
         risque, InpRisquePct), blanc,
         StringFormat("1 R = %.0f EUR (%.2f %%)", risque, InpRisquePct));
   Ligne(pos, (pos == "aucune position ouverte" ? gris : blanc), posCourt);
   Ligne(StringFormat("Creux actuel : %.2f %% (%+.2f EUR)%s", creux, creuxEur, "${refCreux}"), gris,
         StringFormat("Creux : %.2f %% (%+.0f EUR)", creux, creuxEur));
   Ligne(StringFormat("Rythme : %.1f trades/an · mesure : ${nb(cfg.n, 0)} trades, ${nb(cfg.rAn, 0).toFixed(1)} R/an${mesureVieille ? ' (a remesurer)' : ''}", parAn), gris,
         StringFormat("Rythme : %.1f/an (mesure ${nb(cfg.rAn, 0).toFixed(1)} R/an)", parAn));
   Ligne(StringFormat("Aujourd'hui : %+.2f EUR (%+.2f %%) · %d trade(s)",
         pnlJour, (solde > 0.0 ? pnlJour / solde * 100.0 : 0.0), NbTradesDepuis(debutJour)),
         (pnlJour >= 0.0 ? vert : rouge),
         StringFormat("Jour : %+.0f EUR · %d t", pnlJour, NbTradesDepuis(debutJour)));
   Ligne(StringFormat("Ce mois : %+.2f EUR (%+.2f %%) · %d trade(s)",
         pnlMois, (solde > 0.0 ? pnlMois / solde * 100.0 : 0.0), NbTradesDepuis(debutMois)),
         (pnlMois >= 0.0 ? vert : rouge),
         StringFormat("Mois : %+.0f EUR · %d t", pnlMois, NbTradesDepuis(debutMois)));
   Ligne(StringFormat("Depuis le debut : %+.2f EUR (%+.2f %%) · %d trade(s) · %+.1f R",
         pnlTotal, (solde > 0.0 ? pnlTotal / solde * 100.0 : 0.0), nTotal,
         (risque > 0.0 ? pnlTotal / risque : 0.0)),
         (pnlTotal >= 0.0 ? vert : rouge),
         StringFormat("Total : %+.0f EUR · %d t · %+.1f R", pnlTotal, nTotal,
                      (risque > 0.0 ? pnlTotal / risque : 0.0)));
   PanneauDessiner();
}

//+------------------------------------------------------------------+
//| Passe l'ordre. Renvoie false si le courtier l'a refusé (marché    |
//| fermé, distance de stop, volume) : le signal reste alors en       |
//| attente et sera réessayé au tick suivant du même seau.            |
//+------------------------------------------------------------------+
bool Entrer()
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
#ifdef SENS_VENTE
   double prix     = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double stop     = NormalizeDouble(prix * (1.0 + STOP_PCT / 100.0), digits);
   double risque   = stop - prix;
   double objectif = NormalizeDouble(prix - risque * OBJECTIF_R, digits);
#else
   double prix     = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double stop     = NormalizeDouble(prix * (1.0 - STOP_PCT / 100.0), digits);
   double risque   = prix - stop;
   double objectif = NormalizeDouble(prix + risque * OBJECTIF_R, digits);
#endif

   double minDist = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(risque < minDist)
   {
      Print("Entrée refusée : stop sous le minimum courtier");
      return false;
   }

   double lots = Volume(prix, stop);
   if(lots <= 0.0)
   {
      Print("Entrée refusée : volume calculé nul (risque trop faible pour le lot minimum)");
      return false;
   }

#ifdef SENS_VENTE
   if(!trade.Sell(lots, _Symbol, prix, stop, objectif, "${marque}"))
#else
   if(!trade.Buy(lots, _Symbol, prix, stop, objectif, "${marque}"))
#endif
   {
      Print("Ordre refusé : ", trade.ResultRetcodeDescription(), " — signal gardé en attente");
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
void OnTick()
{
   // pas dessiné dans le testeur : cela ralentirait le backtest
   if(!MQLInfoInteger(MQL_TESTER)) Tableau();
   GererPaliers();
   GererDuree();

   // une évaluation par seau clos : l'entrée tombe à l'ouverture de la bougie H1
   // qui suit cette clôture, comme l'entrée « à l'open suivant » du moteur
   long seau = SeauCourant(SEC_SIGNAL);
   // reprise d'un signal en attente : même seau, marché désormais ouvert
   if(seau >= 0 && seau == seauEnAttente && seau == dernierSeau)
   {
      if(ExecutionAutorisee() && Entrer()) seauEnAttente = -1;
      return;
   }
   // Tracé AVANT le garde-fou : quand l'agrégation échoue, « seau » vaut -1 et OnTick
   // sortait en silence — le journal restait vide précisément dans le cas à instruire.
   // Une ligne par bougie H1 au maximum, pour ne pas noyer le journal.
   if(InpDiagnostic && seau < 0)
   {
      datetime dDu = StringToTime(InpDiagDu), dAu = StringToTime(InpDiagAu);
      datetime tt = TimeCurrent();
      // Déduplication sur l'heure de la BOUGIE H1, pas sur TimeCurrent() : en modélisation
      // « 1 minute OHLC », TimeCurrent() change à chaque minute simulée et le filtre ne
      // retenait rien — jusqu'à 180 000 lignes sur une année, journal illisible.
      datetime h1[];
      if(tt >= dDu && tt <= dAu && CopyTime(_Symbol, PERIOD_H1, 0, 1, h1) > 0
         && h1[0] != g_diagDerniere)
      {
         g_diagDerniere = h1[0];
         PrintFormat("DIAG %s | PAS DE SEAU : bougies agrégées=%d, H1 demandées=%d, H1 disponibles=%d, CopyRates a rendu=%d",
                     TimeToString(h1[0], TIME_DATE | TIME_MINUTES), g_n, g_besoin, g_dispo, g_lus);
      }
   }
   if(seau < 0 || seau == dernierSeau) return;
   dernierSeau = seau;

   // Diagnostic : une ligne par journée close, avec la raison exacte du refus.
   // Une seule exécution suffit alors à savoir pourquoi une date de la mesure n'a pas
   // déclenché — au lieu d'enchaîner les hypothèses.
   bool sig = Signal();
   if(InpDiagnostic)
   {
      datetime dDu = StringToTime(InpDiagDu), dAu = StringToTime(InpDiagAu);
      datetime maintenant = TimeCurrent();
      if(maintenant >= dDu && maintenant <= dAu)
      {
         double dc1 = C_(SEC_SIGNAL, 1), dc2 = C_(SEC_SIGNAL, 2);
         double dl1 = LigneAgr(SEC_SIGNAL, M_SIGNAL, PER_SIGNAL, 1);
         double dl2 = LigneAgr(SEC_SIGNAL, M_SIGNAL, PER_SIGNAL, 2);
         // %.2f rendait le journal illisible sur une paire cotée à 5 décimales : la
         // clôture et la ligne s'y écrivaient toutes deux « 0.86 » alors qu'elles
         // décident du signal au pip près. On imprime à la précision du symbole.
         // bas1/haut1 sont indispensables : c'est le BAS qui décide du rebond, et
         // sans lui un refus « ni croisement ni rebond » reste inexplicable.
         PrintFormat("DIAG %s | %s | c1=%s c2=%s ligne1=%s ligne2=%s bas1=%s haut1=%s | agr=%d | %s",
                     TimeToString(maintenant, TIME_DATE | TIME_MINUTES),
                     (sig ? "SIGNAL" : "refus"),
                     DoubleToString(dc1, _Digits), DoubleToString(dc2, _Digits),
                     DoubleToString(dl1, _Digits), DoubleToString(dl2, _Digits),
                     DoubleToString(L_(SEC_SIGNAL, 1), _Digits),
                     DoubleToString(H_(SEC_SIGNAL, 1), _Digits),
                     g_n, (sig ? "" : g_raison));
      }
   }
   if(!sig) return;
   if(!ExecutionAutorisee() || !Entrer())
   {
      // le signal n'est pas perdu : on le réessaiera dans le même seau
      seauEnAttente = seau;
      return;
   }
   seauEnAttente = -1;
}
//+------------------------------------------------------------------+
`;
}
