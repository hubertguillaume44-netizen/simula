// ————— LA VERSION AFFICHÉE EST UNE DATE, ET ELLE DIT LA VÉRITÉ —————
//
// `VERSION_APP` n'est pas un ornement du pied de page. Elle part avec chaque rapport
// d'avis et chaque fichier de diagnostic : c'est la seule chose qui dise quelle version
// l'utilisateur avait sous les yeux quand il a vu ce qu'il rapporte. Elle est restée à
// « 260905 » pendant que l'application changeait de fond en comble — la page de vente
// retirée, l'entrée déplacée, le tiroir refait — et chaque rapport reçu entre-temps
// annonçait une version qui n'existait plus.
//
// CE QUE CE TEST TIENT, et rien de plus :
//
//   · le format est une date lisible, pas un compteur qu'il faudrait traduire ;
//   · cette date existe, et n'est pas dans l'avenir ;
//   · l'artefact porte la MÊME que la source.
//
// CE QU'IL NE TIENT PAS, et ne peut pas tenir : que la date soit d'aujourd'hui. Rien
// dans un dépôt ne sait quand la prochaine livraison aura lieu, et un test qui exige
// « aujourd'hui » échouerait chaque lendemain sans qu'une ligne ait bougé. C'est
// `publier-solo.mjs` qui prévient, à la construction, quand la source a été écrite
// après la date qu'elle annonce — un avertissement, parce qu'un clone frais réécrit
// les dates de fichiers et qu'un arrêt y serait un piège.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RACINE = new URL("../../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, RACINE), "utf8");

/** La version que l'application affiche, telle qu'elle est écrite dans un fichier. */
function version(fichier) {
  const m = /VERSION_APP = '([^']+)'/.exec(lire(fichier));
  assert.ok(m, `${fichier} ne porte pas de VERSION_APP`);
  return m[1];
}

test("la version est une date AAMMJJ, pas un compteur", () => {
  const v = version("Vena.dc.html");
  assert.match(v, /^\d{6}$/, `« ${v} » n’est pas six chiffres`);
  const [aa, mm, jj] = [v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)].map(Number);
  assert.ok(mm >= 1 && mm <= 12, `mois ${mm} impossible dans « ${v} »`);
  assert.ok(jj >= 1 && jj <= 31, `jour ${jj} impossible dans « ${v} »`);
  // une date qui existe vraiment : le 31 février se serait glissé sans cette ligne
  const d = new Date(2000 + aa, mm - 1, jj);
  assert.equal(d.getMonth(), mm - 1, `« ${v} » n’est pas une date réelle`);
  assert.equal(d.getDate(), jj, `« ${v} » n’est pas une date réelle`);
});

test("la version n’est pas dans l’avenir", () => {
  // une faute de frappe se voit ici plutôt que dans un rapport d'avis six mois plus
  // tard : « 270912 » pour « 260912 » passerait tous les autres contrôles
  const v = version("Vena.dc.html");
  const n = new Date();
  const deux = (x) => String(x).padStart(2, "0");
  const aujourdHui = deux(n.getFullYear() % 100) + deux(n.getMonth() + 1) + deux(n.getDate());
  assert.ok(v <= aujourdHui,
    `la version annonce ${v}, or nous sommes le ${aujourdHui} — date postée à l’avance ?`);
});

test("l’artefact porte la même version que la source", () => {
  // `publier-solo.mjs` le vérifie aussi, mais à la construction seulement : un artefact
  // périmé commité dans le dépôt passerait inaperçu jusqu'au prochain déploiement.
  assert.equal(version("Vena.solo.html"), version("Vena.dc.html"),
    "Vena.solo.html annonce une autre version que Vena.dc.html — relancez npm run app:solo");
});

test("la version de l’application n’est pas celle du moteur", () => {
  // `MOTEUR_V` est une clé de cache : le changer PÉRIME des résultats enregistrés.
  // `VERSION_APP` est une étiquette : la changer ne périme rien. Les confondre ferait
  // recalculer tous les scans de tout le monde à chaque livraison.
  const src = lire("Vena.dc.html");
  const moteur = /MOTEUR_V = '([^']+)'/.exec(src);
  assert.ok(moteur, "MOTEUR_V a disparu");
  assert.notEqual(moteur[1], version("Vena.dc.html"), "les deux versions se sont confondues");
  assert.ok(!/signature\([^)]*\)\s*\{[^}]*VERSION_APP/.test(src),
    "VERSION_APP entre dans la signature de cache : une livraison périmerait tous les scans");
});
