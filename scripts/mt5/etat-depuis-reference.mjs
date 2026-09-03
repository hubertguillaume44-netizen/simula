/**
 * Traduit une entrée de `references.mjs` en réglages `etat` pour `genererMQ5`.
 *
 * Ce fichier existe parce que les noms des drapeaux ne se devinent pas : le filtre de
 * tendance supérieure s'active par `btMtf`, celui de pente par `fPente`. Régénérer les
 * huit robots en retapant les réglages à la main a produit un GOLD SANS filtre (« fMtf »
 * au lieu de « btMtf », ignoré en silence) et un HongKong50 avec le mauvais recul. Le
 * robot mesurait alors 629 trades contre 510 au moteur — un écart qui n'existait que
 * dans l'export. `filtresAttendus` ferme la porte : l'en-tête généré doit le répéter mot
 * pour mot, sinon `genererRobot` refuse le fichier.
 */
import { genererMQ5, nomRobot } from "../../robot-mt5.js";
import { PALIERS_REFERENCE } from "./references.mjs";

export function etatDepuisReference(ref) {
  const etat = { btBE: true, typeSecu: "be_progressif", btSens: ref.sens || "achat", btDureeMax: 0 };
  for (const f of ref.filtres || []) {
    if (f.type === "pente") {
      Object.assign(etat, {
        fPente: true, utPente: f.ut, lignePente: f.ligne,
        periodeMtf: f.periode, fPenteRecul: f.recul,
      });
    } else if (f.type === "tendance_mtf") {
      Object.assign(etat, { btMtf: true, utMtf: f.ut, ligneMtf: f.ligne, periodeMtf: f.periode });
    } else {
      throw new Error(`filtre « ${f.type} » non transposé : le robot serait généré sans lui`);
    }
  }
  return etat;
}

/** Rend { nom, source }. Lève si l'en-tête ne répète pas `filtresAttendus`. */
export function genererRobot(ref, stamp) {
  const cfg = {
    sym: ref.sym, sens: ref.sens || "achat", entree: ref.entree, ligne: ref.ligne,
    periode: ref.periode, sl: ref.sl, rr: ref.rr, ut: "D1",
    n: ref.nSivula, total: ref.rSivula, rAn: ref.rSivula / 6.65, dd: 2,
  };
  const source = genererMQ5(cfg, {
    etat: etatDepuisReference(ref), stamp, magic: ref.magic,
    paliers: PALIERS_REFERENCE, spreadMaxPct: ref.spreadReleve,
  });
  const ligne = source.match(/Filtres générés : (.*)/);
  const obtenu = (ligne ? ligne[1] : "").trim();
  if (ref.filtresAttendus && obtenu !== ref.filtresAttendus) {
    throw new Error(
      `${ref.sym}${ref.variante ? " " + ref.variante : ""} : filtres générés « ${obtenu} » `
      + `au lieu de « ${ref.filtresAttendus} » — un réglage n'a pas été transposé`,
    );
  }
  return { nom: nomRobot(cfg, stamp) + ".mq5", source };
}
