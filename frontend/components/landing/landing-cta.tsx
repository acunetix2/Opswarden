"use client";

import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useSession } from "@/store/hooks";

/** Session-aware primary action: "Open dashboard" when signed in, otherwise "Sign in". */
export function LandingCta({ size = "md", className, variant = "accent" }: { size?: "sm" | "md"; className?: string; variant?: "accent" | "primary" }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  return (
    <ButtonLink
      href={signedIn ? "/app/overview" : "/login"}
      size={size}
      variant={variant}
      className={cn("group", className)}
      iconRight={<ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />}
    >
      {signedIn ? "Open dashboard" : "Sign in"}
    </ButtonLink>
  );
}
