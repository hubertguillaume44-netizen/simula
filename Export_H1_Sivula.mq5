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
//|  graphique, ou listez-en autant que vous voulez, séparés par des  |
//|  virgules — ils seront traités à la suite, sans autre manipulation.|
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

// Vide = le symbole du graphique. Sinon une liste : "AUDCAD,GOLD,NZDCAD".
// Les symboles absents de l'Observation du marché y sont ajoutés automatiquement.
input string   InpSymboles  = "";             // Symboles (vide = celui du graphique)
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
bool Traitable(string sym, datetime t)
{
   MqlDateTime d; TimeToStruct(t, d);
   ENUM_DAY_OF_WEEK jour = (ENUM_DAY_OF_WEEK)d.day_of_week;
   int minute = d.hour * 60 + d.min;
   datetime de, a;
   bool aucuneSeance = true;
   for(int k = 0; k < 8; k++)
   {
      if(!SymbolInfoSessionTrade(sym, jour, k, de, a)) break;
      aucuneSeance = false;
      MqlDateTime dd, aa; TimeToStruct(de, dd); TimeToStruct(a, aa);
      int m1 = dd.hour * 60 + dd.min, m2 = aa.hour * 60 + aa.min;
      // une séance qui franchit minuit est rendue avec une fin inférieure au début
      if(m2 <= m1) { if(minute >= m1 || minute < m2) return true; }
      else if(minute >= m1 && minute < m2) return true;
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
   FileWriteString(f, "date,open,high,low,close,volume,spread,session,min_haut,min_bas,m1_haut,m1_bas\r\n");

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
   for(int i = 0; i < n; i++)
   {
      // les deux séries sont croissantes : une seule passe suffit
      while(iM1 < nM1 && m1[iM1].time < r[i].time) iM1++;
      int sp = r[i].spread;
      if(iM1 < nM1 && m1[iM1].time == r[i].time) sp = m1[iM1].spread;
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

      int seance = Traitable(sym, r[i].time) ? 1 : 0;
      if(seance == 0) horsSeance++;
      if(sp <= 0) sansSpread++;
      FileWriteString(f, StringFormat("%s,%s,%s,%s,%s,%I64d,%d,%d,%d,%d,%s,%s\r\n",
         TimeToString(r[i].time, TIME_DATE | TIME_MINUTES),
         DoubleToString(r[i].open,  dec),
         DoubleToString(r[i].high,  dec),
         DoubleToString(r[i].low,   dec),
         DoubleToString(r[i].close, dec),
         r[i].tick_volume,
         sp, seance, minHaut, minBas,
         DoubleToString(m1Haut, dec), DoubleToString(m1Bas, dec)));
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
