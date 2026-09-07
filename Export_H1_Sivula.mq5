//+------------------------------------------------------------------+
//|  Export_H1_Sivula.mq5                                            |
//|  Écrit l'historique H1 dans un CSV lu par Sivula, AVEC la         |
//|  colonne de spread. Un fichier par symbole, dans MQL5/Files.      |
//|                                                                   |
//|  Le spread écrit est celui de la bougie M1 qui OUVRE l'heure —    |
//|  pas le champ spread de la bougie H1. Les deux diffèrent, et le   |
//|  journal du testeur le prouve : sur AUDCAD 2020, à l'ouverture    |
//|  d'une heure de séance le robot voit 12 points là où la H1 en     |
//|  annonce 25, et à 00:00 il en voit 112 là où la H1 en annonce 50. |
//|  Le champ de la H1 est une valeur agrégée sur l'heure ; elle est  |
//|  DEUX FOIS trop haute en séance et DEUX FOIS trop basse au        |
//|  rollover. Or c'est à l'ouverture de la bougie que l'ordre part : |
//|  c'est ce spread-là que la mesure doit payer, et celui-là seul    |
//|  que le robot peut retrouver. Avec l'ancienne colonne, aucun      |
//|  réglage ne pouvait faire coïncider Sivula et le testeur ; avec   |
//|  celle-ci, AUDCAD s'apparie à 43 entrées sur 44.                  |
//|                                                                   |
//|  UTILISATION                                                      |
//|  Glissez le script sur n'importe quel graphique. L'unité de temps |
//|  affichée n'a aucune importance : H1 et M1 sont demandées         |
//|  explicitement, quel que soit le graphique.                       |
//|  Laissez InpSymboles vide pour n'exporter que le symbole du       |
//|  graphique, mettez « * » pour TOUTE l'Observation du marché, ou   |
//|  listez-en autant que vous voulez, séparés par des virgules —     |
//|  ils seront traités à la suite, sans autre manipulation.          |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

// Vide = le symbole du graphique. « * » = TOUTE l'Observation du marché. Sinon une
// liste : "AUDCAD,GOLD,NZDCAD".
// Les symboles absents de l'Observation du marché y sont ajoutés automatiquement.
//
// L'étoile évite de recopier cent cinquante noms à la main — et surtout de les recopier
// FAUX : le nom exact d'un symbole varie d'un compte à l'autre (GOLD, XAUUSD, #Germany40,
// GER40.cash…), et un nom erroné produit un fichier manquant qu'on ne remarque qu'au
// moment de mesurer. Le terminal, lui, connaît ses propres noms.
// Source PRIORITAIRE de la liste : un symbole par ligne, lignes vides et lignes « # »
// ignorées. Écrit par Sivula, remplacé à chaque changement de sélection.
//
// LA LISTE NE VIT PAS DANS CE FICHIER. En dur, il faudrait rouvrir MetaEditor et
// recompiler à chaque changement de sélection — pour un geste hebdomadaire, c'est
// inacceptable. Ce script se compile UNE fois et ne bouge plus ; c'est le .txt qui change.
input string   InpFichierListe = "Sivula\\symboles.txt"; // Liste de symboles (prioritaire)
input string   InpSymboles  = "";             // Symboles ("*" = tout, vide = le graphique)
// UN AN AVANT le début de la mesure, pas le début lui-même. Le moteur a besoin de
// 400 jours d'amorce (AMORCE_JOURS) pour ses agrégats, et la médiane du spread porte
// sur les 6000 dernières bougies H1 — environ 250 séances. Exporter à partir de la
// date de test donne un moteur sans amorce : plafond de spread inactif au début, et
// lignes de référence fausses tant que le tampon n'est pas rempli.
input datetime InpDu        = D'2019.01.01';  // Depuis (≈ 1 an AVANT le début du test)
input int      InpMaxBarres = 200000;         // Bougies maximum par fichier
// Sept ans de M1 = plusieurs millions de barres : sur un VPS à ligne lente le
// téléchargement prend des minutes. Augmentez si le script rend la main trop tôt.
input int      InpAttenteSec = 1800;          // Attente max du téléchargement, par unité (s)
// LE MÊME SCRIPT, RÉGLÉ SUR M1. Les fichiers _M1.csv ne servent qu'à départager
// Sivula et le robot MT5 quand ils divergent — savoir si le stop ou l'objectif a
// été touché d'abord dans l'heure. Le scan et le backtest n'en ont pas besoin :
// ils travaillent en H1. Comptez soixante fois le volume du H1 : n'exportez en M1
// que les instruments que vous comparez.
input bool     InpM1       = false;           // Exporter la M1 (départage robot) au lieu du H1
// Le départage intrabar (spread d'ouverture, ordre des extrêmes, colonnes m1_*)
// demande la M1 entière : des millions de barres que le terminal construit EN
// MÉMOIRE, au point de cesser de répondre plusieurs minutes par symbole — constaté
// sur AUDNZD, 1,78 million de barres. La M1 ne se charge donc que sur demande.
// Sans elle, le spread écrit est celui de la H1 et l'ordre des extrêmes reste
// inconnu : le moteur le dit et retombe sur sa convention de lecture, comportement
// déjà prévu. InpM1 (le format de sortie) charge la M1 quoi qu'il arrive.
input bool     InpChargerM1 = false;          // Charger la M1 (départage intrabar — lourd)

