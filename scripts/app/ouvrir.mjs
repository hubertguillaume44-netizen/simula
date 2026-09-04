#!/usr/bin/env node
/**
 * Ouvre Sivula.dc.html dans un Chromium sans interface, pour pouvoir la TESTER
 * et pas seulement la relire.
 *
 * Deux obstacles, tous deux contournés ici sans rien changer à l'application :
 *
 *   1. `support.js` (le runtime DC) charge React, React-DOM et Babel depuis unpkg.com.
 *      Beaucoup de réseaux d'entreprise — et l'environnement d'exécution de cet agent —
 *      ne l'autorisent pas. On sert les MÊMES versions depuis node_modules, en
 *      interceptant les requêtes : l'application ne sait pas la différence.
 *      À installer une fois : npm i --no-save react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0
 *
 *   2. `_ds/…/_ds_bundle.js` et `styles.css` ne sont pas dans le dépôt. Vérifié :
 *      leur absence ne coûte que l'habillage, l'application démarre et fonctionne.
 *
 *   3. En `file://`, l'import dynamique de `./moteur.js` échoue : le runtime DC évalue
 *      le script dans un contexte dont la base est `about:blank`, et le spécificateur
 *      relatif n'y résout pas. Le moteur n'est alors JAMAIS chargé, et l'application
 *      échoue en silence sur `M.decouper`. On sert donc le dossier en HTTP local.
 *
 *   node scripts/app/ouvrir.mjs            # contrôle de santé
 *   node scripts/app/ouvrir.mjs --capture  # + capture d'écran
 */
import { chromium } from "playwright";
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const RACINE = path.resolve(new URL("../../", import.meta.url).pathname);

const CDN = {
  "react@18.3.1/umd/react.production.min.js": "node_modules/react/umd/react.production.min.js",
  "react-dom@18.3.1/umd/react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "@babel/standalone@7.29.0/babel.min.js": "node_modules/@babel/standalone/babel.min.js",
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".csv": "text/csv" };

/** Serveur statique local : indispensable, l'application charge son moteur en import(). */
function servir(racine) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const f = path.join(racine, rel);
      if (!f.startsWith(racine) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      res.end(readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

/** Chromium fourni par l'environnement, quand la version de Playwright ne colle pas. */
function binaire() {
  for (const p of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function ouvrirApp({ fichier = "Sivula.dc.html", attente = 5000, essai = true } = {}) {
  const manquants = Object.values(CDN).filter((f) => !existsSync(path.join(RACINE, f)));
  if (manquants.length) {
    throw new Error(
      "Dépendances du runtime absentes : " + manquants.join(", ") +
      "\nInstallez-les : npm i --no-save react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0",
    );
  }
  const { srv, port } = await servir(RACINE);
  const nav = await chromium.launch({ executablePath: binaire() });
  const page = await nav.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 300)));
  await page.route("https://unpkg.com/**", (route) => {
    const f = CDN[route.request().url().replace("https://unpkg.com/", "")];
    if (!f) return route.abort();
    route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(path.join(RACINE, f)) });
  });
  await page.goto(`http://127.0.0.1:${port}/${fichier}`, { waitUntil: "load" });
  await page.waitForTimeout(attente);
  if (essai) {
    // le bandeau d'accueil précède l'entrée dans l'application
    for (const nom of ["J'ai compris", "Essayer sans rien fournir"]) {
      await page.getByRole("button", { name: nom }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
  return { nav, page, erreurs, fermer: async () => { await nav.close(); srv.close(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const capture = process.argv.includes("--capture");
  const { page, erreurs, fermer } = await ouvrirApp();
  const etat = await page.evaluate(() => ({
    react: typeof window.React,
    onglets: [...document.querySelectorAll("button")].map((b) => b.innerText.trim())
      .filter((x) => x && x.length < 30).slice(0, 8),
    texte: (document.body.innerText || "").replace(/\s+/g, " ").trim().length,
  }));
  console.log("React        :", etat.react);
  console.log("texte rendu  :", etat.texte, "caractères");
  console.log("navigation   :", etat.onglets.join(" · "));
  const durs = erreurs.filter((e) => !/\{\{/.test(e));
  console.log("erreurs      :", durs.length ? durs.slice(0, 3) : "aucune (hors gabarits non liés)");
  await page.getByRole("button", { name: /Mes instruments/ }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  console.log("dépôt de CSV :", (await page.locator("input[type=file]").count()) + " champs");
  if (capture) { await page.screenshot({ path: "sivula.png", fullPage: false }); console.log("capture      : sivula.png"); }
  await fermer();
}
