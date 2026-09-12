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
ce ne sont pas la marque, ils restent tels quels.

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

**Le site ne stocke plus rien.** Il avait ses propres clés et sa propre base
(`src/lib/store.ts`, `src/lib/uploads.ts`) pour une démonstration en React, à côté de
celle que l'application porte déjà. Les deux fichiers sont partis avec elle : le seul
stockage du navigateur est désormais celui de l'application, et la migration ci-dessus
est la seule à tenir.

Les balayages de clés (`estCleApp`) comptent **les deux jeux** tant que l'ancien n'est pas
supprimé : l'occupation réelle du navigateur est bien celle des deux.

## Fichiers

| Nom | Rôle |
|---|---|
| `Vena.dc.html` | **la source**, un seul fichier |
| `Vena.solo.html` | **artefact**, régénéré par `npm run app:solo` — ne jamais l'éditer à la main |
| `Export_H1_Vena.mq5`, `Vena_Releve.mq5` | scripts MT5 téléchargés par l'utilisateur |
| `aide-index.json` | **artefact**, régénéré par `npm run app:aide` après tout changement de `title=` |

À chaque livraison : `npm run app:version` avant `npm run app:solo` — voir « La version
affichée est une date » plus bas.

Le dépôt GitHub s'appelle `hubertguillaume44-netizen/vena`. Il a été renommé depuis
GitHub, et les deux liens qui le citent (`README.md`, `PASSATION.md`) ont suivi. GitHub
redirige l'ancienne adresse, mais un lien écrit dans le dépôt doit nommer la vraie :
une redirection se retire le jour où quelqu'un recrée un dépôt sous l'ancien nom.

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
| **`/tarifs`** | une page du site, en React | « combien ça coûte » — trois formules, un comparatif, six objections |

**Il n'y a plus qu'une démonstration, et c'est celle de l'outil.** Le site portait la
sienne en React, sur `/simuler`, à côté de celle que l'application porte déjà avec le
moteur entier : deux moteurs à tenir d'accord, et le jour où ils divergent c'est la
vitrine qui ment sur le produit. Les séries de démonstration s'ouvrent dans `/app`.

**Le site vend, l'application travaille.** Le prix vit sur `/tarifs` et nulle part
ailleurs ; l'accueil n'en garde qu'un résumé de trois montants. Dans l'outil, le prix
n'est jamais écrit — il est POINTÉ, par un lien discret en bas de la section licence du
tiroir. Une seconde page de vente serait une seconde vérité à tenir à jour.

`/app` n'étant pas une route du routeur, on y va par un `<a href>` : un `<Link>`
tenterait une navigation interne vers une route qui n'existe pas.

**Le repère d'arrivée est `/app#licence`, et c'est le seul.** Les colonnes payantes de
`/tarifs` le portent ; il ouvre le tiroir de l'application sur la section Licence,
curseur dans le champ du courriel. Un **fragment** et non un paramètre : il ne part
jamais au serveur, donc il ne croise pas la redirection `/app` → `/app/index.html`.

`repereLicence()` le **nettoie** (`history.replaceState`) dès qu'il l'a lu, avant toute
décision — sans quoi un rechargement, ou un favori posé sur cette adresse, rouvrirait le
tiroir indéfiniment. Il n'est lu qu'APRÈS la revérification de la licence, qui est
asynchrone : le lire plus tôt ouvrirait le tiroir au nez de quelqu'un qui a déjà sa clé.
Il ne s'enregistre nulle part — ni session, ni drapeau « déjà vu ».

**Un seul champ de clé dans toute l'application**, celui du tiroir. Le bandeau de compte
vide y MÈNE, il ne le copie pas : deux champs seraient deux états à tenir d'accord.
`scripts/app/ou-poser-sa-cle.test.mjs` tient les trois points — un seul champ, le repère
nettoyé, et le bandeau qui s'efface dès qu'une clé est posée.

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

## L'application ne dépend de rien d'extérieur

Une fois `/app` chargé, **aucune requête ne part vers un tiers**. Trois dépendances le
mettaient en défaut ; les trois sont dans le dépôt.

