#!/usr/bin/env python3
"""
Lit la table « Transactions » d'un rapport du testeur MT5 exporté en PDF et en écrit
un TSV que le harnais JavaScript sait comparer au moteur.

Le PDF est le seul format que MT5 produit à l'impression du rapport ; `parse-mt5.mjs`
lit le HTML, pas lui. Les colonnes se retrouvent en ancrant sur la direction
(`in` / `out`) et NON sur des décalages fixes depuis l'horodatage : quand le symbole
commence par « # » — #HongKong50, #Japan225 — l'extraction de texte le colle au numéro
d'ordre (« 2 #HongKong50 » sur une seule ligne), tout décale d'un cran et la table
ressort vide sans la moindre erreur.

Usage : rapport-pdf.py <rapport.pdf> <sortie.tsv>
Le total net écrit en fin de TSV est comparé au « Profit Total Net » de l'en-tête ;
un écart lève, plutôt que de livrer une table silencieusement tronquée.
"""
import re
import sys

import pymupdf

HORODATAGE = re.compile(r"\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}")


def nombre(txt):
    """« -2 608.55 » → -2608.55 ; espaces fines et insécables comprises."""
    try:
        return float(txt.replace(" ", "").replace(" ", "").replace(" ", ""))
    except ValueError:
        return None


def lignes_du_pdf(chemin):
    doc = pymupdf.open(chemin)
    out = []
    for page in range(doc.page_count):
        out += [x.strip() for x in doc[page].get_text().split("\n")]
    return out


def profit_annonce(lignes):
    for i, x in enumerate(lignes):
        if x.startswith("Profit Total Net"):
            return nombre(lignes[i + 1])
    return None


def operations(lignes):
    """Une opération par (buy|sell, in|out) : les 8 colonnes qui suivent la direction."""
    debut = next(i for i, x in enumerate(lignes) if x == "Transactions")
    ops = []
    for j in range(debut, len(lignes) - 9):
        if lignes[j] not in ("in", "out") or lignes[j - 1] not in ("buy", "sell"):
            continue
        horo = next((lignes[k] for k in range(j, max(debut, j - 6), -1)
                     if HORODATAGE.fullmatch(lignes[k])), None)
        if horo is None:
            continue
        ops.append({
            "t": horo, "sens": lignes[j - 1], "dir": lignes[j],
            "prix": nombre(lignes[j + 2]), "comm": nombre(lignes[j + 4]) or 0.0,
            "swap": nombre(lignes[j + 5]) or 0.0, "profit": nombre(lignes[j + 6]) or 0.0,
            "com": lignes[j + 8],
        })
    return ops


def contexte(lignes):
    """Le symbole sur lequel le test a tourné, et le robot qui l'a exécuté.

    MT5 lance l'expert sur le SYMBOLE DU GRAPHIQUE, pas sur celui que son nom annonce.
    Un robot HongKong50 déposé sur un graphique Germany40 tourne sans broncher et rend un
    rapport d'apparence normale : 94 trades au lieu de 67, dix journées communes sur 94,
    et la conclusion — à tort — qu'une correction récente avait tout cassé.
    """
    texte = "\n".join(lignes)
    expert = re.search(r"Sivula_\S*?_\d{6}_\w+", texte)
    symbole = re.search(r"Symbole:\s*\n?\s*([A-Za-z#][\w#.]{1,24})", texte)
    if not expert or not symbole:
        return None
    attendu = expert.group(0).split("_")[1]
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
    return expert.group(0), symbole.group(1), attendu, norm(attendu) in norm(symbole.group(1))


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    lignes = lignes_du_pdf(sys.argv[1])
    ctx = contexte(lignes)
    if ctx and not ctx[3]:
        sys.exit(f"Le robot « {ctx[0]} » a tourné sur le symbole {ctx[1]} : MT5 exécute "
                 f"l'expert sur le symbole DU GRAPHIQUE. Ce rapport ne décrit pas {ctx[2]} "
                 f"— rejouez le test sur un graphique {ctx[2]}.")
    ops = operations(lignes)
    entrees = [o for o in ops if o["dir"] == "in"]
    sorties = [o for o in ops if o["dir"] == "out"]
    if len(entrees) != len(sorties):
        sys.exit(f"table incohérente : {len(entrees)} entrées pour {len(sorties)} sorties")

    net = sum(o["profit"] + o["comm"] + o["swap"] for o in ops)
    annonce = profit_annonce(lignes)
    if annonce is not None and abs(net - annonce) > 0.05:
        sys.exit(f"total lu {net:.2f} € ≠ « Profit Total Net » {annonce:.2f} € — table tronquée")

    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        fh.write("entree_t\tentree\tsortie_t\tsortie\tmotif\tcommission\tswap\tprofit\n")
        for a, b in zip(entrees, sorties):
            motif = "tp" if b["com"].startswith("tp") else "sl" if b["com"].startswith("sl") else b["com"]
            fh.write(f"{a['t']}\t{a['prix']}\t{b['t']}\t{b['prix']}\t{motif}"
                     f"\t{a['comm'] + b['comm']}\t{a['swap'] + b['swap']}\t{b['profit']}\n")
    print(f"{len(entrees)} trades   net {net:.2f} €   (en-tête : {annonce:.2f} €)")


if __name__ == "__main__":
    main()
