# Mesurer le bridage d'un onglet caché — à la main, dans un vrai Chrome

## Pourquoi pas Playwright

Playwright lance Chromium avec `--disable-background-timer-throttling`,
`--disable-backgrounding-occluded-windows` et `--disable-renderer-backgrounding` :
il désactive exactement ce qu'il faudrait observer. Un test qui y passe ne prouve
rien. `scripts/app/cession-fil.test.mjs` vérifie donc l'INVARIANT DE CODE — plus
aucun `setTimeout` dans les deux boucles de cession — et la mesure du bridage se
fait ici, à la main.

## La manip

1. Ouvrir Sivula dans **Chrome**, un onglet ordinaire (pas une fenêtre réduite :
   c'est `document.hidden` qui compte, et réduire la fenêtre ne le met pas toujours
   à `true` — il faut un AUTRE onglet devant, dans la même fenêtre).
2. Ouvrir la console (⌥⌘J) et coller le bloc ci-dessous.
3. Laisser tourner **une minute onglet visible** : noter les deux cadences.
4. Passer sur un autre onglet et l'y laisser **six minutes au moins** — le bridage
   « intensif » de Chrome (une minuterie par minute) ne s'installe qu'après cinq.
5. Revenir : la console a gardé toutes les lignes, chacune marquée `VISIBLE` ou
   `CACHÉ`. Comparer les lignes `CACHÉ` de la sixième minute aux lignes `VISIBLE`
   du début.

Attendu : la cadence `minuterie` s'écroule quand l'onglet est caché — d'abord à
1 tour/s, puis vers 0,02 tour/s après cinq minutes — pendant que la cadence
`canal` tient. C'est cet écart qui décidait, avant, de la durée d'un scan.

## Le bloc à coller

```js
(() => {
  // Les deux façons de rendre la main, mesurées L'UNE APRÈS L'AUTRE et jamais en
  // même temps : une boucle de canal serrée affamerait les minuteries, et l'écart
  // mesuré ne voudrait plus rien dire.
  const canal = new MessageChannel(); const file = [];
  canal.port2.onmessage = () => { const f = file.shift(); if (f) f(); };
  const parCanal = () => new Promise((r) => { file.push(r); canal.port1.postMessage(0); });
  const parMinuterie = () => new Promise((r) => setTimeout(r, 0));
  const fmt = (n) => (n >= 100 ? Math.round(n) : n.toFixed(2));
  (async () => {
    for (;;) {
      for (const [nom, ceder] of [['minuterie', parMinuterie], ['canal', parCanal]]) {
        const t0 = performance.now(); let n = 0;
        // une phase dure au moins 10 s de temps réel — bridée, un seul tour peut
        // prendre une minute, et la phase durera donc une minute : c'est voulu,
        // la cadence est calculée sur le temps réellement écoulé.
        while (performance.now() - t0 < 10000) { await ceder(); n++; }
        const s = (performance.now() - t0) / 1000;
        console.log(new Date().toLocaleTimeString('fr-FR'),
          document.hidden ? 'CACHÉ  ' : 'VISIBLE', '·', nom.padEnd(9),
          fmt(n / s) + ' tours/s', '(' + n + ' tours en ' + s.toFixed(1) + ' s)');
      }
    }
  })();
  console.log('mesure lancée — laissez tourner, puis passez sur un autre onglet 6 minutes');
})();
```

## Les deux chiffres à relever

|                        | minuterie (`setTimeout 0`) | canal (`MessageChannel`) |
|------------------------|---------------------------|--------------------------|
| onglet visible         |                           |                          |
| onglet caché, 6e minute|                           |                          |

Le tableau reste vide tant que la mesure n'a pas été faite sur une vraie machine :
l'environnement d'exécution de l'agent n'a ni écran ni Chrome de bureau.

## Ce qui a été tenté depuis l'agent, et pourquoi ça ne suffit pas

Chromium relancé SANS les trois options (`ignoreDefaultArgs`), avec un second onglet
mis devant par `bringToFront()` : `document.hidden` de la page mesurée reste **false**,
et la cadence ne bouge pas en sept minutes. En headless, un onglet au second plan
n'est pas un onglet caché — il n'y a rien à brider, donc rien à observer. La mesure
n'a donc pas été faite ; le tableau ci-dessus attend un vrai Chrome.

Ce même essai donne en revanche un chiffre utile, celui des deux mécanismes NON
bridés, sur la même machine :

| cession                    | tours/s, onglet visible |
|----------------------------|-------------------------|
| `setTimeout(0)`            | ~240                    |
| `MessageChannel`           | ~138 000                |

Les 240 tours/s sont le plancher de 4 ms qu'impose la spécification aux minuteries
imbriquées : même sans aucun bridage, la minuterie était déjà 580 fois plus lente.
Le bridage d'un onglet caché s'ajoute à ça — il ne le crée pas.