| Ce qui partait dehors | Où c'est maintenant |
|---|---|
| React et React-DOM, depuis unpkg.com | `vendor/react-18.3.1/` |
| La feuille et le paquet du système de design | `public/_ds/industry-…/` |
| Barlow et Barlow Condensed, importées par cette feuille | `public/_ds/industry-…/fonts/` |

**React.** `support.js` porte « do not edit » ; on ne le modifie pas. Son
`cdnScriptFor` lit `window.__resources` avant de retomber sur l'URL distante :
`Vena.dc.html` pose cette table **avant** la balise du runtime, et `solo.mjs` la remplace
par des Blob URL pour que le fichier unique reste autonome. Les deux URL unpkg qui
subsistent dans le fichier livré sont les **clés** de cette table — ce que le runtime
cherche, jamais ce qu'il charge.

**Les versions sont épinglées à 18.3.1, pas à une plage.** Un produit qui se met à jour
tout seul quand un tiers publie casse un matin sans qu'on ait rien touché. Les fichiers
vendorés sont vérifiés **identiques aux empreintes SRI** que `support.js` attendrait du
CDN : ce n'est pas « une version de React », c'est la même, octet pour octet.

**Les polices** sont vendorées en latin et latin-ext seulement — l'application est en
français. `node scripts/app/vendorer-polices.mjs` les rafraîchit à la main ; il ne tourne
pas à la construction, qui ne doit pas dépendre d'un service tiers pour réussir.

**Les seules adresses externes tolérées** dans le fichier livré sont les portes ouvertes
sur demande : `finnhub.io` (actualités) et `api.mymemory.translated.net` (traduction).
Elles ne partent qu'avec une clé posée par l'utilisateur, et le tiroir Intendance les
affiche une par une.

`scripts/app/autonomie.test.mjs` tient tout cela : empreintes SRI, ordre de la
substitution, absence de chargement de tiers dans le fichier livré, présence des polices,
et correspondance entre le chemin que l'application déclare et celui où le fichier est
publié.

## Protection temporaire du site (à retirer au lancement)

Le site entier est derrière une authentification de base, déclarée dans `netlify.toml`
par un bloc `[[edge_functions]]` de trois lignes. **Supprimer ces trois lignes l'enlève**
— voir PASSATION.md, « La protection temporaire du site ».

Le mot de passe vit dans la variable d'environnement **`VENA_ACCES`** posée dans Netlify,
au format `identifiant:motdepasse`, jamais dans le dépôt. La fonction **ferme** quand la
variable manque : une protection qui disparaît avec sa configuration ne protège rien.

Elle couvre `/api/licence` : **le webhook Revolut recevra 401 tant qu'elle est en place**.
À traiter le jour où le paiement s'ouvre, avec la liste `OUVERTS` de `protection.js`.

## La version affichée est une date, et elle part avec les rapports

`VERSION_APP` n'est pas un ornement du pied de page. Elle voyage avec **chaque rapport
d'avis** et **chaque fichier de diagnostic** : c'est la seule chose qui dise quelle
version l'utilisateur avait sous les yeux quand il a vu ce qu'il rapporte. Restée à
`260905` pendant que l'application changeait de fond en comble, elle ne se contentait
pas d'être inutile — elle **mentait**, et un rapport qui ment sur sa version fait
chercher un défaut là où il n'est plus.

**À chaque livraison :** `npm run app:version` (pose la date du jour, format AAMMJJ),
puis `npm run app:solo`. `npm run app:version -- --voir` dit ce qui est posé sans rien
écrire. Deux livraisons le même jour portent le même numéro : la journée est la
granularité utile.

**Ne pas la confondre avec `MOTEUR_V`.** Celle-là est une clé de cache : la changer
PÉRIME les résultats enregistrés de tout le monde. `VERSION_APP` est une étiquette, elle
ne conditionne aucun calcul — c'est pour ça qu'on peut la bouger sans précaution, et
aussi pour ça qu'on l'oublie. `scripts/app/version-datee.test.mjs` interdit qu'elles se
confondent, et vérifie que la date existe, qu'elle n'est pas dans l'avenir, et que
l'artefact porte la même que la source.

**L'oubli se voit à la construction.** `publier-solo.mjs` avertit quand `Vena.dc.html` a
été écrit après la date qu'il annonce. C'est un avertissement et non un arrêt : un clone
frais réécrit les dates de fichiers, et refuser de construire un dépôt fraîchement cloné
serait un piège pire que l'oubli qu'on prévient.