//+------------------------------------------------------------------+
//| Force le téléchargement d'un historique et attend qu'il arrive.   |
//|                                                                   |
//| MT5 étend son historique PAR L'ARRIÈRE, en repartant du présent.  |
//| Demander directement une plage vieille de sept ans ne déclenche   |
//| rien : le terminal répond avec ce qu'il a et n'élargit pas sa     |
//| base — observé sur un VPS, « plus ancienne barre : 2026.07.17 »   |
//| répété à l'identique toutes les dix secondes.                     |
//|                                                                   |
//| On demande donc un NOMBRE croissant de barres comptées depuis     |
//| maintenant. Chaque palier oblige le terminal à remonter d'un cran |
//| et à réclamer le morceau manquant au serveur.                     |
//+------------------------------------------------------------------+
bool AttendreHistorique(string sym, ENUM_TIMEFRAMES tf, string nomTf,
                        datetime depuis, int secondesMax, datetime &dispo)
{
   dispo = 0;
   uint fin = GetTickCount() + (uint)secondesMax * 1000;
   datetime premiere = 0;
   int paliers[] = {50000, 200000, 500000, 1000000, 2000000, 4000000, 8000000};
   int p = 0;
   // JAMAIS plus de barres que la période n'en contient. Les grands paliers sont
   // faits pour la M1 ; demander 8 000 000 de barres H1 quand sept ans en font
   // 61 000 force le terminal à construire des années hors sujet, en mémoire, dans
   // son propre processus : interface « Ne répond pas », et fermeture pure et
   // simple quand la machine est juste. Le dernier palier utile est ramené au
   // besoin réel — le mécanisme d'extension par le nombre, lui, ne change pas.
   long besoin = (TimeCurrent() - depuis) / PeriodSeconds(tf) + 5000;
   if(besoin < 2000) besoin = 2000;   // InpDu dans le futur : jamais de palier négatif
   int pMax = 0;
   while(pMax < ArraySize(paliers) - 1 && paliers[pMax] < besoin) pMax++;
   if((long)paliers[pMax] > besoin) paliers[pMax] = (int)besoin;
   // Détection d'épuisement : quand le courtier n'a plus rien à donner (AUDNZD chez
   // FxPro : M1 depuis le 26/11/2021, 1 778 154 barres face à 2 000 000 demandées),
   // ni « autant que demandé » ni « première date atteinte » ne peuvent plus se
   // produire, et la boucle tournait à vide jusqu'au bout d'InpAttenteSec. Deux tours
   // consécutifs au même compte ET à la même première date disent que la base est au
   // bout — deux, pas un : pendant un téléchargement le compte bouge à chaque passage.
   int luPrec = -1;
   datetime premierePrec = 0;

   while(GetTickCount() < fin && !IsStopped())
   {
      premiere = (datetime)SeriesInfoInteger(sym, tf, SERIES_FIRSTDATE);
      if(premiere > 0 && premiere <= depuis
         && (bool)SeriesInfoInteger(sym, tf, SERIES_SYNCHRONIZED))
      {
         PrintFormat("%s %s : historique complet depuis %s.", sym, nomTf,
                     TimeToString(premiere, TIME_DATE));
         dispo = premiere;
         return true;
      }

      // demande par le nombre, pas par la date : c'est ce qui fait remonter la base
      datetime t[];
      int lu = CopyTime(sym, tf, 0, paliers[p], t);
      // relue APRÈS la demande : lue avant, la date imprimée était celle du tour
      // précédent, d'où des suites incohérentes pendant un téléchargement normal
      premiere = (datetime)SeriesInfoInteger(sym, tf, SERIES_FIRSTDATE);
      PrintFormat("%s %s : %d barres demandées, %d reçues — plus ancienne : %s",
                  sym, nomTf, paliers[p], lu,
                  premiere > 0 ? TimeToString(premiere, TIME_DATE) : "aucune");

      if(lu > 0 && premiere > 0 && lu == luPrec && premiere == premierePrec)
      {
         // La base du courtier est au bout : information, pas erreur — l'export continue.
         if(tf == PERIOD_M1)
            PrintFormat("%s M1 : le courtier ne fournit la M1 que depuis %s (%d barres). "
                        "Avant cette date, Sivula utilisera le spread du relevé.",
                        sym, TimeToString(premiere, TIME_DATE), lu);
         else
            PrintFormat("%s %s : le courtier ne fournit la %s que depuis %s (%d barres). "
                        "L'export s'arrêtera à cette date.",
                        sym, nomTf, nomTf, TimeToString(premiere, TIME_DATE), lu);
         dispo = premiere;
         return true;
      }
      luPrec = lu;
      premierePrec = premiere;

      // le palier a porté ses fruits : on garde le même tant qu'il progresse,
      // et on ne dépasse jamais le palier du besoin réel
      if(lu >= paliers[p] && p < pMax) p++;
      Sleep(3000);
   }
   // Ici la base PROGRESSAIT encore quand le délai est tombé : le conseil d'augmenter
   // InpAttenteSec reste juste dans ce cas-là — l'épuisement, lui, sort plus haut.
   PrintFormat("%s %s : ARRÊT après %d s. Plus ancienne barre : %s, demandé : %s. "
               "Augmentez InpAttenteSec, ou passez par Affichage > Symboles (Ctrl+U), "
               "onglet Barres, période %s, et cliquez Demander.",
               sym, nomTf, secondesMax,
               premiere > 0 ? TimeToString(premiere, TIME_DATE) : "aucune",
               TimeToString(depuis, TIME_DATE), nomTf);
   dispo = premiere;
   return false;
}

//+------------------------------------------------------------------+
//| L'ordre peut-il partir sur la bougie qui OUVRE à cet instant ?     |
//|                                                                    |
//| Une bougie peut être COTÉE sans être TRAITABLE. Sur #HongKong50    |
//| les bougies de 03:00 et 04:00 portent un spread normal — 0,080 %   |
//| et 0,019 % — et l'ordre y est refusé : la séance de négociation    |
//| ouvre après la séance de cotation. Sans cette colonne, Sivula      |
//| inscrivait un prix que personne ne pouvait traiter, deux heures    |
//| avant l'entrée réelle du robot.                                    |
//|                                                                    |
//| Une bougie compte comme traitable si son OUVERTURE tombe dans la   |
//| séance, pas si la séance commence quelque part dedans. Les deux    |
//| lectures ont été mesurées contre le testeur : la stricte donne     |
//| Germany40 70 % d'entrées sur la même bougie contre 56 %, GOLD 85 % |
//| contre 83 %, Japan225 91 % contre 90 %. Elle perd seulement sur    |
//| #HongKong50, et pour une autre raison — celle-ci :                 |
//|                                                                    |
//| RÉSERVE : SymbolInfoSessionTrade rend les séances TELLES QU'ELLES  |
//| SONT CONFIGURÉES AUJOURD'HUI, appliquées à un jour de la semaine.  |
//| Quand la bourse et le serveur ne changent pas d'heure d'été aux    |
//| mêmes dates, la séance glisse d'une heure une partie de l'année.   |
//| Le journal de conformité de #HongKong50 le montre sans ambiguïté : |
//| MT5 entre à 04:15 d'avril à octobre et à 05:00 de novembre à mars, |
//| là où la table lue en septembre annonce 05:00 toute l'année. Cette |
//| colonne est donc juste cinq mois sur douze pour cet instrument.    |
//| Aucune table statique ne peut couvrir les deux régimes : il        |
//| faudrait un calendrier par DATE, que MT5 n'expose pas et qu'une    |
//| exécution du journal de conformité permettrait de reconstituer.    |
//+------------------------------------------------------------------+
// Heure d'été européenne : dernier dimanche de mars 01:00 UTC au dernier dimanche
// d'octobre 01:00 UTC. Le serveur du courtier la suit — vérifié sur #HongKong50, dont
// la pause déjeuner tombe à 06:00 l'hiver et à 07:00 l'été, et dont la première bougie
// cotée de la journée passe de 03:00 à 04:00.
int DernierDimanche(int annee, int mois)
{
   for(int j = 31; j >= 25; j--)
   {
      MqlDateTime d; d.year = annee; d.mon = mois; d.day = j;
      d.hour = 0; d.min = 0; d.sec = 0;
      datetime t = StructToTime(d);
      MqlDateTime v; TimeToStruct(t, v);
      if(v.day == j && v.day_of_week == 0) return j;
   }
   return 31;
}

