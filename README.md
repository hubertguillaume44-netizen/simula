# Simula — simulateur de stratégies trading

Rejouer une règle de trading sur un historique H1, puis la juger en cinq questions (tranches, hors période, frais, robustesse).

- **En ligne** : quatre séries de démonstration.
- **Vos CSV** : restent dans le navigateur, jamais envoyés.

Site public : https://simula.grok.me/
Dépôt : https://github.com/hubertguillaume44-netizen/simula

## Grok et Claude

Ce dépôt est la copie qui compte. Ouvrez-le dans Claude / Cursor. Dans Grok, donnez cette URL.

## Pages

| Chemin | Rôle |
|---|---|
| `/` | Accueil |
| `/methode` | Article |
| `/pourquoi` | Tableau de démonstration |
| `/simuler` | Laboratoire |
| `/visiteurs` | Fréquentation |

## Lancer en local

```sh
npm install
npm run dev
```

Puis `npm run typecheck` et `npm run build`.

TanStack Start, React 19, Tailwind v4, Zustand, Recharts. Pas de compte utilisateur.
