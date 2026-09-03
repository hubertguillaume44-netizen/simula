//+------------------------------------------------------------------+
//|  Export_H1_Sivula.mq5                                            |
//|  Écrit l'historique H1 du symbole du graphique dans un CSV lu     |
//|  par Sivula, AVEC la colonne de spread.                           |
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
//|  réglage ne pouvait faire coïncider Sivula et le testeur.         |
//|                                                                   |
//|  Utilisation : glisser sur le graphique, une fois par symbole.    |
//|  Le fichier atterrit dans MQL5/Files du terminal.                 |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

// UN AN AVANT le début de la mesure, pas le début lui-même. Le moteur a besoin de
// 400 jours d'amorce (AMORCE_JOURS) pour ses agrégats, et la médiane du spread porte
// sur les 6000 dernières bougies H1 — environ 250 séances. Exporter à partir de la
// date de test donne un moteur sans amorce : plafond de spread inactif au début, et
// lignes de référence fausses tant que le tampon n'est pas rempli.
input datetime InpDu       = D'2019.01.01';  // Depuis (≈ 1 an AVANT le début du test)
input int      InpMaxBarres = 200000;         // Bougies maximum
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
bool AttendreHistorique(ENUM_TIMEFRAMES tf, string nomTf, datetime depuis, int secondesMax)
{
   uint fin = GetTickCount() + (uint)secondesMax * 1000;
   datetime premiere = 0;
   int paliers[] = {50000, 200000, 500000, 1000000, 2000000, 4000000, 8000000};
   int p = 0;

   while(GetTickCount() < fin && !IsStopped())
   {
      premiere = (datetime)SeriesInfoInteger(_Symbol, tf, SERIES_FIRSTDATE);
      if(premiere > 0 && premiere <= depuis
         && (bool)SeriesInfoInteger(_Symbol, tf, SERIES_SYNCHRONIZED))
      {
         PrintFormat("%s : historique complet depuis %s.", nomTf, TimeToString(premiere, TIME_DATE));
         return true;
      }

      // demande par le nombre, pas par la date : c'est ce qui fait remonter la base
      datetime t[];
      int lu = CopyTime(_Symbol, tf, 0, paliers[p], t);
      PrintFormat("%s : %d barres demandées, %d reçues — plus ancienne : %s",
                  nomTf, paliers[p], lu,
                  premiere > 0 ? TimeToString(premiere, TIME_DATE) : "aucune");

      // le palier a porté ses fruits : on garde le même tant qu'il progresse
      if(lu >= paliers[p] && p < ArraySize(paliers) - 1) p++;
      Sleep(3000);
   }
   PrintFormat("%s : ARRÊT après %d s. Plus ancienne barre : %s, demandé : %s. "
               "Augmentez InpAttenteSec, ou passez par Affichage > Symboles (Ctrl+U), "
               "onglet Barres, période %s, et cliquez Demander.",
               nomTf, secondesMax,
               premiere > 0 ? TimeToString(premiere, TIME_DATE) : "aucune",
               TimeToString(depuis, TIME_DATE), nomTf);
   return false;
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

   // L'ordre compte : la M1 est la plus longue à venir, on la lance en premier.
   PrintFormat("%s : demande de l'historique depuis %s. Laissez le script travailler.",
               _Symbol, TimeToString(InpDu, TIME_DATE));
   AttendreHistorique(PERIOD_M1, "M1", InpDu, InpAttenteSec);
   AttendreHistorique(PERIOD_H1, "H1", InpDu, InpAttenteSec);

   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, PERIOD_H1, InpDu, TimeCurrent(), r);
   if(n <= 0)
   {
      Print("Aucune bougie H1 depuis ", TimeToString(InpDu),
            ". Vérifiez que le symbole est dans l'Observation du marché, puis relancez ; "
            "si le message « historique incomplet » est apparu, augmentez InpAttenteSec.");
      return;
   }
   if(n > InpMaxBarres) n = InpMaxBarres;

   string nom = _Symbol + "_H1.csv";
   int f = FileOpen(nom, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE) { Print("Écriture impossible : ", GetLastError()); return; }

   int dec = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   FileWriteString(f, "date,open,high,low,close,volume,spread\r\n");

   // Spread d'ouverture, repris sur la M1 : pour chaque bougie H1, la M1 de même
   // horodatage. C'est l'instant exact où le robot place son ordre.
   MqlRates m1[];
   ArraySetAsSeries(m1, false);
   int nM1 = CopyRates(_Symbol, PERIOD_M1, InpDu, TimeCurrent(), m1);
   if(nM1 <= 0)
      Print("Aucune bougie M1 : le spread écrit sera celui de la H1 — la valeur agrégée, "
            "deux fois trop haute en séance et deux fois trop basse au rollover. "
            "Augmentez InpAttenteSec et relancez plutôt que d'exporter ainsi.");

   int sansSpread = 0, sansM1 = 0, iM1 = 0;
   for(int i = 0; i < n; i++)
   {
      // les deux séries sont croissantes : une seule passe suffit
      while(iM1 < nM1 && m1[iM1].time < r[i].time) iM1++;
      int sp = r[i].spread;
      if(iM1 < nM1 && m1[iM1].time == r[i].time) sp = m1[iM1].spread;
      else sansM1++;

      if(sp <= 0) sansSpread++;
      FileWriteString(f, StringFormat("%s,%s,%s,%s,%s,%I64d,%d\r\n",
         TimeToString(r[i].time, TIME_DATE | TIME_MINUTES),
         DoubleToString(r[i].open,  dec),
         DoubleToString(r[i].high,  dec),
         DoubleToString(r[i].low,   dec),
         DoubleToString(r[i].close, dec),
         r[i].tick_volume,
         sp));
   }
   FileClose(f);

   // Une M1 manquante n'est pas neutre : la bougie retombe sur le spread agrégé de la
   // H1, et Sivula n'entrera pas au même moment que le robot sur cette bougie-là.
   if(sansM1 > 0)
      PrintFormat("Attention : %d bougies sur %d sans M1 correspondante (%.0f %%) — "
                  "spread de la H1 utilisé pour celles-ci. Faites défiler le graphique "
                  "M1 vers la gauche pour charger tout l'historique, puis relancez.",
                  sansM1, n, 100.0 * sansM1 / n);

   PrintFormat("%s : %d bougies écrites dans MQL5/Files/%s — de %s à %s",
               _Symbol, n, nom,
               TimeToString(r[0].time, TIME_DATE),
               TimeToString(r[n - 1].time, TIME_DATE));
   PrintFormat("Plus ancienne barre disponible — H1 : %s | M1 : %s",
               TimeToString((datetime)SeriesInfoInteger(_Symbol, PERIOD_H1, SERIES_FIRSTDATE), TIME_DATE),
               TimeToString((datetime)SeriesInfoInteger(_Symbol, PERIOD_M1, SERIES_FIRSTDATE), TIME_DATE));
   // Un spread à zéro n'est pas un spread nul : c'est un historique importé par le
   // courtier sans cette information. Sivula le détecte et retombe sur le relevé, mais
   // autant le savoir tout de suite plutôt que de croire la série complète.
   if(sansSpread > 0)
      PrintFormat("Attention : %d bougies sur %d n'ont pas de spread (%.0f %%). "
                  "Sivula utilisera le spread du relevé sur cette partie.",
                  sansSpread, n, 100.0 * sansSpread / n);
}
