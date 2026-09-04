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
                        datetime depuis, int secondesMax)
{
   uint fin = GetTickCount() + (uint)secondesMax * 1000;
   datetime premiere = 0;
   int paliers[] = {50000, 200000, 500000, 1000000, 2000000, 4000000, 8000000};
   int p = 0;

   while(GetTickCount() < fin && !IsStopped())
   {
      premiere = (datetime)SeriesInfoInteger(sym, tf, SERIES_FIRSTDATE);
      if(premiere > 0 && premiere <= depuis
         && (bool)SeriesInfoInteger(sym, tf, SERIES_SYNCHRONIZED))
      {
         PrintFormat("%s %s : historique complet depuis %s.", sym, nomTf,
                     TimeToString(premiere, TIME_DATE));
         return true;
      }

      // demande par le nombre, pas par la date : c'est ce qui fait remonter la base
      datetime t[];
      int lu = CopyTime(sym, tf, 0, paliers[p], t);
      PrintFormat("%s %s : %d barres demandées, %d reçues — plus ancienne : %s",
                  sym, nomTf, paliers[p], lu,
                  premiere > 0 ? TimeToString(premiere, TIME_DATE) : "aucune");

      // le palier a porté ses fruits : on garde le même tant qu'il progresse
      if(lu >= paliers[p] && p < ArraySize(paliers) - 1) p++;
      Sleep(3000);
   }
   PrintFormat("%s %s : ARRÊT après %d s. Plus ancienne barre : %s, demandé : %s. "
               "Augmentez InpAttenteSec, ou passez par Affichage > Symboles (Ctrl+U), "
               "onglet Barres, période %s, et cliquez Demander.",
               sym, nomTf, secondesMax,
               premiere > 0 ? TimeToString(premiere, TIME_DATE) : "aucune",
               TimeToString(depuis, TIME_DATE), nomTf);
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
//+------------------------------------------------------------------+
bool Exporter(string sym)
{
   if(!SymbolSelect(sym, true))
   {
      PrintFormat("%s : symbole inconnu du courtier — vérifiez l'orthographe exacte "
                  "dans l'Observation du marché (certains portent un « # »).", sym);
      return false;
   }

   PrintFormat("%s : demande de l'historique depuis %s.", sym, TimeToString(InpDu, TIME_DATE));
   AttendreHistorique(sym, PERIOD_M1, "M1", InpDu, InpAttenteSec);
   AttendreHistorique(sym, PERIOD_H1, "H1", InpDu, InpAttenteSec);

   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(sym, PERIOD_H1, InpDu, TimeCurrent(), r);
   if(n <= 0)
   {
      PrintFormat("%s : aucune bougie H1 depuis %s. Si « historique incomplet » est "
                  "apparu, augmentez InpAttenteSec.", sym, TimeToString(InpDu, TIME_DATE));
      return false;
   }
   if(n > InpMaxBarres) n = InpMaxBarres;

   // Le « # » de certains symboles (#Japan225) n'est pas valide dans un nom de fichier
   // sur tous les systèmes, et Sivula reconnaît l'instrument sans lui.
   string propre = sym;
   StringReplace(propre, "#", "");
   string nom = propre + "_H1.csv";
   int f = FileOpen(nom, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE)
   {
      PrintFormat("%s : écriture impossible (%d)", sym, GetLastError());
      return false;
   }

   int dec = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   FileWriteString(f, "date,open,high,low,close,volume,spread,session,min_haut,min_bas,m1_haut,m1_bas,haut_apres,bas_apres\r\n");

   // Spread d'ouverture, repris sur la M1 : pour chaque bougie H1, la M1 de même
   // horodatage. C'est l'instant exact où le robot place son ordre.
   MqlRates m1[];
   ArraySetAsSeries(m1, false);
   int nM1 = CopyRates(sym, PERIOD_M1, InpDu, TimeCurrent(), m1);
   if(nM1 <= 0)
      PrintFormat("%s : aucune bougie M1 — le spread écrit sera celui de la H1, la valeur "
                  "agrégée, deux fois trop haute en séance et deux fois trop basse au "
                  "rollover. Augmentez InpAttenteSec plutôt que d'exporter ainsi.", sym);

   int sansSpread = 0, sansM1 = 0, iM1 = 0, horsSeance = 0, sansOrdre = 0, memeMinute = 0, ecartH1M1 = 0;
   int renduN = 0, renduFort = 0; double renduTotal = 0.0;
   for(int i = 0; i < n; i++)
   {
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
   }
   FileClose(f);

   PrintFormat("%s : %d bougies écrites dans MQL5/Files/%s — de %s à %s",
               sym, n, nom,
               TimeToString(r[0].time, TIME_DATE),
               TimeToString(r[n - 1].time, TIME_DATE));
   // L'ordre des extrêmes est la donnée qui ferme l'indécision du backtest : si la M1
   // manque sur une partie de l'historique, le moteur y retombera sur une convention
   // de lecture, et il faut le savoir AVANT de mesurer.
   PrintFormat("%s : ordre des extrêmes — %d bougies sans M1 (%.1f %%), %d où le haut et "
               "le bas tombent dans la même minute (%.1f %%).",
               sym, sansOrdre, 100.0 * sansOrdre / n, memeMinute, 100.0 * memeMinute / n);
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
               sym, ecartH1M1, 100.0 * ecartH1M1 / n);
   PrintFormat("%s : plus ancienne barre — H1 %s | M1 %s", sym,
               TimeToString((datetime)SeriesInfoInteger(sym, PERIOD_H1, SERIES_FIRSTDATE), TIME_DATE),
               TimeToString((datetime)SeriesInfoInteger(sym, PERIOD_M1, SERIES_FIRSTDATE), TIME_DATE));

   // Une M1 manquante n'est pas neutre : la bougie retombe sur le spread agrégé de la
   // H1, et Sivula n'entrera pas au même moment que le robot sur cette bougie-là.
   if(sansM1 > 0)
      PrintFormat("%s : ATTENTION %d bougies sur %d sans M1 correspondante (%.1f %%) — "
                  "spread de la H1 pour celles-ci.", sym, sansM1, n, 100.0 * sansM1 / n);
   // Un spread à zéro n'est pas un spread nul : c'est un historique importé par le
   // courtier sans cette information. Sivula le détecte et retombe sur le relevé, mais
   // autant le savoir tout de suite plutôt que de croire la série complète.
   if(sansSpread > 0)
      PrintFormat("%s : ATTENTION %d bougies sur %d sans spread (%.1f %%) — Sivula "
                  "utilisera le spread du relevé sur cette partie.",
                  sym, sansSpread, n, 100.0 * sansSpread / n);
   PrintFormat("%s : %d bougies sur %d hors séance de négociation (%.1f %%) — Sivula "
               "n'y entrera pas.", sym, horsSeance, n, 100.0 * horsSeance / n);
   return true;
}