bool HeureEte(datetime t)
{
   MqlDateTime d; TimeToStruct(t, d);
   if(d.mon < 3 || d.mon > 10) return false;
   if(d.mon > 3 && d.mon < 10) return true;
   int dim = DernierDimanche(d.year, d.mon);
   if(d.mon == 3) return (d.day > dim || (d.day == dim && d.hour >= 1));
   return (d.day < dim || (d.day == dim && d.hour < 1));
}

// Une bougie H1 est traitable si la séance couvre UN MOMENT QUELCONQUE de l'heure —
// mais on ne s'autorise cette lecture que là où la table de séance a réellement été lue.
//
// SymbolInfoSessionTrade ne rend que la table du JOUR de l'export, sans historique, et
// les deux tables du courtier ne se déduisent pas l'une de l'autre. Mesuré sur le
// journal #HongKong50 du 6 septembre 2026, 67 trades sur six ans :
//
//   avril à septembre   le testeur entre à 04:15, DANS la bougie de 04:00
//   octobre à mars      il refuse 03:00 et 04:00 (« market closed ») et entre à 05:00
//
// La séance ouvre donc à 04:15 l'été. Ne tester que la minute d'ouverture de la bougie
// écartait 04:00 — 38 des 67 trades tombaient sur une bougie que Sivula tenait pour
// fermée, et le résultat changeait de signe : +6,63 R au testeur contre -5,30 au moteur.
//
// Dans l'autre état d'heure d'été, la table lue ne vaut pas : on garde la lecture
// STRICTE, celle qui n'ouvre la bougie que si la séance couvre déjà sa première minute.
// Sur #HongKong50 elle rend exactement le comportement d'hiver — 05:00 première bougie
// traitable. Vérifié sur les deux saisons de cet instrument ; à revérifier sur un autre
// courtier, et le seul moyen d'être sûr des deux tables est de relancer cet export après
// le changement d'heure.
bool Traitable(string sym, datetime t)
{
   MqlDateTime d; TimeToStruct(t, d);
   ENUM_DAY_OF_WEEK jour = (ENUM_DAY_OF_WEEK)d.day_of_week;
   int deb = d.hour * 60 + d.min, fin = deb + 60;
   bool memeSaison = (HeureEte(t) == HeureEte(TimeCurrent()));
   datetime de, a;
   bool aucuneSeance = true;
   for(int k = 0; k < 8; k++)
   {
      if(!SymbolInfoSessionTrade(sym, jour, k, de, a)) break;
      aucuneSeance = false;
      MqlDateTime dd, aa; TimeToStruct(de, dd); TimeToStruct(a, aa);
      int m1 = dd.hour * 60 + dd.min, m2 = aa.hour * 60 + aa.min;
      // une séance qui franchit minuit est rendue avec une fin inférieure au début
      if(m2 <= m1)
      {
         if(memeSaison ? (deb < m2 || fin > m1) : (deb >= m1 || deb < m2)) return true;
      }
      else if(memeSaison ? (deb < m2 && fin > m1) : (deb >= m1 && deb < m2)) return true;
   }
   // aucune séance déclarée : le courtier ne restreint rien, tout est traitable
   return aucuneSeance;
}

//+------------------------------------------------------------------+
//| Exporte un symbole. Rend false si rien n'a pu être écrit.         |
//|                                                                   |
//| PAR TRANCHES D'UN AN, jamais tout d'un coup : demander 1,78       |
//| million de barres M1 en un seul CopyRates les fait construire en  |
//| mémoire dans le processus du terminal, qui passe en « Ne répond   |
//| pas » plusieurs minutes — constaté sur AUDNZD. Une tranche d'un   |
//| an plafonne l'appel à ~372 000 barres M1 (~8 800 H1), la mémoire  |
//| est rendue entre deux tranches, et le fichier s'écrit au fur et à |
//| mesure. Le fichier n'est OUVERT qu'au premier lot de barres       |
//| obtenu : une interruption ne laisse plus de CSV de 0 Ko que       |
//| Sivula lirait comme une série vide.                               |
//+------------------------------------------------------------------+
const int TRANCHE_SECONDES = 31536000;   // 365 jours

