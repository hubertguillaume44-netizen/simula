//+------------------------------------------------------------------+
//|  Export_H1_Sivula.mq5                                            |
//|  Écrit l'historique H1 du symbole du graphique dans un CSV lu     |
//|  par Sivula, AVEC la colonne de spread.                           |
//|                                                                   |
//|  Le spread est connu bougie par bougie (champ spread de           |
//|  MqlRates). Sans cette colonne, Sivula retombe sur le spread      |
//|  MOYEN du relevé, qui sous-estime l'heure du rollover — celle où  |
//|  les entrées tombent, et où le spread vaut deux à trois fois sa   |
//|  moyenne. C'est l'écart que le comparateur MT5 mesurait.          |
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

   int sansSpread = 0;
   for(int i = 0; i < n; i++)
   {
      if(r[i].spread <= 0) sansSpread++;
      FileWriteString(f, StringFormat("%s,%s,%s,%s,%s,%I64d,%d\r\n",
         TimeToString(r[i].time, TIME_DATE | TIME_MINUTES),
         DoubleToString(r[i].open,  dec),
         DoubleToString(r[i].high,  dec),
         DoubleToString(r[i].low,   dec),
         DoubleToString(r[i].close, dec),
         r[i].tick_volume,
         r[i].spread));
   }
   FileClose(f);

   PrintFormat("%s : %d bougies écrites dans MQL5/Files/%s", _Symbol, n, nom);
   // Un spread à zéro n'est pas un spread nul : c'est un historique importé par le
   // courtier sans cette information. Sivula le détecte et retombe sur le relevé, mais
   // autant le savoir tout de suite plutôt que de croire la série complète.
   if(sansSpread > 0)
      PrintFormat("Attention : %d bougies sur %d n'ont pas de spread (%.0f %%). "
                  "Sivula utilisera le spread du relevé sur cette partie.",
                  sansSpread, n, 100.0 * sansSpread / n);
}
