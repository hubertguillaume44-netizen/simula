export const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const NUM = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function signedR(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "—";
  const abs = Math.abs(x).toFixed(digits).replace(".", ",");
  return `${x >= 0 ? "+" : "\u2212"} ${abs}`;
}

export function signedPct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "—";
  return `${signedR(x, digits)} %`;
}

export function frNum(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits).replace(".", ",");
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function sliceLabel(from: number, to: number): string {
  const y1 = new Date(from).getUTCFullYear();
  const y2 = new Date(to).getUTCFullYear();
  if (y1 === y2) return String(y1);
  return `${y1}–${String(y2).slice(2)}`;
}

export type VerdictTone = "up" | "warn" | "down" | "muted";

export function verdict(positifs: number, total: number): { label: string; tone: VerdictTone } {
  if (!total) return { label: "Insuffisant", tone: "muted" };
  if (positifs <= 1) return { label: "Probablement du bruit", tone: "down" };
  if (positifs <= 3) return { label: "À revoir", tone: "warn" };
  return { label: "Retenue", tone: "up" };
}

export const ENTREES_TXT: Record<string, string> = {
  croisement_ou_rebond: "Croisement ou rebond",
  croisement_prix: "Uniquement croisement",
  rebond: "Uniquement rebond",
  croisement_lignes: "Croisement de deux lignes",
  cassure: "Cassure d’un plus haut",
};

export const LIGNES_TXT: Record<string, string> = {
  ema: "MME (EMA)",
  ma: "MM (SMA)",
  mediane: "Médiane (Tenkan)",
};

export const UT_TXT: Record<string, string> = {
  H1: "H1",
  H4: "H4",
  D1: "D1",
};