bool Exporter(string sym)
{
   if(!SymbolSelect(sym, true))
   {
      PrintFormat("%s : symbole inconnu du courtier — vérifiez l'orthographe exacte "
                  "dans l'Observation du marché (certains portent un « # »).", sym);
      Rate(sym, "symbole inconnu du courtier");
      return false;
   }

   // Le « # » de certains symboles (#Japan225) n'est pas valide dans un nom de fichier
   // sur tous les systèmes, et Sivula reconnaît l'instrument sans lui.
   string propre = sym;
   StringReplace(propre, "#", "");
   string nom = propre + (InpM1 ? "_M1.csv" : "_H1.csv");

   // ————— LA REPRISE : relancer un export interrompu ne recommence pas tout —————
   if(DejaCouvert(nom, sym)) return true;

   bool chargerM1 = InpChargerM1 || InpM1;
   PrintFormat("%s : demande de l'historique depuis %s.", sym, TimeToString(InpDu, TIME_DATE));
   datetime dispoM1 = 0, dispoH1 = 0;
   if(chargerM1)
   {
      // la construction de plusieurs millions de barres M1 occupe le PROCESSUS du
      // terminal : l'interface peut sembler figée pendant quelques minutes — c'est
      // le prix du départage intrabar, pas une panne. Le journal reprend ensuite.
      PrintFormat("%s : téléchargement M1 — le terminal peut sembler figé quelques "
                  "minutes, laissez-le finir.", sym);
      AttendreHistorique(sym, PERIOD_M1, "M1", InpDu, InpAttenteSec, dispoM1);
   }
   if(InpM1) return ExporterM1(sym, nom, dispoM1);
   AttendreHistorique(sym, PERIOD_H1, "H1", InpDu, InpAttenteSec, dispoH1);

   // ————— LA DEMANDE RECADRÉE sur ce que le courtier fournit —————
   // Demander une plage qui commence trois ans avant le premier historique disponible
   // rend zéro barre : c'est ce qui produisait le fichier vide.
   datetime debut = InpDu;
   if(dispoH1 > debut)
   {
      debut = dispoH1;
      PrintFormat("%s : demande recadrée sur %s — le courtier n'a rien avant.",
                  sym, TimeToString(debut, TIME_DATE));
   }
   if(!chargerM1)
      PrintFormat("%s : M1 non demandée (InpChargerM1=false) — spread de la H1, ordre "
                  "des extrêmes inconnu. Cochez InpChargerM1 pour le départage intrabar.", sym);

   int dec = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   int f = INVALID_HANDLE;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   MqlRates m1[];
   ArraySetAsSeries(m1, false);

   int sansSpread = 0, sansM1 = 0, horsSeance = 0, sansOrdre = 0, memeMinute = 0, ecartH1M1 = 0;
   int renduN = 0, renduFort = 0; double renduTotal = 0.0;
   int totalN = 0; long totalM1 = 0;
   datetime premierT = 0, dernierT = 0, premierM1 = 0;
   bool plafond = false;

   for(datetime t0 = debut; t0 < TimeCurrent() && !IsStopped() && !plafond; t0 += TRANCHE_SECONDES)
   {
      datetime t1 = t0 + TRANCHE_SECONDES;
      datetime maintenant = TimeCurrent();
      if(t1 > maintenant) t1 = maintenant;

      int n = CopyRates(sym, PERIOD_H1, t0, t1 - 1, r);
      if(n <= 0) { ArrayFree(r); continue; }
      int nM1 = 0;
      if(chargerM1)
      {
         // l'heure de marge : la dernière H1 de la tranche a besoin de ses 60 minutes
         nM1 = CopyRates(sym, PERIOD_M1, t0, t1 - 1 + 3600, m1);
         if(nM1 < 0) nM1 = 0;
         if(nM1 > 0 && premierM1 == 0) premierM1 = m1[0].time;
         // l'heure de marge appartient à la tranche suivante : ne pas la compter deux fois
         int surplus = 0;
         for(int j = nM1 - 1; j >= 0 && m1[j].time >= t1; j--) surplus++;
         totalM1 += nM1 - surplus;
      }

      if(f == INVALID_HANDLE)
      {
         f = FileOpen(nom, FILE_WRITE | FILE_TXT | FILE_ANSI);
         if(f == INVALID_HANDLE)
         {
            PrintFormat("%s : écriture impossible (%d)", sym, GetLastError());
            Rate(sym, StringFormat("écriture du fichier impossible (erreur %d)", GetLastError()));
            ArrayFree(r); ArrayFree(m1);
            return false;
         }
         // La date à partir de laquelle la M1 existe voyage AVEC les données : sans elle,
         // la comparaison moteur ↔ MT5 accuserait un écart de modèle là où il n'y a
         // qu'une absence de matière. Le jeton vit DANS la dernière cellule de l'en-tête,
         // pas dans une quinzième : Sivula compte les cellules pour détecter une date sur
         // deux colonnes, et repère ses colonnes par nom — « bas_apres … » reste reconnu,
         // le compte ne bouge pas, les fichiers déjà déposés restent lisibles.
         string m1Dep = "aucune";
         if(chargerM1 && dispoM1 > 0)
            m1Dep = TimeToString(dispoM1 > debut ? dispoM1 : debut, TIME_DATE);
         FileWriteString(f, StringFormat("date,open,high,low,close,volume,spread,session,min_haut,min_bas,m1_haut,m1_bas,haut_apres,bas_apres m1_depuis=%s\r\n", m1Dep));
      }

      int iM1 = 0;
      for(int i = 0; i < n; i++)
      {
         if(totalN >= InpMaxBarres) { plafond = true; break; }
         // les deux séries sont croissantes : une seule passe suffit
         while(iM1 < nM1 && m1[iM1].time < r[i].time) iM1++;
         int sp = r[i].spread;
         // La PREMIÈRE M1 de l'heure, pas celle dont l'horodatage égale l'heure pile.
         //
         // Exiger l'égalité ratait la bougie d'ouverture de la journée : la séance de
         // #Germany40 ouvre à 03:31, il n'existe donc AUCUNE M1 à 03:00, et l'export
         // retombait sur l'agrégat H1 — la valeur basse et tardive — au lieu du spread
         // d'ouverture que le robot paie. Mesuré sur le journal du 6 septembre 2026 :
         // 45 spreads sur 462 s'écartaient de ce que lit le robot, TOUS sur la bougie de
         // 03:00, jusqu'à 38 fois trop bas — 0,00100 écrit contre 0,03793 payé. Sur GOLD,
         // 16 sur 2 933, tous à 00:00 ou 01:00. Le moteur croyait donc pouvoir entrer à
         // l'ouverture là où le robot refusait, plafond dépassé.
         if(iM1 < nM1 && m1[iM1].time < r[i].time + 3600) sp = m1[iM1].spread;
         else sansM1++;

         // ORDRE DES EXTRÊMES — la minute du plus haut et celle du plus bas.
         //
         // Deux entiers, et l'indécision du backtest s'effondre. Une bougie H1 dit ce que
         // le prix a touché, pas dans quel ordre : quand elle arme un palier PUIS
         // redescend le toucher, le sort du trade dépend de cet ordre et de rien d'autre.
         // Mesuré sur les sept instruments de référence : sans palier la question ne se
         // pose jamais, mais avec les paliers 25→0 / 50→25 / 75→50 elle décide de 26 % des
         // trades de GOLD et de 42 % de ceux de BITCOIN, pour une bande de 100 R.
         //
         // Exporter la M1 entière coûterait soixante fois le fichier. Ces deux colonnes
         // coûtent quatre caractères par ligne et tranchent le même cas : le haut avant le
         // bas, ou l'inverse. Quand les deux tombent dans la MÊME minute, on écrit -1 :
         // l'ordre reste inconnu, et le moteur doit continuer à le dire plutôt que d'en
         // inventer un.
         int minHaut = -1, minBas = -1;
         double m1Haut = 0.0, m1Bas = 0.0;
         {
            int j = iM1;
            double hh = -1.0, ll = -1.0;
            while(j < nM1 && m1[j].time < r[i].time + 3600)
            {
               if(hh < 0.0 || m1[j].high > hh) { hh = m1[j].high; minHaut = (int)((m1[j].time - r[i].time) / 60); }
               if(ll < 0.0 || m1[j].low  < ll) { ll = m1[j].low;  minBas  = (int)((m1[j].time - r[i].time) / 60); }
               j++;
            }
            m1Haut = (hh > 0.0) ? hh : 0.0;
            m1Bas  = (ll > 0.0) ? ll : 0.0;
            if(minHaut < 0 || minBas < 0) sansOrdre++;
            else if(minHaut == minBas) memeMinute++;
            // Le haut et le bas VUS PAR LA M1 — ceux que le testeur rejoue réellement.
            //
            // Ils ne sont pas toujours ceux de la bougie H1 : le courtier stocke une H1
            // reconstituée dont les extrêmes n'ont jamais existé à la minute. Vu sur GOLD
            // le 21 janvier 2020 — la H1 de 00:00 porte un bas de 1 546,23, sous le stop
            // initial d'une position ouverte le 16 ; aucune autre heure de la journée ne
            // descend sous 1 558, et le testeur, lui, n'a rien vu et est sorti au point
            // mort dix heures plus tard. Le signal se lit sur la H1 du courtier, comme le
            // robot ; l'exécution doit se lire sur la M1, comme le testeur.
            if(m1Haut > 0.0 && (m1Haut < r[i].high - _Point || m1Bas > r[i].low + _Point)) ecartH1M1++;
         }

         // CE QUE LE PRIX A FAIT APRÈS LE SECOND EXTRÊME.
         //
         // L'ordre des deux extrêmes ne suffit pas, et c'est le dernier écart face au
         // testeur. Quand le bas tombe EN PREMIER, il ne ferme rien : le palier n'existe
         // pas encore. Le haut arrive ensuite et l'arme. Entre ce haut et la clôture, le
         // prix a pu redescendre toucher le palier puis remonter — deux extrêmes et une
         // clôture ne le disent pas, et une clôture au-dessus du palier ne le réfute pas.
         // Mesuré sur les huit configurations de référence : 133 trades sur 538 sur GOLD,
         // 118 sur 355 sur BITCOIN, pour une bande de 80 R et 54 R.
         //
         // Ces deux colonnes ferment le cas dans un sens, et c'est le sens utile : quand
         // `bas_apres` est SOUS le palier, le retour a eu lieu APRÈS l'armement — c'est
         // une preuve, puisque l'armement précède le haut qui ouvre la fenêtre. Le moteur
         // sort alors au palier dans les DEUX lectures. Quand il est au-dessus, le doute
         // subsiste sur le seul intervalle allant de l'armement au haut, et le moteur
         // continue à le déclarer indécidable au lieu de parier.
         double hautApres = 0.0, basApres = 0.0;
         if(minHaut >= 0 && minBas >= 0)
         {
            int depart = (minHaut > minBas) ? minHaut : minBas;
            int j = iM1;
            while(j < nM1 && m1[j].time < r[i].time + 3600)
            {
               int mn = (int)((m1[j].time - r[i].time) / 60);
               if(mn >= depart)
               {
                  if(hautApres <= 0.0 || m1[j].high > hautApres) hautApres = m1[j].high;
                  if(basApres  <= 0.0 || m1[j].low  < basApres)  basApres  = m1[j].low;
               }
               j++;
            }
            // Part de l'amplitude de l'heure que le prix REND après son second extrême.
            // C'est elle qui dit si ces colonnes valent leur place : à 0 le prix ne revient
            // jamais et le doute était sans objet, à 1 il revient toujours et la lecture
            // optimiste était fausse partout.
            double ampl = r[i].high - r[i].low;
            if(ampl > 0.0 && basApres > 0.0 && hautApres > 0.0)
            {
               double rendu = (minHaut > minBas)
                  ? (r[i].high - basApres) / ampl     // haut en second : ce qu'on rend vers le bas
                  : (hautApres - r[i].low) / ampl;    // bas en second : ce qu'on rend vers le haut
               renduTotal += rendu; renduN++;
               if(rendu > 0.5) renduFort++;
            }
         }

         int seance = Traitable(sym, r[i].time) ? 1 : 0;
         if(seance == 0) horsSeance++;
         if(sp <= 0) sansSpread++;
         FileWriteString(f, StringFormat("%s,%s,%s,%s,%s,%I64d,%d,%d,%d,%d,%s,%s,%s,%s\r\n",
            TimeToString(r[i].time, TIME_DATE | TIME_MINUTES),
            DoubleToString(r[i].open,  dec),
            DoubleToString(r[i].high,  dec),
            DoubleToString(r[i].low,   dec),
            DoubleToString(r[i].close, dec),
            r[i].tick_volume,
            sp, seance, minHaut, minBas,
            DoubleToString(m1Haut, dec), DoubleToString(m1Bas, dec),
            DoubleToString(hautApres, dec), DoubleToString(basApres, dec)));

         if(premierT == 0) premierT = r[i].time;
         dernierT = r[i].time;
         totalN++;
      }
      // ————— LA MÉMOIRE EST RENDUE entre deux tranches, et la main au terminal —————
      ArrayFree(r);
      ArrayFree(m1);
      Sleep(50);
   }

   // ————— UN FICHIER VIDE N'EST JAMAIS ÉCRIT —————
   if(f == INVALID_HANDLE || totalN == 0)
   {
      if(f != INVALID_HANDLE) { FileClose(f); FileDelete(nom); }
      PrintFormat("%s : aucune bougie H1 depuis %s. Si « historique incomplet » est "
                  "apparu, augmentez InpAttenteSec.", sym, TimeToString(debut, TIME_DATE));
      Rate(sym, "historique H1 vide depuis " + TimeToString(debut, TIME_DATE));
      return false;
   }
   FileClose(f);

   // Un historique plus court que demandé n'empêche pas l'export, mais il explique
   // qu'un scan mesure six ans sur un instrument et deux sur son voisin. On le NOTE
   // sans faire échouer : le fichier est écrit, seulement plus court qu'attendu.
   // Une note, pas un échec : par Rate(), le symbole finissait sous « Ces
   // instruments n'ont PAS de fichier » alors que le fichier existe — et avec la
   // demande recadrée, tout historique court y serait tombé systématiquement.
   // La profondeur par symbole est déjà reprise au récapitulatif.
   if(premierT > InpDu + 86400 * 40)
      PrintFormat("%s : exporté, mais l'historique ne remonte qu'au %s au lieu du %s.",
           sym, TimeToString(premierT, TIME_DATE), TimeToString(InpDu, TIME_DATE));
   if(chargerM1 && totalM1 == 0)
      PrintFormat("%s : aucune bougie M1 — le spread écrit sera celui de la H1, la valeur "
                  "agrégée, deux fois trop haute en séance et deux fois trop basse au "
                  "rollover. Augmentez InpAttenteSec plutôt que d'exporter ainsi.", sym);

   PrintFormat("%s : %d bougies écrites dans MQL5/Files/%s — de %s à %s",
               sym, totalN, nom,
               TimeToString(premierT, TIME_DATE),
               TimeToString(dernierT, TIME_DATE));
   // L'ordre des extrêmes est la donnée qui ferme l'indécision du backtest : si la M1
   // manque sur une partie de l'historique, le moteur y retombera sur une convention
   // de lecture, et il faut le savoir AVANT de mesurer.
   PrintFormat("%s : ordre des extrêmes — %d bougies sans M1 (%.1f %%), %d où le haut et "
               "le bas tombent dans la même minute (%.1f %%).",
               sym, sansOrdre, 100.0 * sansOrdre / totalN, memeMinute, 100.0 * memeMinute / totalN);
   // Ce que valent les colonnes `haut_apres` / `bas_apres`, mesuré et non supposé : la
   // part de l'amplitude horaire que le prix REND après son second extrême. À 0 il ne
   // revient jamais et le doute du backtest était sans objet ; à 1 il revient toujours,
   // et la lecture optimiste se trompait partout.
   if(renduN > 0)
      PrintFormat("%s : retour après le second extrême — moyenne %.1f %% de l'amplitude horaire, "
                  "et %d heures sur %d (%.1f %%) rendent plus de la moitié",
                  sym, 100.0 * renduTotal / renduN, renduFort, renduN, 100.0 * renduFort / renduN);
   PrintFormat("%s : %d bougies (%.1f %%) dont les extrêmes H1 n'existent PAS dans la M1 — "
               "le testeur ne les voit pas, Sivula ne les lira pas non plus.",
               sym, ecartH1M1, 100.0 * ecartH1M1 / totalN);
   PrintFormat("%s : plus ancienne barre — H1 %s | M1 %s", sym,
               TimeToString((datetime)SeriesInfoInteger(sym, PERIOD_H1, SERIES_FIRSTDATE), TIME_DATE),
               TimeToString((datetime)SeriesInfoInteger(sym, PERIOD_M1, SERIES_FIRSTDATE), TIME_DATE));
   Profondeur(sym, StringFormat("H1 depuis %s (%d bougies) · M1 %s",
      TimeToString(premierT, TIME_DATE), totalN,
      !chargerM1 ? "non demandée"
        : (totalM1 > 0 ? StringFormat("depuis %s (%I64d bougies)", TimeToString(premierM1, TIME_DATE), totalM1)
                       : "absente")));

   // Une M1 manquante n'est pas neutre : la bougie retombe sur le spread agrégé de la
   // H1, et Sivula n'entrera pas au même moment que le robot sur cette bougie-là.
   if(chargerM1 && sansM1 > 0)
      PrintFormat("%s : ATTENTION %d bougies sur %d sans M1 correspondante (%.1f %%) — "
                  "spread de la H1 pour celles-ci.", sym, sansM1, totalN, 100.0 * sansM1 / totalN);
   // Un spread à zéro n'est pas un spread nul : c'est un historique importé par le
   // courtier sans cette information. Sivula le détecte et retombe sur le relevé, mais
   // autant le savoir tout de suite plutôt que de croire la série complète.
   if(sansSpread > 0)
      PrintFormat("%s : ATTENTION %d bougies sur %d sans spread (%.1f %%) — Sivula "
                  "utilisera le spread du relevé sur cette partie.",
                  sym, sansSpread, totalN, 100.0 * sansSpread / totalN);
   PrintFormat("%s : %d bougies sur %d hors séance de négociation (%.1f %%) — Sivula "
               "n'y entrera pas.", sym, horsSeance, totalN, 100.0 * horsSeance / totalN);
   return true;
}