## Les séries d'exemple sont engendrées, jamais livrées

**Aucune série d'exemple n'est un fichier.** Tout vient d'un générateur déterministe à
graine fixe, en tête de `Vena.dc.html` : quelques kilooctets de code, zéro octet de
données, les mêmes séries pour tout le monde. **Rien des exports d'un utilisateur n'entre
dans le produit** — ce qui était le cas des quatre séries `DEMO-*` livrées en CSV, dont
personne ne pouvait plus dire d'où venaient les prix.

**La graine est gelée, versionnée — jamais choisie : `vena-exemple-v2`.**

*Gelée* : un scan enregistré hier doit se relire sur les mêmes bougies. *Versionnée* : le
jour où le générateur change, les bougies changent, et le numéro suit. La `v2` date du
lissage et de la dispersion des régimes ; la `v1` était l'escalier commun aux dix
familles. Le test échoue à chaque changement du générateur, exprès — il oblige à décider
si les bougies ont bougé, et à le dire, plutôt qu'à s'en apercevoir le jour où un scan
enregistré ne se relit plus.

*Jamais choisie*, et c'est la partie qui demande de l'attention. On a proposé de
rechoisir la graine sur un critère de **présentation** — que la dernière clôture de
chaque famille tombe dans les 80 % centraux de son amplitude — au motif qu'un tel critère
ne parle pas de performance. **Mesuré sur vingt-quatre graines : deux le satisfont.** Une
propriété rare n'est pas un cadrage. Une clôture au bord de l'amplitude est la signature
d'une tendance qui a tenu jusqu'au bout ; exiger que les dix l'évitent retient les univers
où les tendances meurent avant la fin — exactement ce qu'un balayage de croisements de
moyennes est censé trouver, ou ne pas trouver. Le critère a l'air d'un cadrage, c'est un
réglage du marché.

## Le compte de découverte n'existe plus

Il était le **sixième compte** d'un sélecteur qui en offre cinq, avec ses bougies écrites
dans le navigateur, son relevé de frais à lui et un semis versionné. Trois défauts, et
aucun n'était cosmétique : il occupait une place de compte ; ses bougies pesaient dans la
jauge et partaient dans « Exporter mes données » ; et **ses frais appartenaient au
compte**, si bien que le spread d'une série changeait selon l'onglet depuis lequel on la
regardait.

Les dix séries d'exemple vivent maintenant **en mémoire**, visibles depuis n'importe quel
compte, et leur relevé vient de la table du générateur — deux colonnes, spread en pour-cent
du notionnel et swap annuel. Écrit en points, il restait « coût non chiffrable » jusqu'à ce
qu'une conversion de prix passe : le relevé d'exemple est donc marqué `mt4: false` et
`chiffre: true`, c'est-à-dire **déjà retraité**.

**`compteActif` est une liste blanche.** Une session enregistrée désigne peut-être encore
`ongCourtier: 'demo'`. Une liste noire ne protège que du cas qu'on a pensé ; la prochaine
clé morte viderait l'écran sans un mot, exactement comme le jour où la page d'accueil a été
retirée sans garder la porte.

**La couverture des séries d'exemple se calcule et ne s'enregistre pas.** Elle est lue en
surcouche de la carte et **retirée à l'écriture** : la carte lue est celle qu'on réécrit,
donc sans ce filtre elles se seraient enregistrées au premier relevé d'une vraie série.

**`retirerCompteDemo()` est le seul geste irréversible de l'opération**, et il n'efface que
des données engendrées. Il est idempotent **par une marque** — juger à « il ne reste rien à
faire » rebalaie tout le stockage à chaque chargement. Il ne prend que les clés se
terminant par `.demo` : un suffixe, jamais un fragment, sans quoi un compte que l'utilisateur
aurait nommé « demo-perso » partirait avec. Et il lit les index de séries **avant** de les
effacer, sinon leurs blocs de bougies restent inatteignables — la panne qui a déjà laissé
147 séries et 97 Mo derrière elle.

**Masquer n'est pas supprimer.** L'interrupteur du tiroir retire les dix de la vue et les
repose ; il n'efface rien, parce qu'il n'y a rien d'écrit. Un bouton « supprimer » mentirait
sur ce qu'il fait. Seul le choix est enregistré, un booléen dans la session.

