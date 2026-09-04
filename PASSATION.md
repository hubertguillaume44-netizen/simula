# Passation à Claude Code — moteur Sivula

## Ce que c'est

Sivula est un moteur de backtest pour traders particuliers, écrit en JavaScript et tournant
dans le navigateur, sans serveur. Il est la transposition fidèle d'un moteur Python
d'origine (`Tradingmoteur` : `moteur.py` + `blocs.py`). Il balaie des dizaines de milliers
de configurations sur les séries H1 déposées par l'utilisateur, en retient quelques
dizaines, et exporte chaque configuration retenue en robot MetaTrader 5 (`.mq5`).

Le dépôt de référence est **`hubertguillaume44-netizen/simula`, branche `main`** —
TypeScript / React 19 / TanStack Start / Tailwind v4. Il fait foi. Les fichiers de cette
passation sont l'implémentation JavaScript qui a servi à la mise au point du moteur ; ils
ne sont pas à copier tels quels, mais leur **logique de calcul est la spécification**.

## Ce qui bloque, et pourquoi cette passation existe

La mise au point s'est faite en aller-retour manuel : l'assistant lit le code et raisonne,
l'utilisateur lance un backtest dans Sivula puis un test dans le testeur MT5, fait une
capture d'écran, et l'assistant en déduit une cause. Ce cycle est lent et il a produit
plusieurs diagnostics faux affirmés avec assurance.

**Ce qui manque est l'exécution.** Le travail utile ici est celui qu'on mesure :

- lancer le moteur sur un CSV et comparer sa liste de trades à celle d'un rapport MT5 ;
- figer les cinq invariants dans des tests, pour qu'une correction n'en casse pas une autre ;
- boucler sur un bug sans demander une capture d'écran à chaque étape.

C'est le premier travail à faire. Tout le reste en dépend.

## Les cinq invariants du moteur

Ils viennent du moteur Python d'origine et **ne doivent jamais être contournés**. Toute
régression sur l'un d'eux invalide silencieusement tous les résultats.

1. **Données de base H1 uniquement.** H4 et D1 sont obtenus par agrégation, jamais lus
   directement depuis une autre série.
2. **Bougie confirmée uniquement.** Tout indicateur est décalé d'une bougie (`.shift(1)`
   en Python). Aucune décision ne lit la bougie en cours.
3. **Multi-unités de temps sur clôtures supérieures.** Un filtre D1 lit la dernière bougie
   D1 **clôturée**, alignée sur l'index H1. Jamais la bougie D1 en formation.
4. **Un bloc rend un booléen.** Chaque filtre répond vrai ou faux ; le moteur combine. Pas
   de score, pas de pondération.
5. **Signal sur clôture de N → entrée à l'ouverture de N+1.** L'entrée n'est jamais au prix
   de clôture du signal.

Un audit ligne par ligne du 02/09/2026 a vérifié qu'**aucune fuite d'information future**
n'existe : EMA, SMA, médiane, RSI, ATR, ADX suivent la formule de Wilder avec les bonnes
amorces ; le nuage Ichimoku compare bien la clôture au Kumo calculé 26 périodes plus tôt ;
pivot, pente, MM200, RSI et ADX lisent tous la dernière valeur connue.

**Une divergence de convention à connaître, non corrigée :** le filtre du pivot s'évalue
sur la clôture H1 de décision, alors que tous les autres s'évaluent sur la clôture de leur
propre unité de temps. Les deux évitent la fuite, mais ne répondent pas exactement à la
même question. C'était un choix du moteur d'origine. À trancher.

## Le point dur : accorder Sivula et MT5

C'est le sujet central, et il est mal compris. À clarifier avant tout développement.

**Le fait brut : les chiffres de Sivula ne correspondent pas à ceux de MT5.** Deux exemples
mesurés le 02/09/2026, avec la même configuration des deux côtés :

