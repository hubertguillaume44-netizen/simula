//+------------------------------------------------------------------+
//|  Sivula_Releve.mq5                                               |
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
//|  Le fichier atterrit dans MQL5\\Files\\Sivula\\releve.csv. Déposez-le  |
//|  dans Sivula par « Déposer un relevé de symboles ».               |
//|                                                                   |
//|  LA LISTE NE VIT PAS DANS CE FICHIER. Elle vient de symboles.txt, |
//|  que Sivula régénère à chaque changement de sélection. Sans cela  |
//|  il faudrait recompiler dans MetaEditor à chaque fois — pour un   |
//|  geste qu'on fait toutes les semaines, c'est inacceptable. Ce     |
//|  script se compile UNE fois et ne bouge plus.                     |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

// Source PRIORITAIRE : un symbole par ligne, lignes vides et lignes « # » ignorées.
// Si le fichier existe, il l'emporte sur InpSymboles.
input string InpFichierListe = "Sivula\\symboles.txt";  // Liste de symboles (prioritaire)
// Vide = tous les symboles de l'Observation du marché. Sinon une liste séparée par des
// virgules — utile pour ne relever que les instruments réellement mesurés.
input string InpSymboles = "";        // Symboles (vide = Observation du marché)

//+------------------------------------------------------------------+
//| La liste, lue dans un fichier. Un symbole par ligne : c'est le    |
//| format le plus simple à produire côté site et à relire ici, et    |
//| surtout le seul qui n'oblige pas à recompiler quand il change.    |
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

//+------------------------------------------------------------------+
//| Un symbole absent de l'Observation du marché répond ZÉRO à tout.  |
//| Le sélectionner ne suffit pas : le terminal met un instant à      |
//| garnir ses champs, et lire trop tôt donne un relevé plein de zéros|
//| qui se lit comme un instrument gratuit. On attend, et si les      |
//| valeurs restent nulles on le DIT au lieu d'écrire un zéro muet.   |
//+------------------------------------------------------------------+
bool Disponible(string sym)
{
   if(!SymbolSelect(sym, true)) return false;
   for(int i = 0; i < 40; i++)                       // ~2 s au plus
   {
      if(SymbolInfoInteger(sym, SYMBOL_SELECT)
         && SymbolInfoDouble(sym, SYMBOL_POINT) > 0.0
         && (SymbolInfoDouble(sym, SYMBOL_BID) > 0.0 || SymbolInfoDouble(sym, SYMBOL_ASK) > 0.0))
         return true;
      Sleep(50);
   }
   return false;
}

//+------------------------------------------------------------------+
//| Une ligne par symbole. Les noms de colonnes sont ceux que Sivula  |
//| cherche dans un export BRUT de terminal : « Symbol » et « Point » |
//| déclenchent ce format, « StopsLevel » porte la contrainte. Les    |
//| renommer casse la lecture en silence — le fichier serait lu comme |
//| un relevé retraité, sans minimum de stop.                         |
//+------------------------------------------------------------------+
string LigneSymbole(string sym, bool dispo)
{
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double bid   = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask   = SymbolInfoDouble(sym, SYMBOL_ASK);
   int    dig   = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   // spread en POINTS : la même unité que la colonne du CSV horaire
   long   spr   = SymbolInfoInteger(sym, SYMBOL_SPREAD);
   if(spr <= 0 && point > 0.0 && ask > bid) spr = (long)MathRound((ask - bid) / point);

   // Les colonnes ajoutées viennent APRÈS celles que Sivula cherche : son lecteur
   // travaille par NOM d'en-tête, une colonne de plus lui est indifférente, mais une
   // colonne insérée au milieu décalerait un lecteur positionnel.
   return StringFormat("%s;%s;%s;%s;%d;%s;%s;%I64d;%s;%d;%s;%s;%I64d;%I64d;%s"
                       ";%s;%s;%s;%s;%s;%s",
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
      SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT),
      // Le spread relevé est celui de L'INSTANT DU CLIC, pas une moyenne. Pris à 3 h du
      // matin sur un indice il est trois fois trop large, et le coût calculé par Sivula
      // avec. Sans l'heure du relevé, cette erreur est indiagnosticable.
      TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES),
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE), 6),
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), 8),
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 2),
      DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 2),
      dispo ? "ok" : "indisponible");
}

void OnStart()
{
   string syms[];
   int n = LireListeFichier(InpFichierListe, syms);
   if(n > 0)
      PrintFormat("Liste lue dans %s : %d symbole(s).", InpFichierListe, n);
   string liste = InpSymboles;
   StringTrimLeft(liste); StringTrimRight(liste);
   if(n > 0)
   {
      // rien à faire : la liste du fichier l'emporte
   }
   else if(StringLen(liste) == 0)
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

   // Même dossier que la liste et que les bougies : l'utilisateur n'a qu'un chemin à
   // connaître, celui que MT5 ouvre par Fichier > Ouvrir le dossier de données.
   string nom = "Sivula\\releve.csv";
   int f = FileOpen(nom, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE) { Print("Écriture impossible : ", GetLastError()); return; }

   FileWriteString(f, "Symbol;Description;Path;Point;Digits;Bid;Ask;Spread;ContractSize;"
                      "SwapMode;SwapLong;SwapShort;StopsLevel;FreezeLevel;CurrencyProfit;"
                      "heure_releve;TickValue;TickSize;VolumeMin;VolumeStep;Statut\r\n");

   int ecrits = 0, sansStop = 0, indispos = 0;
   string manques = "";
   for(int i = 0; i < n; i++)
   {
      string s = syms[i];
      StringTrimLeft(s); StringTrimRight(s);
      if(StringLen(s) == 0) continue;
      bool dispo = Disponible(s);
      if(!dispo)
      {
         indispos++;
         manques += (StringLen(manques) ? ", " : "") + s;
      }
      else if(SymbolInfoInteger(s, SYMBOL_TRADE_STOPS_LEVEL) <= 0) sansStop++;
      // La ligne est écrite MÊME indisponible : une absence signalée vaut mieux qu'une
      // ligne manquante, que rien ne distingue d'un oubli de sélection.
      FileWriteString(f, LigneSymbole(s, dispo) + "\r\n");
      ecrits++;
   }
   FileClose(f);

   // ————— LE COMPTE RENDU —————
   // Un Print par symbole se perd dans le journal : l'utilisateur ne sait pas que trois
   // instruments sur quarante sont absents. Le bilan tient en deux lignes, à la fin.
   PrintFormat("TERMINÉ : %d demandé(s), %d ligne(s) écrite(s) dans MQL5\\Files\\%s, "
               "%d indisponible(s).", n, ecrits, nom, indispos);
   if(indispos > 0)
      PrintFormat("Indisponibles (marqués « indisponible », chiffres non fiables) : %s. "
                  "Ajoutez-les à l'Observation du marché — clic droit > Symboles — puis "
                  "relancez ce script.", manques);
   // Un StopsLevel à zéro n'est pas forcément une absence de contrainte : certains
   // courtiers la font varier avec la volatilité et annoncent 0 au repos. Le dire,
   // plutôt que de laisser croire que la faisabilité a été vérifiée.
   if(sansStop > 0)
      PrintFormat("Attention : %d symbole(s) annoncent StopsLevel = 0. Sivula ne pourra "
                  "pas vérifier la distance minimale de stop pour ceux-là.", sansStop);
}
