// ————— L'APPLICATION NE DÉPEND DE RIEN D'EXTÉRIEUR —————
// Une fois /app chargé, rien ne doit partir vers un tiers. Trois dépendances le
// mettaient en défaut : React et React-DOM depuis unpkg.com, la feuille du système de
// design absente du dépôt, et la police importée depuis le service de Google par cette
// même feuille. Sur un produit payant, chacune coûte la même chose — un réseau
// d'entreprise qui bloque le domaine, une panne d'un tiers, et une visite signalée à
// chaque ouverture, ce que la promesse « rien ne sort de votre navigateur » interdit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const RACINE = new URL("../../", import.meta.url).pathname;
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8");
const DS = "public/_ds/industry-cbc1f2df-2f0f-4cb9-a754-a8a64e9401b6";

// Les portes ouvertes SUR DEMANDE : elles ne partent qu'avec une clé posée par
// l'utilisateur, et le tiroir Intendance les affiche une par une. Voir le brief des
// trois portes — ce sont les seules adresses externes tolérées dans le fichier.
const PORTES = ["finnhub.io", "api.mymemory.translated.net"];

test("React est vendoré, épinglé, et identique à ce que le CDN sert", () => {
  // c'est l'empreinte que `support.js` exigerait du CDN : la comparer prouve que la
  // copie du dépôt est le même octet pour octet, pas « une version de React »
  const SRI = {
    "vendor/react-18.3.1/react.production.min.js":
      "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z",
    "vendor/react-18.3.1/react-dom.production.min.js":
      "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1",
  };
  for (const [f, attendu] of Object.entries(SRI)) {
    assert.ok(existsSync(path.join(RACINE, f)), "fichier vendoré absent : " + f);
    const somme = "sha384-" + createHash("sha384")
      .update(readFileSync(path.join(RACINE, f))).digest("base64");
    assert.equal(somme, attendu, f + " ne correspond plus à l’empreinte attendue par support.js");
  }
  // une version EXACTE, pas une plage : un tiers qui publie ne doit pas casser le produit
  const src = lire("Vena.dc.html");
  assert.match(src, /react@18\.3\.1\/umd\/react\.production\.min\.js/);
  assert.ok(!/react@\^|react@~|react@latest/.test(src), "aucune plage de versions");
});

test("la substitution est posée AVANT le runtime, sans toucher au fichier généré", () => {
  const src = lire("Vena.dc.html");
  const iRes = src.indexOf("window.__resources = {");
  const iSup = src.indexOf('<script src="./support.js"></script>');
  assert.ok(iRes > 0 && iSup > 0 && iRes < iSup,
    "`__resources` doit être posé avant support.js, sinon le runtime part au CDN");
  // `support.js` porte « do not edit » : on ne le modifie pas, on utilise son point d’entrée
  assert.match(lire("support.js"), /const res = window\.__resources;/,
    "le point de substitution du runtime a changé de forme");
});

test("le fichier autonome n’a plus aucun chargement de tiers", () => {
  const solo = lire("Vena.solo.html");
  const urls = [...new Set(solo.match(/https?:\/\/[a-zA-Z0-9./@_:-]{4,90}/g) || [])];
  for (const u of urls) {
    const estPorte = PORTES.some((p) => u.includes(p));
    // les deux URL unpkg subsistent en CLÉS de la table de substitution : c’est ce que
    // le runtime cherche, et ce qu’on remplace. Elles ne sont jamais chargées.
    const estCle = /unpkg\.com\/react(-dom)?@18\.3\.1/.test(u)
      && solo.includes('"' + u + '":"') && solo.includes("var __R = {");
    assert.ok(estPorte || estCle, "chargement d’un tiers dans le fichier livré : " + u);
  }
  // et React voyage bien DANS le fichier
  assert.match(solo, /window\.__resources\[__u\] = URL\.createObjectURL/,
    "React doit être servi depuis une Blob URL, pas depuis un chemin voisin");
});

test("le système de design est dans le dépôt, polices comprises", () => {
  for (const f of ["styles.css", "_ds_bundle.js"]) {
    assert.ok(existsSync(path.join(RACINE, DS, f)), "absent de public/ : " + f);
  }
  const polices = readdirSync(path.join(RACINE, DS, "fonts")).filter((f) => f.endsWith(".woff2"));
  assert.ok(polices.length >= 8, "polices vendorées attendues, vu " + polices.length);
  // Barlow et Barlow Condensed, les deux familles que les jetons nomment
  for (const fam of ["Barlow-", "BarlowCondensed-"]) {
    assert.ok(polices.some((f) => f.startsWith(fam)), "famille absente : " + fam);
  }
});

test("la feuille de style ne va chercher aucune ressource dehors", () => {
  const css = lire(DS + "/styles.css");
  // elle arrivait avec un @import vers le service de polices de Google
  assert.ok(!/@import/.test(css), "un @import subsiste dans la feuille");
  assert.ok(!/https?:\/\//.test(css), "une URL externe subsiste dans la feuille");
  // chaque @font-face pointe sur un fichier du dépôt, et ce fichier existe
  const refs = [...css.matchAll(/url\((?!['"]?data:)['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 8, "les @font-face doivent pointer sur des fichiers locaux");
  for (const r of refs) {
    assert.ok(existsSync(path.join(RACINE, DS, r)), "police référencée mais absente : " + r);
  }
});

test("le chemin déclaré par l’application est celui où le fichier est publié", () => {
  // un chemin relatif qui marche en local peut ne pas résoudre sous /app
  const src = lire("Vena.dc.html");
  const declares = [...new Set((src.match(/_ds\/[^"']+/g) || []))];
  assert.ok(declares.length >= 2, "l’application doit déclarer la feuille et le paquet");
  for (const d of declares) {
    assert.ok(existsSync(path.join(RACINE, "public", d)),
      "déclaré par l’application mais absent de public/ : " + d);
  }
});
