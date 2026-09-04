//+------------------------------------------------------------------+
//|  Export_Symboles_Sivula.mq5                                      |
//|  Écrit le relevé des symboles du courtier dans un CSV lu par      |
//|  Sivula : spread, swaps, et surtout StopsLevel × Point.           |
//|                                                                   |
//|  POURQUOI CE FICHIER COMPTE                                       |
//|  Le courtier impose une distance minimale entre le cours et le    |
//|  stop. Sur BITCOIN elle vaut 200,00. C'est une distance ABSOLUE : |
//|  0,25 % du cours à 81 000, mais 1,00 % à 20 000. Un stop de 1 %   |
//|  était donc pile à la limite pendant tout 2022, et le testeur a   |
//|  refusé 928 ordres « invalid stops » sur 2022-2023 — aucun        |
//|  ensuite. Sans ce relevé, Sivula compte 66 trades que le courtier |
//|  n'aurait jamais acceptés ; avec lui, 352 contre 355 au testeur.  |
//|                                                                   |
//|  Le fichier atterrit dans MQL5/Files. Importez-le dans Sivula par |
//|  le relevé du courtier, comme celui des spreads.                  |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

// Vide = tous les symboles de l'Observation du marché. Sinon une liste séparée par des
// virgules — utile pour ne relever que les instruments réellement mesurés.
input string InpSymboles = "";        // Symboles (vide = Observation du marché)

//+------------------------------------------------------------------+
//| Une ligne par symbole. Les noms de colonnes sont ceux que Sivula  |
//| cherche dans un export BRUT de terminal : « Symbol » et « Point » |
//| déclenchent ce format, « StopsLevel » porte la contrainte. Les    |
//| renommer casse la lecture en silence — le fichier serait lu comme |
//| un relevé retraité, sans minimum de stop.                         |
//+------------------------------------------------------------------+
string LigneSymbole(string sym)
{
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double bid   = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask   = SymbolInfoDouble(sym, SYMBOL_ASK);
   int    dig   = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   // spread en POINTS : la même unité que la colonne du CSV horaire
   long   spr   = SymbolInfoInteger(sym, SYMBOL_SPREAD);
   if(spr <= 0 && point > 0.0 && ask > bid) spr = (long)MathRound((ask - bid) / point);

   return StringFormat("%s;%s;%s;%s;%d;%s;%s;%I64d;%s;%d;%s;%s;%I64d;%I64d;%s",
      sym,
      SymbolInfoString(sym, SYMBOL_DESCRIPTION),
      SymbolInfoString(sym, SYMBOL_PATH),
      DoubleToString(point, 8), dig,
      DoubleToString(bid, dig), DoubleToString(ask, dig),
      spr,
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 2),
      (int)SymbolInfoInteger(sym, SYMBOL_SWAP_MODE),
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_SWAP_LONG), 4),
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_SWAP_SHORT), 4),
      SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL),
      SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL),
      SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT));
}

void OnStart()
{
   string liste = InpSymboles;
   StringTrimLeft(liste); StringTrimRight(liste);
   string syms[];
   int n = 0;
   if(StringLen(liste) == 0)
   {
      n = SymbolsTotal(true);              // true = seulement l'Observation du marché
      ArrayResize(syms, n);
      for(int i = 0; i < n; i++) syms[i] = SymbolName(i, true);
   }
   else
   {
      StringReplace(liste, ";", ",");
      StringReplace(liste, " ", ",");
      n = StringSplit(liste, ',', syms);
   }
   if(n <= 0) { Print("Aucun symbole à relever."); return; }

   string nom = "Symboles_Sivula.csv";
   int f = FileOpen(nom, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE) { Print("Écriture impossible : ", GetLastError()); return; }

   FileWriteString(f, "Symbol;Description;Path;Point;Digits;Bid;Ask;Spread;ContractSize;"
                      "SwapMode;SwapLong;SwapShort;StopsLevel;FreezeLevel;CurrencyProfit\r\n");

   int ecrits = 0, sansStop = 0, inconnus = 0;
   for(int i = 0; i < n; i++)
   {
      string s = syms[i];
      StringTrimLeft(s); StringTrimRight(s);
      if(StringLen(s) == 0) continue;
      if(!SymbolSelect(s, true)) { PrintFormat("%s : inconnu du courtier", s); inconnus++; continue; }
      if(SymbolInfoInteger(s, SYMBOL_TRADE_STOPS_LEVEL) <= 0) sansStop++;
      FileWriteString(f, LigneSymbole(s) + "\r\n");
      ecrits++;
   }
   FileClose(f);

   PrintFormat("%d symbole(s) écrit(s) dans MQL5/Files/%s%s", ecrits, nom,
               inconnus > 0 ? StringFormat(", %d inconnu(s)", inconnus) : "");
   // Un StopsLevel à zéro n'est pas forcément une absence de contrainte : certains
   // courtiers la font varier avec la volatilité et annoncent 0 au repos. Le dire,
   // plutôt que de laisser croire que la faisabilité a été vérifiée.
   if(sansStop > 0)
      PrintFormat("Attention : %d symbole(s) annoncent StopsLevel = 0. Sivula ne pourra "
                  "pas vérifier la distance minimale de stop pour ceux-là.", sansStop);
}