void OnStart()
{
   // Le plafond « Barres max dans le graphique » borne aussi l'HISTORIQUE que le
   // terminal conserve, pas seulement l'affichage. À 50 000, CopyTime rend 50 009
   // barres quoi qu'on demande et la plus ancienne date ne recule jamais — la boucle
   // tourne alors indéfiniment sans que rien n'indique pourquoi. Observé sur le VPS.
   long maxBarres = TerminalInfoInteger(TERMINAL_MAXBARS);
   long besoin = (TimeCurrent() - InpDu) / 60;   // ordre de grandeur en barres M1
   if(maxBarres < besoin)
   {
      PrintFormat("ARRÊT : « Barres max dans le graphique » vaut %I64d, il en faut environ "
                  "%I64d pour couvrir la M1 depuis %s.", maxBarres, besoin,
                  TimeToString(InpDu, TIME_DATE));
      Print("Outils > Options > Graphiques > « Barres max dans le graphique » = Illimité, "
            "PUIS REDÉMARREZ le terminal : le réglage ne s'applique à l'historique déjà "
            "chargé qu'au démarrage. Relancez ce script ensuite.");
      return;
   }

   string liste = InpSymboles;
   StringTrimLeft(liste);
   StringTrimRight(liste);
   string syms[];
   if(StringLen(liste) == 0)
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

   int faits = 0, rates = 0;
   for(int i = 0; i < ArraySize(syms); i++)
   {
      string s = syms[i];
      StringTrimLeft(s); StringTrimRight(s);
      if(StringLen(s) == 0) continue;
      if(IsStopped()) { Print("Interrompu."); break; }
      PrintFormat("──── %s (%d/%d) ────", s, i + 1, ArraySize(syms));
      if(Exporter(s)) faits++; else rates++;
   }
   PrintFormat("TERMINÉ : %d fichier(s) écrit(s), %d échec(s). Dossier : MQL5/Files.",
               faits, rates);
}
