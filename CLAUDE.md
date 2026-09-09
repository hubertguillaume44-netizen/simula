# Véna — conventions du dépôt

## Le nom, et sa règle d'écriture

**« Véna » partout où un humain lit.** Avec l'accent, y compris en capitales : **VÉNA**.
La marque, la page de vente, l'en-tête de l'application, les mails, les libellés de
paiement, le titre de fenêtre, les mentions de licence, les infobulles, les commentaires
du code.

**`vena` partout où une machine lit.** Sans accent, sans majuscule. Noms de fichiers,
clés de stockage, bases IndexedDB, noms de robots MQL5, identifiants dans le code, noms
de fichiers exportés, chemins de dossiers.

> **Pourquoi la séparation.** Un accent dans un nom de fichier ou une clé casse au premier
> transfert entre Windows et macOS : les deux systèmes ne normalisent pas le « é » de la
> même façon (NFC contre NFD), et le fichier devient introuvable. Le générateur de robots
> l'illustre : `nomRobot` efface tout caractère non alphanumérique, et « Véna » y
> deviendrait « V_na ».

L'adresse du site est **venapp.fr**. Le suffixe est technique : il n'entre ni dans le
logo, ni dans l'en-tête, ni dans les mails.

Ne pas confondre avec les mots français **simulateur**, **simulation**, **simuler** :
ce ne sont pas la marque, ils restent tels quels. La route `/simuler` aussi.

## Ce qui ne change JAMAIS de nom

Trois familles sont gelées. Les renommer casserait des données déjà chez l'utilisateur.

| Constante | Où | Pourquoi elle est gelée |
|---|---|---|
| Le **numéro magique** (`magicDe`) | robot MQL5, journal | Il identifie les positions ouvertes chez le courtier. Un robot qui perd son magique perd la trace de ses propres positions. Il ne hache que la configuration et le compte — le nom de l'application n'y entre pas, et ne doit jamais y entrer. |
| **`SIV_`** : `SIV_trades_`, `SIV_NIV_`, `SIV_PAN_`, la marque d'ordre `SIV_<stamp>` | protocole MT5 | Étiquettes écrites par les robots **déjà compilés** et lues par l'application. Les basculer remplirait `Common\Files` de deux orthographes du même fichier — le symptôme même qu'on corrige — et couperait la trace des robots en place. |
| Les **signatures de journal** | Journal, reproductibilité | Une signature enregistrée sous l'ancien nom doit rester valide et recalculable. |

## Ce qui accepte les deux noms, sans date limite

- **L'import d'une sauvegarde** : `outil: "vena"` et `outil: "simula"`, `vena_chiffre` et
  `sivula_chiffre`, l'extension `.vena` et `.sivula`. Quelqu'un réimportera dans deux ans
  un fichier exporté aujourd'hui. **À l'export : le nouveau nom seulement.**
- **Le relais d'usage** (`netlify/functions/usage.mjs`) : une version ancienne encore
  ouverte dans un onglet continue d'envoyer l'ancien marqueur.
- **Le script `Export_H1_Vena.mq5`** : il cherche `vena\symboles.txt`, puis retombe sur
  `Sivula\symboles.txt` si le premier est absent, en le disant dans le journal MT5.

## La migration du stockage

Elle vit **en tête de `Vena.dc.html`, avant la classe** — donc avant la moindre lecture.
Un renommage sans migration efface tout le travail de l'utilisateur au premier
chargement, silencieusement : c'est le seul geste irréversible de l'opération.

Sa règle : **la clé neuve fait foi**. Si elle existe, on la garde ; sinon, si l'ancienne
existe, on la recopie. **Rien n'est supprimé** — l'ancien jeu reste au moins une version,
le temps d'être certain que la copie a réussi et que l'utilisateur a exporté une fois
depuis.

L'ordre compte : **les données d'abord** (séries, scans, portefeuilles, journal — ce qui
est irremplaçable), **les réglages ensuite**, **la trace en dernier**. Une interruption au
milieu laisse la trace absente : le chargement suivant reprend depuis le début, et les
clés déjà copiées sont sautées. Chaque espace étanche (`.essai`, `.client`, `.perso`) et
chaque compte migrent séparément, puisque le suffixe fait partie de la clé.

Le site (`src/lib/store.ts`, `src/lib/uploads.ts`) a **ses propres** clés et sa propre
base : elles ont leur migration, sur la même règle.

Les balayages de clés (`estCleApp`) comptent **les deux jeux** tant que l'ancien n'est pas
supprimé : l'occupation réelle du navigateur est bien celle des deux.