**Le filtre de provenance est une deuxième question**, pas une variante de « avec bougies » :
l'une demande ce qui est mesurable, l'autre d'où ça vient. Les fondre en un segment rendrait
impossible « mes instruments qui ont des bougies », qui est la vue de travail.

**Ni le palier gratuit ni le bandeau d'arrivée ne les comptent.** Le premier fermerait la
mesure à quelqu'un qui n'a rien déposé ; le second disparaîtrait au premier chargement, et
avec lui la seule porte visible vers le champ de clé.

## Les cinq règles, dans l'ordre où elles se servent

Elles viennent toutes d'un défaut réel de ce dépôt, et chacune est détaillée plus bas.

1. **Demander une intention pour prédire un résultat** — décider après, pas avant.
2. **Toute garde de frontière se vérifie par mutation** — une sonde qui ne tombe jamais ne
   prouve rien.
3. **On interdit le code, pas le récit du code.**
4. **Quand l'explication contredit l'étiquette, c'est l'étiquette qui est le défaut.**
5. **Une affirmation sur un fichier se relit avant d'être rapportée.**

## Une garde d'étanchéité se pose à la frontière d'ÉCRITURE

C'est la leçon d'un aller-retour, et elle vaut au-delà de ce chantier. La première garde
vérifiait que le **générateur** n'écrit nulle part : elle passait, et la fuite était chez
le **consommateur** — `ecrireCouv` réécrivait la carte de couverture qu'il venait de lire,
séries d'exemple comprises. *La carte lue est celle qu'on réécrit.* Un producteur propre
ne prouve rien sur ce que le reste du programme fait de ce qu'il produit.

Le refus vit donc **au seul endroit par lequel une série entre dans le stockage** —
`garderSerie`, avant que la clé ne soit construite — et à la seconde frontière qu'est
`noterCouv`. Posé là, il vaut pour les trois espaces étanches (`.perso`, `.client`,
`.essai`) et les cinq comptes sans qu'on ait à les énumérer.

`scripts/app/etancheite-exemples.test.mjs` fait tourner **le vrai code** contre un faux
stockage, dans les trois espaces.

**La sonde d'idempotence** passe la migration **deux fois** et compare le stockage entier
entre les deux passages : le second ne doit rien retravailler, ni rebalayer les blocs de
bougies. Une troisième sonde pose la marque d'avance et vérifie que la migration n'entre
même pas — elle a fait son office une fois, elle ne surveille pas le stockage à vie.

**Toute garde qui protège une frontière se vérifie par MUTATION.** On l'écrit, puis on
casse le code exprès et on vérifie qu'elle tombe. Sans ça, on a écrit un commentaire
exécutable — c'est précisément pourquoi la garde du générateur passait pendant que la
couverture fuyait. Vérifié ici : désancrer la sélection des clés, retirer la lecture de la
marque, retirer le refus de `garderSerie`, ou décider du repli de l'indicateur avant le
relevé font tomber chacun le test correspondant.

### On interdit le code, pas le récit du code

C'est le piège de **toute garde qui lit du source**, et il s'est présenté trois fois en une
séance : l'analyseur de gabarit empilait un `<select>` cité dans un commentaire ; une garde
sur `calcRegime` échouait sur son propre commentaire, celui qui nomme `this.essai` pour
raconter l'erreur ; et la garde d'écriture du générateur tombait sur le nom d'une fonction
cité dans une note.

Le commentaire qui raconte une garde précédente la **nomme** — c'est son travail. Une garde
qui lit du source doit donc retirer les commentaires avant de juger, ou s'accrocher à une
forme que la prose ne peut pas imiter.

### Le défaut a un nom : demander une INTENTION pour prédire un RÉSULTAT

Il a été réparé trois fois de suite, toujours par le même geste — **décider après, pas
avant** :

| Où | L'intention demandée | Le résultat voulu |
|---|---|---|
| Garde d'étanchéité | « le générateur écrit-il ? » | « quelque chose d'engendré entre-t-il dans le stockage ? » |
| `this.essai` | « a-t-il payé ? » | « y a-t-il quelque chose à mesurer ? » |
| `aMoi` | « a-t-il déposé ? » | idem |