| Instrument | Sivula annonce | MT5 mesure |
|---|---|---|
| AUDCAD, médiane 15, stop 0,5 %, R/R 2 | +14,2 R | **−2 863 €**, PF 0,45, 15,5 % de creux |
| GOLD, MME 5, stop 0,6 %, R/R 3 | tête du classement | +4 519 €, PF 1,14 — **moitié moins** que MM 7 / 0,5 % / R/R 1,5, classée derrière |

Le premier cas est un renversement de signe : Sivula donne gagnant ce que MT5 donne
nettement perdant. Le second est une **inversion de classement** : la configuration que
Sivula met en tête vaut deux fois moins que celle qu'elle classe en dessous. Le second est
le plus grave — il rend le tri inutilisable, qui est la seule fonction du logiciel.

Les causes identifiées à ce jour sont les bugs 1, 2 et 5 ci-dessous (spread placé au mauvais
endroit, portage à la vente compté comme un crédit, paliers du panneau exportés au lieu de
ceux de la variante mesurée), plus le critère de classement (point b des questions
ouvertes). **Aucune n'a été vérifiée par la mesure après correction** — c'est la première
chose à faire.

**Une égalité exacte est impossible.** Les séries déposées contiennent quatre prix par
heure ; MT5 modélise la minute. Quand une bougie contient à la fois de quoi toucher le stop
et de quoi armer un palier, MT5 sait dans quel ordre, Sivula ne peut pas le savoir. Exiger
l'égalité, c'est exiger une information absente du fichier.

**Ce qui est atteignable, et ce qu'il faut viser :**

- le **classement** de Sivula doit être celui de MT5 ;
- son chiffre doit être un **plancher** — jamais une promesse au-dessus du réel.

**Ce qui a été vérifié le 02/09/2026 :** le portage MQL5 est fidèle. Sur AUDCAD, mêmes
bougies, mêmes jours d'entrée, mêmes heures (00:00 / 02:00 selon l'heure d'été du serveur),
et un écart de prix d'entrée **toujours du même côté** — MT5 achète à l'ask, les séries
exportées sont en bid. C'est le spread, pas une autre donnée.

**La cascade, à comprendre avant de chercher un bug :** les deux moteurs n'autorisent
qu'une position à la fois. Un prix d'entrée décalé de quelques pips déplace le stop et
l'objectif ; un trade se ferme un jour plus tôt d'un côté ; le moteur redevient disponible
plus tôt, prend un signal que l'autre laissait passer, et les deux séquences ne peuvent
plus coïncider — **à règle d'entrée identique**. Sur six ans, un pourcentage d'accord global
de 40 % est donc compatible avec un portage parfait. La mesure de fidélité est le **nombre
d'entrées identiques d'affilée avant la première divergence**, pas le pourcentage global.

**Ce qui gouverne l'ampleur de l'écart : le nombre de trades.** Sur 434 trades, une dizaine
de trades qui basculent ne déplacent presque pas le résultat. Sur 42 trades, trois suffisent
à faire passer un facteur de profit de 1,4 à 1,03. Le nombre de trades n'est pas un critère
de qualité, c'est **le critère de fiabilité de la comparaison**.

## Bugs trouvés et corrigés le 02/09/2026

À vérifier dans le dépôt : ces corrections ont été faites côté JavaScript et ne sont
peut-être pas dans `main`.

**1. Le spread était déduit après coup au lieu d'être payé à l'entrée.**
Le R moyen était juste, mais le stop et l'objectif étaient placés quelques pips à côté de
ceux que le robot pose réellement chez le courtier. Certains trades étaient donc stoppés
chez MT5 et pas dans Sivula, ce qui désynchronisait toute la suite. L'entrée porte
maintenant le spread (`px = df.o[i] * (1 + d * spread)`), et le spread n'est plus retiré du
R — l'y laisser doublerait le coût.

