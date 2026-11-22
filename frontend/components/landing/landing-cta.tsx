"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { usesSupabaseAuth } from "@/lib/supabase-auth";
import { useSession } from "@/store/hooks";

// Self-service sign-up uses the built-in accounts; with Supabase Auth people join by invitation.
const SIGNUP_ENABLED = !usesSupabaseAuth && process.env.NEXT_PUBLIC_ALLOW_SIGNUP !== "false";

/**
 * Session-aware primary action: "Open dashboard" when signed in. Otherwise
 * "Sign in", or "Create free account" when `signup` is set and sign-up is on.
 */
export function LandingCta({
  size = "md",
  className,
  variant = "accent",
  signup = false,
}: {
  size?: "sm" | "md";
  className?: string;
  variant?: "accent" | "primary";
  signup?: boolean;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const toSignup = signup && SIGNUP_ENABLED && !signedIn;
  return (
    <ButtonLink
      href={signedIn ? "/app/overview" : toSignup ? "/signup" : "/login"}
      size={size}
      variant={variant}
      className={cn("group", className)}
      iconRight={<ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />}
    >
      {signedIn ? "Open dashboard" : toSignup ? "Create free account" : "Sign in"}
    </ButtonLink>
  );
}

/** Quiet "Sign in" link shown next to the sign-up button, hidden once signed in. */
export function SignInLink({ className, light = false }: { className?: string; light?: boolean }) {
  const { status } = useSession();
  if (status === "authenticated" || !SIGNUP_ENABLED) return null;
  return (
    <Link
      href="/login"
      className={cn(
        "hidden rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors duration-300 sm:inline-flex",
        light ? "text-[#F3EEE3]/80 hover:text-[#F3EEE3]" : "text-ink-2 hover:text-ink",
        className,
      )}
    >
      Sign in
    </Link>
  );
}

export { SIGNUP_ENABLED };