À chaque fois l'intention était un **proxy plausible** du résultat, et à chaque fois elle
divergeait dans un cas que personne n'avait listé. Quand le résultat est observable,
observez-le.

### Une affirmation sur un fichier se relit avant d'être rapportée

Un commentaire a été annoncé comme écrit alors que le script qui le posait s'était arrêté
sur une substitution précédente **sans rien enregistrer**. Le rapport décrivait un fichier
qui n'existait pas.

« Les tests ne pouvaient pas l'attraper » n'est pas le bon diagnostic. **Une affirmation
sur le contenu d'un fichier est une affirmation sur le disque**, et elle se revérifie par
une lecture — jamais sur l'intention d'avoir écrit. Un script qui enchaîne des
substitutions et s'arrête au milieu ne laisse aucune trace : il faut relire ce qu'on
prétend avoir posé, avant de le dire.

### Quand l'explication doit contredire l'étiquette, c'est l'étiquette qui est le défaut

Une étiquette est **actionnable par construction**. « Périmée » veut dire *refais ton
export* ; sur une série d'exemple il n'y a pas d'action, et à partir du 27 octobre 2026 il
y en aurait eu dix, sur le premier écran, pour toujours — toute capture faite après cette
date montrant dix alertes que personne ne peut lever. Un premier correctif avait gardé le
mot en ajoutant « il n'y a rien à réexporter » juste en dessous : c'était le signal.

Le verdict devient donc **« fenêtre fixe »**, qui enseigne la même chose avec les dates à
côté — qu'une série a une fenêtre et qu'un scan s'arrête à sa fin. Ce qu'un export oublié a
de particulier, c'est qu'on peut le **refaire**, et c'est précisément ce que l'exemple ne
partage pas. Le seuil, lui, n'est **pas** exempté : `vieux` ne pilote que l'étiquette, une
phrase et deux encres — aucun comportement — donc c'est le verdict qui change, pas la
mesure. Les deux encres d'alerte suivent le verdict (`vieux && !estExemple(sel)`), sans
quoi les dix porteraient la couleur d'alerte sans porter le mot.

## Aucun mot relatif sur une fenêtre figée

L'indicateur de régime, mesuré sur les séries d'exemple, travaille sur une fenêtre écrite
dans le générateur. « hier » y désigne la veille de **cette** date, pas la veille
d'aujourd'hui, et l'écart grandit à chaque jour qui passe : au bout de six mois, « hier »
annoncerait une veille vieille de six mois. Le régime porte donc `surExemples`, et les
trois chiffres de la veille comme la frise se datent **en toutes lettres** — « au 11
septembre 2026 » — pendant que `zBougie` ajoute « séries d'exemple, fenêtre fixe ». Sur
des bougies à soi, fraîches par construction, « hier » reste juste et se lit mieux.

**Deux « périmées » différentes, et il faut les distinguer.** Le filtre des 48 h de
`calcRegime` n'écarte JAMAIS les séries d'exemple : `tFin` est la dernière bougie du lot
mesuré, donc leur propre dernière bougie. Mais la fiche d'instrument porte un AUTRE test,
le seul date-contre-aujourd'hui du fichier — `Date.now() - cv.t1 > 45 jours`, dans le
producteur de la fiche — et **celui-là s'applique bien à elles** : elles passeront
« périmées » quarante-cinq jours après leur dernière bougie.

**Mais elles n'en portent pas le MOT** : le verdict est « fenêtre fixe » — voir « Quand
l'explication doit contredire l'étiquette » plus haut. Ce paragraphe a d'abord dit
l'inverse (« c'est voulu, ce n'est pas un défaut à corriger ») et il avait tort : le seuil
est bien voulu, l'étiquette ne l'était pas.

Ne pas confondre non plus avec les deux autres « périmé » du fichier : les « chiffres
périmés » (réglages changés, `perime()`) et `aScansPerimes` (un scan antérieur à une
livraison). **Trois mécanismes, un seul mot.**

## L'indicateur choisit son univers sur un RÉSULTAT, jamais sur une intention

Deux corrections successives au même endroit, et **la première déplaçait le défaut au lieu
de le fermer** — il portait même le nom.