//+------------------------------------------------------------------+
//| Export M1 — le départage, pas la mesure.                          |
//|                                                                   |
//| Sivula range ces fichiers dans un espace à part : ils ne servent  |
//| qu'à savoir, quand Sivula et le robot divergent, ce que le prix a |
//| réellement fait DANS l'heure. Ils n'entrent jamais dans le moteur |
//| de scan ni de backtest, qui exige du H1 confirmé. Pas de plafond  |
//| InpMaxBarres ici : tronquer un départage le rendrait muet sur la  |
//| période justement disputée. Mêmes règles que le H1 : tranches     |
//| d'un an, fichier ouvert au premier lot, mémoire rendue.           |
//+------------------------------------------------------------------+
bool ExporterM1(string sym, string nom, datetime dispoM1)
{
   datetime debut = InpDu;
   if(dispoM1 > debut)
   {
      debut = dispoM1;
      PrintFormat("%s : demande recadrée sur %s — le courtier n'a rien avant.",
                  sym, TimeToString(debut, TIME_DATE));
   }
   int dec = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   int f = INVALID_HANDLE;
   MqlRates m1[];
   ArraySetAsSeries(m1, false);
   long totalN = 0;
   datetime premierT = 0, dernierT = 0;

   for(datetime t0 = debut; t0 < TimeCurrent() && !IsStopped(); t0 += TRANCHE_SECONDES)
   {
      datetime t1 = t0 + TRANCHE_SECONDES;
      datetime maintenant = TimeCurrent();
      if(t1 > maintenant) t1 = maintenant;

      int n = CopyRates(sym, PERIOD_M1, t0, t1 - 1, m1);
      if(n <= 0) { ArrayFree(m1); continue; }

      if(f == INVALID_HANDLE)
      {
         f = FileOpen(nom, FILE_WRITE | FILE_TXT | FILE_ANSI);
         if(f == INVALID_HANDLE)
         {
            PrintFormat("%s : écriture impossible (%d)", sym, GetLastError());
            Rate(sym, StringFormat("écriture du fichier impossible (erreur %d)", GetLastError()));
            ArrayFree(m1);
            return false;
         }
         FileWriteString(f, "date,open,high,low,close,volume,spread\r\n");
      }
      for(int i = 0; i < n; i++)
         FileWriteString(f, StringFormat("%s,%s,%s,%s,%s,%I64d,%d\r\n",
            TimeToString(m1[i].time, TIME_DATE | TIME_MINUTES),
            DoubleToString(m1[i].open,  dec),
            DoubleToString(m1[i].high,  dec),
            DoubleToString(m1[i].low,   dec),
            DoubleToString(m1[i].close, dec),
            m1[i].tick_volume,
            m1[i].spread));
      if(premierT == 0) premierT = m1[0].time;
      dernierT = m1[n - 1].time;
      totalN += n;
      ArrayFree(m1);
      Sleep(50);
   }

   if(f == INVALID_HANDLE || totalN == 0)
   {
      if(f != INVALID_HANDLE) { FileClose(f); FileDelete(nom); }
      PrintFormat("%s : aucune bougie M1 depuis %s. Si « historique incomplet » est "
                  "apparu, augmentez InpAttenteSec.", sym, TimeToString(debut, TIME_DATE));
      Rate(sym, "historique M1 vide depuis " + TimeToString(debut, TIME_DATE));
      return false;
   }
   FileClose(f);
   PrintFormat("%s : %I64d bougies M1 écrites dans MQL5/Files/%s — de %s à %s",
               sym, totalN, nom,
               TimeToString(premierT, TIME_DATE),
               TimeToString(dernierT, TIME_DATE));
   Profondeur(sym, StringFormat("M1 depuis %s (%I64d bougies)",
      TimeToString(premierT, TIME_DATE), totalN));
   return true;
}