**2. Le portage à la vente était compté comme un crédit.**
Le relevé de frais ne donne que le swap **long**. Pour une vente, le moteur prenait son
opposé : un coût de 3 %/an devenait un gain de 3 %/an. Les configurations à la vente étaient
systématiquement flattées, d'autant plus qu'elles duraient. Un courtier facture le portage
dans les deux sens. Le coût est désormais gardé dans les deux sens ; un portage réellement
favorable reste crédité à l'achat.

**3. Le découpage en 5 segments était bancal.**
Tranches de taille fixe via `ceil(n/k)` : le dernier segment ne recevait que le reste. Avec
6 trades → 2/2/2 et deux segments vides, donc « 3 / 3 » affiché là où le seuil en attend 5.
Et un segment d'un seul trade pouvait décider d'un « 5 / 5 ». Bornes désormais calculées
(`floor(n*s/k)`). **C'est le critère de sélection principal de l'utilisateur.**

**4. La pire série de pertes comptait les sorties à l'équilibre.**
Le moteur exclut déjà les sorties au point mort du taux de gagnants (seuil de 0,05 R), mais
dans la série de pertes consécutives un point mort prolongeait la série. Une configuration
à paliers, qui sort souvent à l'équilibre, affichait des séries qu'elle n'a jamais subies.

**5. L'export du robot embarquait les paliers du panneau, pas ceux de la variante mesurée.**
Le scan éteint la sécurisation avant de balayer, puis chaque variante la rallume à sa façon.
L'export lisait `archives[].reglages`, c'est-à-dire l'état du panneau au moment du scan.
Conséquence : une ligne mesurée « sans sécurisation » produisait un robot qui gérait son
stop. **Tous les robots exportés avant cette correction sont suspects**, sauf ceux dont la
variante utilisait par coïncidence les mêmes paliers que le panneau.

**6. Le filtre horaire du robot exporté ne s'activait jamais.**
La fonction de découpe perdait `heuresSession` en chemin. Sans effet sur les instruments
testés (aucune bougie écartée), mais le robot aurait agrégé des bougies que le backtest
écarte, sans que rien ne le signale.

**7. Un numéro magique unique pour tous les robots.**
Deux configurations sur le même instrument se seraient gérées mutuellement les stops. Le
numéro dérive maintenant de la configuration.

**8. Un scan mené à son terme était marqué « partiel ».**
Dès qu'un instrument du plan ne produisait aucune ligne (série absente, bougies
insuffisantes, tout écarté), l'archive passait pour interrompue et la reprise était proposée
indéfiniment. Un drapeau `termine` distingue les deux cas.

## Ce qui reste ouvert

**a. Lire la colonne de spread des CSV.** Fait côté JavaScript, à porter. `MqlRates` contient
un champ `spread` par bougie. Sans lui, le moteur retombe sur le spread **moyen** du relevé,
qui sous-estime l'heure du rollover — précisément celle où les entrées tombent, et où le
spread vaut deux à trois fois sa moyenne (sur AUDCAD : 0,0251 % au relevé contre 0,070 %
constatés face à MT5). Le script d'export MT5 est fourni (`Export_H1_Sivula.mq5`).
**Point à vérifier par la mesure :** sur l'historique ancien importé par le courtier, ce
champ vaut souvent 0. Il faut savoir sur quelle part de 2020-2022 il est renseigné avant de
compter dessus.

**b. Le classement du TOP.** Il classe par R net et affiche le meilleur des deux lectures.
Il propose donc la version optimiste de chaque configuration, et favorise celles qui font
beaucoup de trades à avantage fin — précisément celles qui s'effondrent en réel. Exemple
mesuré sur GOLD : `ema_5_SL0p6_RR3` (PF Sivula flatteur, PF réel 1,14) est classée devant
`ma_7_SL0p5_RR1p5` (PF réel 1,43), alors que la seconde gagne presque deux fois plus dans
MT5. **Proposition à valider par la mesure :** classer sur la lecture basse et sur le
facteur de profit, avec un plancher de trades.