| Garde | Ce qu'elle cassait |
|---|---|
| `this.essai` | Payer sans rien importer donnait l'univers réel, dont **aucune série n'est livrée** : zéro mesure, indicateur muet, pendant que le non-payant en voyait un. **Payer donnait moins.** |
| « ai-je des séries à moi » | Vrai dès **un** dépôt, même d'un instrument absent de la carte sectorielle. L'indicateur se taisait pour quelqu'un qui en avait un la veille. **Déposer donnait moins** — et la régression venait du geste qu'on lui demande de faire. |

Les deux demandaient une **intention** (as-tu payé, as-tu déposé) pour prédire un
**résultat** (y aura-t-il quelque chose à mesurer). On relève donc l'univers réel, et
**seulement s'il ne rend rien** on retombe sur les dix séries d'exemple, `surExemples` à
vrai. La page dit alors « séries d'exemple, fenêtre fixe » — ça se lit ; un écran vide ne
se lit pas.

C'est le même déplacement que celui de la garde d'étanchéité : **décider après, pas
avant.**

## Cet univers d'exemple monte, et l'application le dit

Sur ces trois ans, la médiane des dix familles finit à **+39 %**, quatre au-dessus de
+100 %. Un balayage y trouvera facilement un résultat flatteur, et l'utilisateur
l'attribuera à son idée.

**Ce n'est pas un défaut de conception, et ça ne se corrige pas dans les données.** La
dérive attendue par la table des régimes vaut 14,3 % × σ — négligeable devant σ√3. C'est un
tirage du facteur commun, pas un biais : rééquilibrer la table des dérives serait un remède
faux sur une cause inexistante, et rechoisir la graine un réglage du marché (voir plus
haut).

**Ce qui reste est un devoir de dire.** La phrase vit à deux endroits de l'interface, là où
les séries s'expliquent — le bandeau des données de démonstration et l'infobulle du filtre
de provenance. C'est l'éthique de l'outil : **il mesure, il ne promet pas.** Et c'est moins
cher que n'importe quelle correction de données.

**On n'écrit rien.** Elles vivent en mémoire, engendrées à la demande, une famille à la
fois. Jamais dans le stockage de l'utilisateur, jamais dans « Exporter mes données »,
jamais dans la jauge. C'est ce qui les distingue d'un compte : un compte porte des
données, celles-ci n'en sont pas.

Les dix familles, avec leur séance, leur volatilité annuelle, leur bêta au facteur macro
commun, et leurs frais — qui suivent l'instrument, jamais le compte :

| Ticker | Groupe | Séance | Vol./an | β | Spread | Swap/an |
|---|---|---|---|---|---|---|
| VX-EUR | Devises | 24 h, lun–ven | 8 % | 0,3 | 0,012 % | −1,2 % |
| VX-YEN | Devises | 24 h, lun–ven | 10 % | 0,4 | 0,013 % | −1,8 % |
| VX-40 | Indices | 14 h, lun–ven | 17 % | 0,9 | 0,018 % | −3,4 % |
| VX-500 | Indices | 23 h, lun–ven | 15 % | 1,0 | 0,015 % | −3,1 % |
| VX-2000 | Indices | 23 h, lun–ven | 22 % | 1,2 | 0,030 % | −3,8 % |
| VX-OR | Métaux | 23 h, lun–ven | 14 % | −0,2 | 0,022 % | −3,6 % |
| VX-CU | Métaux | 23 h, lun–ven | 22 % | 0,8 | 0,045 % | −4,2 % |
| VX-TECH | Actions | 7 h, jours de bourse | 40 % | 1,4 | 0,035 % | −2,8 % |
| VX-CONSO | Actions | 7 h, jours de bourse | 15 % | 0,6 | 0,030 % | −2,6 % |
| VX-BTC | Crypto | 24 h, 7 j | 60 % | 1,1 | 0,080 % | −8,0 % |

Identifiant machine en minuscules sans accent (`vx-eur`), libellé humain en capitales —
la règle du nom, appliquée aux séries. Le ticker est manifestement inventé : personne ne
doit confondre « VX-500 » avec un indice réel.

**Un facteur macro COMMUN**, pondéré par le bêta, plus un bruit propre. Sans lui, un
portefeuille de dix lignes paraîtrait dix fois moins risqué qu'il ne l'est. VX-OR porte
un bêta négatif pour qu'une famille aille à contre-courant.