//+------------------------------------------------------------------+
//| La reprise : un export interrompu ne recommence pas tout.         |
//|                                                                   |
//| Si le CSV du symbole existe, n'est pas vide, et va jusqu'à moins  |
//| de quatre jours d'aujourd'hui (le week-end compris), il couvre la |
//| période demandée : on passe au suivant en le disant. Un fichier   |
//| de 0 Ko ou périmé est ré-exporté. Pour un gros fichier, on lit sa |
//| fin plutôt que ses 1,7 million de lignes.                         |
//+------------------------------------------------------------------+
bool DejaCouvert(string nom, string sym)
{
   if(!FileIsExist(nom)) return false;
   int f = FileOpen(nom, FILE_READ | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE) return false;
   ulong taille = FileSize(f);
   bool grand = taille > 8192;
   // près de la fin : la première lecture peut tomber au milieu d'une ligne, les
   // suivantes sont entières, et on ne garde que la dernière ligne pleine
   if(grand) FileSeek(f, -2048, SEEK_END);
   string derniere = "";
   int lignes = 0;
   while(!FileIsEnding(f))
   {
      string l = FileReadString(f);
      if(StringLen(l) > 10) { lignes++; derniere = l; }
   }
   FileClose(f);
   if(!grand && lignes < 2) return false;        // vide, ou l'en-tête seule
   string parts[];
   if(StringSplit(derniere, ',', parts) < 5) return false;
   datetime finFic = StringToTime(parts[0]);
   if(finFic <= 0) return false;
   // « à jour » se juge contre la FIN réelle de l'historique, pas contre l'horloge :
   // un export de mardi relancé jeudi doit être refait, mais le lundi matin la
   // dernière bougie du vendredi soir reste la fin du monde connu. Série pas encore
   // synchronisée (date inconnue) : on retombe sur quatre jours d'horloge.
   datetime finSerie = (datetime)SeriesInfoInteger(sym, PERIOD_H1, SERIES_LASTBAR_DATE);
   datetime butoir = finSerie > 0 ? finSerie - 7200 : TimeCurrent() - 4 * 86400;
   if(finFic < butoir) return false;
   PrintFormat("%s : %s existe déjà et va jusqu'au %s — conservé, symbole suivant. "
               "Supprimez le fichier pour le ré-exporter.",
               sym, nom, TimeToString(finFic, TIME_DATE));
   Profondeur(sym, StringFormat("déjà exporté — %s jusqu'au %s",
      nom, TimeToString(finFic, TIME_DATE)));
   return true;
}

