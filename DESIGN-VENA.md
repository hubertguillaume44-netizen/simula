# Véna — le vocabulaire visuel, en un fichier lisible

`Vena.dc.html` fait 1,85 Mo : aucun outil de dessin ne peut le lire en entier. Ce fichier
extrait ce qu'il faut pour dessiner juste, sans l'ouvrir. Il est **extrait du code**, pas
imaginé : chaque valeur vient de `public/_ds/industry-…/styles.css` ou de l'application
elle-même, et le nombre entre parenthèses dit combien de fois la classe y est employée.

## Les deux polices

```
--font-heading : "Barlow Condensed", system-ui, sans-serif   (graisse 600)
--font-body    : "Barlow", system-ui, sans-serif
```

Les titres sont en **condensé**, jamais en gras de la police de texte. Les intertitres en
capitales portent un interlettrage d'environ `.12em`.

## Les couleurs

| Jeton | Valeur | Où |
|---|---|---|
| `--color-bg` | `#f2f2f3` | le fond de la page |
| `--color-text` | `#1d1f20` | l'encre |
| `--color-accent` | `#5980a6` | le bleu acier de la marque |
| `--color-accent-700` | `#416180` | les liens, les textes d'action |
| `--color-accent-900` | `#1d2d3d` | **l'en-tête**, le bandeau sombre du haut |
| `--color-accent-100` | `#eef6ff` | les fonds d'insistance, la ligne du compte actif |
| `--color-neutral-100` | `#f5f5f8` | les cadres en retrait |
| `--color-neutral-700` | `#5d5d60` | le texte secondaire (`.text-muted`) |
| `--color-divider` | `#1d1f20` à 16 % | tous les filets |

Les rayons sont **petits** : 2, 4 et 7 px. Rien n'est arrondi comme une pastille.

## Ce qui fait la signature : le cadre blueprint

Le motif le plus présent de l'application — **87 occurrences**. Un cadre net, sans ombre,
avec quatre marques d'angle :

```html
<div class="blueprint">
  <i class="corner tl"></i><i class="corner tr"></i>
  <i class="corner bl"></i><i class="corner br"></i>
  …
</div>
```

C'est un dessin d'atelier, pas une carte de tableau de bord. Pas d'ombre portée, pas de
grand rayon, pas de dégradé.

## Les autres classes, par fréquence réelle

| Classe | Emplois | Rôle |
|---|---|---|
| `.input` | 119 | tous les champs |
| `.btn-secondary` | 52 | **l'action ordinaire** — c'est le bouton par défaut |
| `.lien` | 47 | un bouton qui a l'air d'un lien |
| `.btn-ghost` | 37 | l'action discrète, à côté d'une autre |
| `.btn-primary` | 35 | l'action principale, rare par écran |
| `.tag` | 28 | les pastilles d'état |
| `.card-body` | 11 | le paragraphe d'un cadre |
| `.tag-outline` | 9 | une pastille en contour — « facultatif » |
| `.zdep` | 4 | une zone de dépôt de fichier, en pointillé |
| `.tsec` | 3 | l'en-tête d'un accordéon de tiroir |

## Les écrans, et ce qu'ils portent

**L'en-tête**, sur toutes les pages : le signe **V** et le mot **VÉNA** en condensé, sur
`--color-accent-900`. À droite du signe, le sélecteur de compte (un menu en `<div>`, pas un
`<select>`). Puis la navigation en trois groupes numérotés — **1 Mes instruments**,
**2 Mes scans**, **3 Mes décisions** — et à droite « Espace client · ce navigateur ». La
barre porte aussi « **1 R = 100 €** », le convertisseur qui traduit tout ce que
l'application affiche en R.

**L'accueil** (`tab: 'accueil'`) porte deux blocs côte à côte : « **J'ai une clé** » — un
champ e-mail, un champ `SIV1.…`, un bouton **Ouvrir** — et « **Espace client** ». En
dessous, le palier gratuit en trois chiffres : **3** instruments, **tous** avec une clé,
**0** donnée perdue. Puis la page de vente, dans la même page : trois colonnes de prix,
« Commencer », « Prendre l'abonnement », « Prendre l'année ».

**Mes instruments** (`vue: 'courtiers'`) — la première page après l'entrée. Le cadre
« Produire ces fichiers depuis MT5 », puis quatre gestes numérotés : déposer le relevé,
cocher les instruments, déposer les bougies H1, déposer les bougies M1. La liste des
instruments à gauche, l'instrument entier à droite.

**Mes scans** — Nouveau scan, Historique, Backtest. **Mes décisions** — Portefeuille,
Marché, Journal.

## Le ton, et ce qu'il interdit

L'application **mesure**, elle ne prédit pas. Aucun écran ne promet un résultat, aucune
courbe ne monte pour décorer. Les chiffres sont en `font-variant-numeric: tabular-nums`,
alignés. Une valeur inconnue s'écrit « — », jamais zéro : zéro est une mesure.

**« Véna » partout où un humain lit** — avec l'accent, capitales comprises : **VÉNA**.
**`vena` partout où une machine lit** — noms de fichiers, clés, identifiants, sans accent
ni majuscule. Un accent dans un nom de fichier casse au premier transfert entre systèmes.
