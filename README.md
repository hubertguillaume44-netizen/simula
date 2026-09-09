# Véna — mesurer une règle de trading sur ses propres séries

Véna rejoue une règle de trading sur un historique H1 exporté de MetaTrader 5,
puis la juge : tranches, hors période, frais réels, robustesse, contrôle du hasard.
C'est un outil de mesure, pas un conseil en investissement — il ne prédit rien,
ne passe aucun ordre et ne détient aucun fonds.

Dépôt : [github.com/hubertguillaume44-netizen/simula](https://github.com/hubertguillaume44-netizen/simula)

## Les fichiers qui comptent

| Fichier | Rôle |
|---|---|
| `Vena.dc.html` | **La source** de l'application (composant DC, rendu par `support.js`). C'est ici qu'on modifie. |
| `Vena.solo.html` | **Le livrable** : un seul fichier, aucun voisin requis. Ne jamais l'éditer à la main — il se régénère. |
| `moteur.js` | Le moteur de référence (backtest H1, signaux, sécurisation, impact des événements). La spécification. |
| `robot-mt5.js` | Le générateur d'Expert Advisor MQL5 — le robot exécute la même règle que le moteur. |
| `scan-noyau.js` / `scan-worker.js` | Le balayage de configurations, hors du fil principal. |
| `netlify/functions/` | Deux fonctions sans base de données : la délivrance du code d'accès (webhook Revolut → code signé Ed25519 par mail) et le relais du compteur d'usage (filtré, rien stocké). |

```sh
npm test              # node --test 'scripts/**/*.test.mjs' — moteur, conformité, licence, portes, événements
npm run app:solo      # régénère Vena.solo.html depuis Vena.dc.html
npm run app:aide      # régénère l'index d'aide après un changement de title=
```

## Ce qui sort du navigateur, et rien d'autre

Séries, scans, portefeuilles, réglages : lus et calculés sur la machine, enregistrés
dans le navigateur seulement. Les sorties possibles sont toutes déclenchées par
l'utilisateur et déclarées dans le tiroir Confidentialité :

- les **trois portes** facultatives — sauvegarde chiffrée (AES-GCM, phrase détenue par
  l'utilisateur seul), compteur d'usage anonyme **éteint par défaut** (charge visible
  avant envoi), fichier de diagnostic (un téléchargement, jamais un envoi) ;
- avec une **clé Finnhub** saisie : les tickers partent à Finnhub (résultats
  trimestriels, titres de presse), et les titres reçus en anglais sont traduits via
  **MyMemory** — le texte du titre part au service de traduction, rien d'autre ;
- la vérification du code d'accès se fait **hors ligne** (clé publique embarquée) :
  aucun appel réseau au chargement ni à la validation.

L'agenda macro et l'impact mesuré des événements se calculent entièrement en local,
sur les CSV déposés.

## Comparer le moteur au testeur MT5

Quand les résultats du moteur ne collent pas à ceux du testeur MetaTrader 5,
`scripts/mt5-diff.mjs` rejoue le moteur sur le CSV H1, lit un rapport MT5, et compare
**séparément les entrées, les sorties et les frais**.

```sh
node scripts/mt5-diff.mjs --csv AUDCAD_H1.csv --mt5 rapport.html \
     --ligne mediane --periode 15 --sl 0,5 --rr 2 --out-csv journal.csv

npm run mt5:demo   # le voir tourner sur un couple aux écarts connus d'avance
node scripts/mt5-diff.mjs --aide
```

Le rapport MT5 peut être le HTML du testeur ou un copier-coller des onglets
Transactions / Ordres / Positions. Le harnais détecte seul le décalage d'heure serveur,
apparie les trades, puis chiffre l'écart poste par poste : trades pris d'un seul côté,
sorties divergentes, frais — et ce qui reste inexpliqué. Il ne corrige rien.

La même démarche sert à l'agenda macro : le décalage entre l'heure de Paris et
l'horloge des séries n'est pas une constante, il est retrouvé dans les données
(`decalageSerie` dans `moteur.js`).

## Licence

Le code d'accès est signé (Ed25519) et nominatif. La clé privée ne vit que dans les
variables d'environnement Netlify — jamais dans le dépôt ; `scripts/licence/cle-demo.mjs`
est une paire de **démonstration**, refusée par la fonction de production.
`scripts/licence/generer-cles.mjs` fabrique la vraie paire, `signer.mjs` signe à la main.