**Cinq régimes au calendrier fixe** — calme haussier, choc baissier, reprise, range,
tendance accélérée. Datés et non tirés au hasard : un backtest doit avoir quelque chose
à trouver et quelque chose à perdre, et la même histoire pour tout le monde rend une
capture d'écran discutable.

**Ils arrivent en rampe, et pas le même jour pour tous.** Le profil de régime était un
escalier COMMUN : à une heure connue d'avance, la même pour tout le monde à jamais, la
volatilité des dix familles triplait d'un coup. Un balayage de sortie de volatilité —
l'usage même de l'outil — se serait déclenché là, sur une propriété du générateur.

Deux corrections, qui ne font pas la même chose. Le profil est **lissé** : convolution
exacte de l'escalier par un cosinus surélevé sur ±trois semaines, donc aucun angle ni au
début ni à la fin de la rampe — la volatilité met six semaines à tripler, ce qu'une crise
met réellement. Et son entrée est **dispersée** : chaque famille démarre sa rampe avec son
propre décalage, de zéro à soixante jours, tiré de sa graine. C'est la dispersion qui
compte. Un vrai marché a des crises communes ; il n'a pas le maximum absolu de variance de
chaque instrument le même jour du calendrier. Le facteur macro n'est pas touché : les
corrélations de rendements (0,54 entre les deux indices) et le contre-courant de VX-OR
restent entiers.

**La dérive d'un régime se mesure en volatilités, pas en pour-cent.** La table est écrite
pour une référence à 15 % de volatilité annuelle, et chaque famille l'encaisse au prorata
de la sienne. Appliquée telle quelle, elle retirait 35 % par an à une devise annoncée à
8 % comme à une action annoncée à 40 % : la devise creusait 3,9 fois sa volatilité
annuelle quand les neuf autres tenaient entre 0,7 et 2,6 fois la leur. Le calcul passe par
le **logarithme** — −35 % multipliés par quatre donneraient −140 %, un prix négatif, et
des `NaN` dans toute la série.

`scripts/app/series-exemple.test.mjs` fait tourner LE VRAI générateur, extrait de la
source. **La garde qui compte est l'absence d'artefact exploitable** : |autocorrélation|
des rendements horaires < 0,08 à tous les retards de 1 à 48. Un motif répétable donnerait
à un balayage un « signal » qui n'existe que dans le générateur, et le premier
utilisateur qui le voit croirait que son idée fonctionne. Les autres gardes protègent le
produit ; celle-ci protège l'honnêteté de la démonstration.

**Et la garde jumelle, sur la variance.** L'autocorrélation mesure une dépendance dans la
MOYENNE des rendements : un changement de VARIANCE lui est invisible — 0,049 passait
pendant que l'escalier était là. La volatilité annoncée ne le voit pas non plus, c'est une
moyenne sur trois ans. La onzième garde mesure donc, toutes les douze bougies, le rapport
des volatilités réalisées sur les 240 bougies suivantes et les 240 précédentes, et exige
que **les dates des dix maxima s'étalent sur au moins trente jours** — 47,8 aujourd'hui,
deux sur l'escalier. Elle porte sur l'étalement et non sur la hauteur du rapport : un
seuil sur la hauteur interdirait la fonction (un régime de volatilité existe, c'est voulu)
en croyant interdire le défaut (qu'il soit synchrone). 240 bougies valent dix jours pour
une devise et trente-quatre pour une action — cette fenêtre compare deux régimes entiers,
et reste au-dessus de 1,8 quel que soit le lissage, mesuré sur cinq largeurs de fondu.

**Ce défaut ne se voit pas à l'œil, et on a perdu un tour à essayer.** Des fondus de 15,
45 et 75 jours donnaient des tracés indiscernables ; on en avait conclu qu'il n'y avait
rien. C'était mesurer la mauvaise grandeur : deux courbes indiscernables peuvent porter
des profils de variance opposés. La forme n'est pas la statistique.

## Le test qui tient la convention

`scripts/app/nom-vena.test.mjs` échoue si l'ancien nom réapparaît ailleurs que dans la
migration et l'import de sauvegarde, si un accent se glisse dans un chemin, une clé ou un
nom de fichier, ou si un fichier du dépôt reprend l'ancien nom.