**c. Le tamis de sélection.** Déduit de trois tests MT5 sur GOLD, pas d'une mesure
systématique : trades ≥ 150, PF ≥ 1,3, creux ≤ 10 stops, puis classer par R net. À valider
ou réfuter sur l'ensemble des instruments — c'est un excellent premier usage de l'exécution
automatisée.

**d. Passer les séries en M1 ou M15.** La part des trades tranchés par une bougie ambiguë
est de 5 à 20 % selon l'instrument. Le M1 la ferait presque disparaître, au prix de
2,2 millions de bougies par symbole sur six ans (≈ 600 Mo pour 14 symboles) et de scans
soixante fois plus lents. Le M15 est un compromis dont le gain n'a pas été mesuré.
**Non recommandé en l'état :** la « lecture basse », qui tranche toutes les bougies ambiguës
contre l'utilisateur, donne déjà la borne pessimiste pour un coût nul.

**e. Dates de trades dans la sortie du scan.** Permettrait le vrai creux de portefeuille
(au lieu du pire par ligne) et une courbe d'équité réelle pour le mélange.

## Ce qui est acquis et ne doit pas régresser

**Aucune configuration n'est retenue à ce jour.** Les six ci-dessous ont été mesurées dans
le testeur MT5 et sont cohérentes, mais leur rendement est jugé insuffisant par
l'utilisateur : +16 284 € cumulés sur 20 000 € et 6,6 ans, soit environ 11 % par an répartis
sur six instruments — pour un creux qui va jusqu'à 6,5 % sur une seule ligne. La recherche
d'une meilleure méthode est l'objet du travail à venir, pas un réglage à la marge.

Elles restent des **tests de référence** : ce sont les seuls chiffres mesurés sur les données
du courtier avec la logique des robots. Toute évolution du moteur doit reproduire ces ordres
de grandeur, sans quoi c'est le moteur qui a changé, pas la stratégie.

Mesures sur 20 000 € et 6,6 ans, toutes en achat, paliers 25→0 / 50→25 / 75→50, risque 1 % :

  | Instrument | Configuration | Résultat | PF | Trades | Creux |
  |---|---|---|---|---|---|
  | GOLD | `ma_7_SL0p5_RR1p5` | +8 315 € | 1,43 | 434 | 6,5 % |
  | Germany40 | `ema_26_SL1_RR1p5` | +2 497 € | 1,50 | 115 | 3,0 % |
  | USSPX500 | `ema_15_SL1p1_RR2` | +1 656 € | 2,01 | 44 | 1,9 % |
  | Japan225 | `mediane_10_SL2_RR1p5` | +1 389 € | 1,41 | 89 | 4,3 % |
  | BITCOIN | `ma_20_SL2_RR2` | +1 298 € | 1,67 | 39 | 2,7 % |
  | SILVER | `ema_26_SL2p5_RR1p5` | +1 129 € | 1,87 | 41 | 3,0 % |

  Le facteur de profit est le chiffre à regarder, pas le total : à 1,4 l'avantage par trade
  est réel, à 1,1 il ne survit pas aux frais. Et une ligne à 39 ou 41 trades ne prouve rien —
  trois trades qui basculent déplacent son facteur de profit de plusieurs dixièmes.

- Un contre-exemple aussi précieux : **AUDCAD `mediane_15_SL0p5_RR2`** → −2 863 €, PF 0,45,
  15,5 % de creux, alors que Sivula la mesurait à +14,2 R. 66 trades, dont ~23 sorties au
  prix d'entrée exact (palier armé puis prix revenu) et ~40 stops pleins. Le rapport MT5
  complet est reproductible ; c'est le meilleur cas de test d'un désaccord réel.

- La validation walk-forward, le découpage avant/après 01/2023, le tirage au sort de l'ordre
  des trades, le test de significativité avec correction de Benjamini-Hochberg, et le
  solveur de mélange optimal.

## Contraintes de produit à respecter

