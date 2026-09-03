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

input datetime InpDu       = D'2020.01.01';  // Depuis
input int      InpMaxBarres = 200000;         // Bougies maximum

void OnStart()
{
   // Forcer le chargement : sur un terminal frais, l'historique n'est pas encore là et
   // CopyRates ne renvoie qu'une poignée de bougies récentes.
   datetime tt[];
   for(int essai = 0; essai < 40; essai++)
   {
      if(CopyTime(_Symbol, PERIOD_H1, InpDu, 1, tt) > 0) break;
      Sleep(500);
   }

   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, PERIOD_H1, InpDu, TimeCurrent(), r);
   if(n <= 0)
   {
      Print("Aucune bougie H1 disponible depuis ", TimeToString(InpDu),
            ". Ouvrez le graphique en H1 et faites-le défiler vers la gauche, puis relancez.");
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
      Print("Aucune bougie M1 : le spread écrit sera celui de la H1, plus grossier. "
            "Ouvrez le graphique en M1, faites-le défiler vers la gauche, puis relancez.");

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

   PrintFormat("%s : %d bougies écrites dans MQL5/Files/%s", _Symbol, n, nom);
   // Un spread à zéro n'est pas un spread nul : c'est un historique importé par le
   // courtier sans cette information. Sivula le détecte et retombe sur le relevé, mais
   // autant le savoir tout de suite plutôt que de croire la série complète.
   if(sansSpread > 0)
      PrintFormat("Attention : %d bougies sur %d n'ont pas de spread (%.0f %%). "
                  "Sivula utilisera le spread du relevé sur cette partie.",
                  sansSpread, n, 100.0 * sansSpread / n);
}
