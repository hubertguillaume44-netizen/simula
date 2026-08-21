import { cn } from "@/lib/utils";
import { signedR, sliceLabel, verdict } from "@/lib/format";
import type { Segments } from "@/lib/types";

export function WalkForward({ segs }: { segs: Segments | null }) {
  if (!segs || !segs.detail.length) {
    return <p className="text-sm text-muted">Pas assez de trades pour decouper l historique.</p>;
  }
  return <div />;
}
