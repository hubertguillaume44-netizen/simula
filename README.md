# Simula — simulateur de stratégies trading

Rejouer une règle de trading sur un historique H1, puis la juger en cinq questions (tranches, hors période, frais, robustesse).

- **En ligne** : quatre séries de démonstration.
- **Vos CSV** : restent dans le navigateur, jamais envoyés.

Dépôt : [github.com/hubertguillaume44-netizen/simula](https://github.com/hubertguillaume44-netizen/simula)

## Grok + Claude

Ce dépôt est la copie qui compte. Grok et Claude travaillent **ici**, pas chacun de son côté.

1. Ouvrez ce dépôt dans Claude / Cursor.
2. Demandez la modification.
3. Claude pousse sur `main`.
4. Grok relit le même dépôt.

## Pages

| Chemin | Rôle |
|---|---|
| `/` | Accueil |
| `/methode` | Article |
| `/pourquoi` | Tableau de démonstration |
| `/simuler` | Laboratoire |
| `/visiteurs` | Fréquentation |

## Comparer le moteur au testeur MT5

Le moteur vit dans `src/lib/moteur.ts` (backtest H1 sur bougie confirmée) et
`src/lib/engine.ts` (réglages → config). Quand ses résultats ne collent pas à ceux du
testeur MetaTrader 5, `scripts/mt5-diff.mjs` rejoue le moteur sur le CSV H1, lit un
rapport MT5, et compare **séparément les entrées, les sorties et les frais**.

```sh
node scripts/mt5-diff.mjs --csv AUDCAD_H1.csv --mt5 rapport.html \
     --ligne mediane --periode 15 --sl 0,5 --rr 2 --out-csv journal.csv

npm run mt5:demo   # le voir tourner sur un couple aux écarts connus d'avance
node scripts/mt5-diff.mjs --aide
```

Le rapport MT5 peut être le HTML du testeur ou un copier-coller des onglets
Transactions / Ordres / Positions. Le harnais détecte seul le décalage d'heure serveur,
apparie les trades, puis chiffre l'écart en euros poste par poste : trades pris d'un seul
côté, sorties divergentes, frais — et ce qui reste inexpliqué. Il ne corrige rien.

## Lancer en local

```sh
npm install
npm run dev
```

TanStack Start, React 19, Tailwind v4, Zustand, Recharts. Postgres (Neon en prod, PGLite en local). Pas de compte utilisateur.