- **`Sivula.dc.html` est le seul fichier d'application côté prototype.** Un fichier, deux
  états : cadenas fermé = version d'essai (séries de démonstration), cadenas ouvert avec le
  code d'accès = données personnelles. Ne jamais créer de fichier « Essai » ou
  « Présentation » en double.
- **Aucun chiffre personnel écrit en dur.** Tout va dans `localStorage`, dans des espaces
  étanches (`.perso` / `.client` / `.essai`). Le fichier publié ne contient que l'exemple —
  le partage vers GitHub est sans risque par construction.
- **Aucune donnée de courtier embarquée en production.** L'utilisateur dépose ses CSV.
- Langue de travail et d'interface : **français**.
- Toute mesure enregistrée porte la version de la règle de moteur qui l'a produite
  (`MOTEUR_V`, actuellement `e4`). C'est ce qui permet d'afficher « à remesurer » plutôt que
  de laisser des chiffres anciens passer pour à jour. **À conserver.**

## Fichiers de cette passation

- `moteur.js` — le moteur : chargement et nettoyage des CSV, indicateurs, 11 filtres, types
  d'entrée, sécurisation (paliers et stop suiveur), détection de zones, boucle de backtest,
  résumé, segments. **C'est la spécification.**
- `scan-noyau.js` — le noyau de mesure du scan, partagé mot pour mot entre le fil principal
  et les workers. Une seule source de vérité : si les deux chemins divergeaient, un scan
  parallèle donnerait d'autres chiffres qu'un scan séquentiel sans que rien ne le signale.
- `scan-worker.js` — l'enveloppe worker.
- `robot-mt5.js` — génération du `.mq5` : en-tête de configuration, agrégation des bougies,
  filtres, paliers, gestion de position, tableau de bord sur le graphique.
- `conformite-noyau.js` — la confrontation moteur ↔ journal du robot MT5, appelée à la fois
  par `scripts/mt5/conformite.mjs` (ligne de commande) et par la page. Une seule
  implémentation : deux copies auraient divergé, et un « hors de la bande » mesuré d'un côté
  n'aurait plus voulu dire la même chose que de l'autre.
- `Sivula.dc.html` — l'application : interface, cache, tamis, walk-forward, tirage au sort,
  Benjamini-Hochberg, solveur de mélange, comparateur MT5, export des robots.
- `Export_H1_Sivula.mq5` — le script d'export d'historique H1, à glisser sur chaque
  graphique. Quatorze colonnes : OHLC, volume, **spread d'ouverture** (celui de la première
  M1 de l'heure, pas l'agrégat), séance, **minute des deux extrêmes**, **extrêmes vus par la
  M1**, et **extrêmes atteints après le second extrême**. Les six dernières existent pour
  une seule raison : réduire ce que le backtest doit deviner.

### Pour faire tourner la page

`Sivula.dc.html` importe `moteur.js`, `scan-noyau.js`, `robot-mt5.js` et
`conformite-noyau.js` en modules ES. Elle ne fonctionne donc PAS en `file://` — le
spécificateur relatif n'y résout pas et le moteur n'est jamais chargé, sans message
d'erreur visible. Il faut servir le dossier en HTTP :

    npx serve .        # puis ouvrir http://localhost:3000/Sivula.dc.html

`node scripts/app/ouvrir.mjs` fait la même chose sans interface, pour vérifier que la page
démarre après une modification.

## Premières tâches suggérées, dans l'ordre

1. **Un harnais de test qui exécute le moteur sur un CSV** et compare sa liste de trades à
   un rapport MT5 collé. Le cas AUDCAD ci-dessus fournit le jeu de données et le résultat
   attendu. C'est ce qui débloque tout le reste.
2. **Des tests qui figent les cinq invariants**, pour qu'une correction n'en casse pas une
   autre — c'est arrivé plusieurs fois.
3. **Mesurer, puis trancher (b) et (c)** : le critère de classement du TOP et les seuils du
   tamis, sur l'ensemble des instruments et non sur trois tests.
4. **Vérifier la couverture du champ `spread`** sur l'historique ancien avant de porter (a).
