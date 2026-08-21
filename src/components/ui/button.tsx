import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-display font-semibold text-sm tracking-wide transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed border border-transparent min-h-11 px-5",
  {
    variants: {
      variant: {
        primary: "bg-steel text-panel hover:bg-steel-ink",
        secondary: "border-line text-ink hover:bg-ink/5",
        ghost: "text-steel hover:bg-steel/10 border-transparent",
        danger: "bg-down text-panel hover:bg-down/90",
      },
      size: { default: "min-h-11 px-5", sm: "min-h-9 px-3 text-xs", lg: "min-h-12 px-6" },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);
export function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
