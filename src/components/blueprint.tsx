import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Blueprint({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("blueprint", className)}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {children}
    </div>
  );
}
