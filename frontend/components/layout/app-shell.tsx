"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useSession } from "@/store/hooks";

import { BottomNav } from "./bottom-nav";
import { Assistant } from "@/components/assistant/assistant";
import { cn } from "@/lib/cn";
import { useLocalStorage } from "@/lib/use-local-storage";

import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** Authenticated application frame. Redirects to /login without a session. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, error, retry, workspace, signOut } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  // Desktop sidebar: pinned open (content sits beside it) or collapsed to a rail that expands on hover.
  const [pinned, setPinned] = useLocalStorage("ow-sidebar-pinned", true);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "error") {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="w-full max-w-md">
          <ErrorState error={error} onRetry={retry} />
          <Button variant="ghost" size="sm" className="ml-3" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading OpsWarden">
        <div className="flex flex-col items-center gap-3">
          <LogoMark tone="dark" className="size-9" />
          <span className="h-px w-24 overflow-hidden bg-line-strong">
            <span className="block h-full w-1/3 animate-[ledger-load_1.1s_var(--ease-out)_infinite] bg-brand" />
          </span>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <EmptyState
          title="No workspace yet"
          description="Your account isn't a member of any workspace. Ask an administrator to add you."
          action={
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} pinned={pinned} onTogglePin={() => setPinned(!pinned)} />
      {/* Left padding tracks the sidebar width exactly, so pages stretch to it with no gap. */}
      <div className={cn("min-w-0 transition-[padding] duration-300 ease-[var(--ease-drawer)] print:pl-0", pinned ? "lg:pl-64" : "lg:pl-[72px]")}>
        <Topbar onOpenNav={() => setNavOpen(true)} />
        {/* key resets page-local state when the workspace changes */}
        <main id="main" key={workspace.id} className="w-full px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-6 lg:pb-12 print:p-0">
          {children}
        </main>
      </div>
      <BottomNav onMore={() => setNavOpen(true)} />
      <KeyboardShortcuts />
      <Assistant />
    </>
  );
}