//+------------------------------------------------------------------+
//| La liste, lue dans un fichier plutôt que saisie.                  |
//+------------------------------------------------------------------+
int LireListeFichier(string chemin, string &out[])
{
   if(StringLen(chemin) == 0 || !FileIsExist(chemin)) return 0;
   int f = FileOpen(chemin, FILE_READ | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE)
   {
      PrintFormat("%s existe mais n'a pas pu être ouvert (%d).", chemin, GetLastError());
      return 0;
   }
   int n = 0;
   while(!FileIsEnding(f))
   {
      string l = FileReadString(f);
      StringTrimLeft(l); StringTrimRight(l);
      if(StringLen(l) == 0) continue;
      if(StringGetCharacter(l, 0) == '#') continue;   // en-tête écrit par Sivula
      ArrayResize(out, n + 1);
      out[n++] = l;
   }
   FileClose(f);
   return n;
}

// ————— LE COMPTE RENDU —————
// Un Print par symbole se perd dans un journal de plusieurs milliers de lignes :
// l'utilisateur ne sait pas que trois instruments sur quarante ne sont pas sortis. Les
// échecs sont donc COLLECTÉS, avec leur raison, et récapitulés à la fin.
string g_ratesNom[];
string g_ratesPourquoi[];
// Les profondeurs obtenues, collectées par symbole : c'est ce qui dit, sans relire le
// journal, sur quelle partie de l'historique le départage intrabar est possible.
string g_profNom[];
string g_profTxt[];