## Fichiers

| Nom | Rôle |
|---|---|
| `Vena.dc.html` | **la source**, un seul fichier |
| `Vena.solo.html` | **artefact**, régénéré par `npm run app:solo` — ne jamais l'éditer à la main |
| `Export_H1_Vena.mq5`, `Vena_Releve.mq5` | scripts MT5 téléchargés par l'utilisateur |
| `aide-index.json` | **artefact**, régénéré par `npm run app:aide` après tout changement de `title=` |

Le dépôt GitHub s'appelle encore `hubertguillaume44-netizen/simula` : il se renomme
depuis GitHub, pas depuis le code. Les deux liens qui le citent (`README.md`,
`PASSATION.md`) suivront ce renommage-là.

## Déploiement — la configuration vit dans le dépôt

`netlify.toml` porte les trois réglages : commande de construction, `publish = "dist"`,
répertoire de fonctions. **Il fait foi contre l'interface Netlify.** Un réglage posé dans
une interface ne se relit pas, ne se révise pas en revue, et personne ne sait qu'il existe
jusqu'au jour où il casse — c'est arrivé : l'interface annonçait `dist/client` et le dépôt
construisait pour Vercel, deux sorties dont aucune n'existait.

`vite.config.ts` construit avec `nitro({ preset: "netlify" })`. Le préréglage dépose les
fichiers statiques dans `dist/` et le serveur SSR dans `.netlify/functions-internal/`,
que Netlify déploie **en plus** du répertoire `netlify/functions`.

**Les deux fonctions écrites à la main** (`licence.mjs`, `usage.mjs`) déclarent leurs
chemins `/api/licence` et `/api/usage`. Le serveur SSR déclare `path: "/*"` et n'exclut
que `/.netlify/*` : les deux se recouvrent. `netlify.toml` tranche par deux redirections
`force = true` vers `/.netlify/functions/…`, cible hors de portée du fourre-tout SSR — on
ne parie pas sur une préséance non documentée quand une licence qui tombe sur le SSR rend
404 au webhook de paiement.

`scripts/deploiement-netlify.test.mjs` lie ces réglages entre eux : préréglage, répertoire
publié, présence des deux fonctions, et une redirection forcée par chemin déclaré.

## Deux entrées, deux promesses

| Adresse | Ce que c'est | Ce qu'elle promet |
|---|---|---|
| **`/app`** | `Vena.solo.html` servi tel quel, hors du routeur du site | « ouvrir mon outil » — cinq pages, le moteur complet, vos données |
| **`/simuler`** | une page du site, en React | « voir comment ça raisonne » — quatre séries d'exemple |

La démonstration a sa raison d'être : elle montre le raisonnement à quelqu'un qui n'a pas
encore de données. Elle ne remplace pas le produit et ne doit pas s'en donner l'air —
aucun lien vers `/simuler` ne promet le produit, et la page renvoie vers `/app` dès qu'il
s'agit de mesurer ses propres exports.

`/app` n'étant pas une route du routeur, on y va par un `<a href>` : un `<Link>`
tenterait une navigation interne vers une route qui n'existe pas.

**La construction REFAIT l'application avant de la publier.** `npm run build` appelle
`scripts/app/publier-solo.mjs`, qui relance `solo.mjs`, vérifie que la version de
l'artefact est celle de `Vena.dc.html`, puis copie dans `dist/app/index.html`. Publier le
`Vena.solo.html` du dépôt aurait servi, un jour ou l'autre, une version figée divergeant
de la source — la même panne que le préréglage de déploiement, une strate plus haut.

**`_ds/` n'est pas dans le dépôt.** L'application charge sa feuille de style et son paquet
depuis `_ds/industry-…/`. Sans eux, la page se charge mais la mise en page s'effondre :
ce n'est pas « seulement l'habillage ». `publier-solo.mjs` le dit à chaque construction.
Pour le corriger : déposer les deux fichiers dans `public/_ds/industry-…/`, Vite les
recopie dans `dist/` tout seul.

**React et React-DOM viennent d'unpkg.com**, chargés par le runtime DC au démarrage. Un
réseau qui bloque unpkg laisse l'application vide.

## Le test qui tient la convention

`scripts/app/nom-vena.test.mjs` échoue si l'ancien nom réapparaît ailleurs que dans la
migration et l'import de sauvegarde, si un accent se glisse dans un chemin, une clé ou un
nom de fichier, ou si un fichier du dépôt reprend l'ancien nom.
