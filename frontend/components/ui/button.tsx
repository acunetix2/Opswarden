import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * primary: ink slab, cream text: the default commit action.
 * accent:  burnt-orange slab, ink text: reserved for the one action that matters
 *          most on a screen (start an investigation, approve).
 */
export type ButtonVariant = "primary" | "accent" | "success" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

/*
 * Soft, solid buttons: rounded, a 1px bottom edge for depth, a slight lift on
 * hover and a press on click. Colour carries intent: ink = default commit,
 * orange = the one key action, green = approve/confirm, red outline = reject.
 */
const base =
  "btn inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border font-medium " +
  "hover:-translate-y-px active:translate-y-0 " +
  // Disabled: keep pointer events so the "not allowed" cursor and tooltips show, but cancel hover motion.
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:brightness-100 select-none [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-canvas shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)] hover:bg-ink-2",
  accent: "border-brand-strong bg-brand text-on-brand shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:bg-brand-strong",
  success: "border-success bg-success text-canvas shadow-[inset_0_-1px_0_rgb(0_0_0/0.25)] hover:brightness-110",
  secondary: "border-line-strong bg-surface text-ink shadow-[0_1px_0_var(--color-line)] hover:border-ink-3 hover:bg-canvas",
  ghost: "border-transparent text-ink-2 hover:bg-surface-muted hover:text-ink hover:translate-y-0",
  danger: "border-danger/50 bg-surface text-danger shadow-[0_1px_0_var(--color-line)] hover:border-danger hover:bg-danger-soft",
  link: "border-0 text-brand-ink underline decoration-brand/40 underline-offset-4 hover:decoration-brand hover:translate-y-0 px-0! h-auto!",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13.5px]",
};

export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function ButtonLink({ href, variant = "primary", size = "md", icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonStyles(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
