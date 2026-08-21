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

## Lancer en local

```sh
npm install
npm run dev
```

TanStack Start, React 19, Tailwind v4, Zustand, Recharts. Postgres (Neon en prod, PGLite en local). Pas de compte utilisateur.