void Profondeur(string sym, string txt)
{
   int k = ArraySize(g_profNom);
   ArrayResize(g_profNom, k + 1);
   ArrayResize(g_profTxt, k + 1);
   g_profNom[k] = sym;
   g_profTxt[k] = txt;
}

void Rate(string sym, string pourquoi)
{
   int k = ArraySize(g_ratesNom);
   ArrayResize(g_ratesNom, k + 1);
   ArrayResize(g_ratesPourquoi, k + 1);
   g_ratesNom[k] = sym;
   g_ratesPourquoi[k] = pourquoi;
}

void OnStart()
{
   // Le plafond « Barres max dans le graphique » borne aussi l'HISTORIQUE que le
   // terminal conserve, pas seulement l'affichage. À 50 000, CopyTime rend 50 009
   // barres quoi qu'on demande et la plus ancienne date ne recule jamais — la boucle
   // tourne alors indéfiniment sans que rien n'indique pourquoi. Observé sur le VPS.
   long maxBarres = TerminalInfoInteger(TERMINAL_MAXBARS);
   // en barres M1 seulement si la M1 est demandée : sans elle, la H1 suffit et le
   // plafond du terminal n'a plus besoin d'être soixante fois plus large
   bool m1Voulue = InpChargerM1 || InpM1;
   long besoin = (TimeCurrent() - InpDu) / (m1Voulue ? 60 : 3600);
   if(maxBarres < besoin)
   {
      PrintFormat("ARRÊT : « Barres max dans le graphique » vaut %I64d, il en faut environ "
                  "%I64d pour couvrir la %s depuis %s.", maxBarres, besoin,
                  m1Voulue ? "M1" : "H1", TimeToString(InpDu, TIME_DATE));
      Print("Outils > Options > Graphiques > « Barres max dans le graphique » = Illimité, "
            "PUIS REDÉMARREZ le terminal : le réglage ne s'applique à l'historique déjà "
            "chargé qu'au démarrage. Relancez ce script ensuite.");
      return;
   }

   string syms[];
   int nFic = LireListeFichier(InpFichierListe, syms);
   if(nFic > 0)
      PrintFormat("Liste lue dans %s : %d symbole(s). InpSymboles est ignoré.",
                  InpFichierListe, nFic);
   string liste = InpSymboles;
   StringTrimLeft(liste);
   StringTrimRight(liste);
   if(nFic > 0)
   {
      // rien à faire : la liste du fichier l'emporte
   }
   else if(StringLen(liste) == 0)
   {
      ArrayResize(syms, 1);
      syms[0] = _Symbol;
   }
   else if(liste == "*")
   {
      // Toute l'Observation du marché, dans son ordre. On ne prend PAS le catalogue
      // complet du courtier : il compte des milliers de lignes dont l'immense majorité
      // n'intéresse personne, et chacune coûte un téléchargement M1 de plusieurs années.
      // Ce que l'utilisateur a mis dans son Observation du marché est justement la liste
      // qu'il a choisie.
      int n = SymbolsTotal(true);
      if(n <= 0) { Print("Observation du marché vide : ajoutez-y vos instruments."); return; }
      ArrayResize(syms, n);
      for(int i = 0; i < n; i++) syms[i] = SymbolName(i, true);
      PrintFormat("Observation du marché : %d symboles à exporter. Comptez plusieurs "
                  "minutes par symbole — la M1 de sept ans doit être téléchargée pour "
                  "chacun. Laissez le terminal ouvert et connecté.", n);
   }
   else
   {
      // virgules, points-virgules ou espaces : on accepte les trois, c'est une saisie
      StringReplace(liste, ";", ",");
      StringReplace(liste, " ", ",");
      int k = StringSplit(liste, ',', syms);
      if(k <= 0) { Print("Liste de symboles vide après nettoyage."); return; }
   }

   int faits = 0, demandes = 0;
   for(int i = 0; i < ArraySize(syms); i++)
   {
      string s = syms[i];
      StringTrimLeft(s); StringTrimRight(s);
      if(StringLen(s) == 0) continue;
      demandes++;
      if(IsStopped()) { Print("Interrompu."); break; }
      PrintFormat("──── %s (%d/%d) ────", s, i + 1, ArraySize(syms));
      if(Exporter(s)) faits++;
      // les échecs sans motif enregistré viennent d'un chemin non instrumenté :
      // les compter quand même, plutôt que de les perdre
      else if(ArraySize(g_ratesNom) == 0
              || g_ratesNom[ArraySize(g_ratesNom) - 1] != s) Rate(s, "échec non détaillé");
   }
   int rates = ArraySize(g_ratesNom);
   PrintFormat("════ TERMINÉ : %d demandé(s), %d exporté(s), %d échec(s). "
               "Dossier : MQL5\\Files. ════", demandes, faits, rates);
   if(ArraySize(g_profNom) > 0)
      Print("Profondeur obtenue par symbole — le départage intrabar n'est possible que "
            "là où la M1 existe :");
   for(int i = 0; i < ArraySize(g_profNom); i++)
      PrintFormat("   • %s — %s", g_profNom[i], g_profTxt[i]);
   for(int i = 0; i < rates; i++)
      PrintFormat("   ✗ %s — %s", g_ratesNom[i], g_ratesPourquoi[i]);
   if(rates > 0)
      Print("Ces instruments n'ont PAS de fichier : Sivula ne pourra pas les scanner. "
            "Ajoutez-les à l'Observation du marché, ou retirez-les de symboles.txt.");
}
