"use client";

import Link from "next/link";
import { Keyboard, Menu, Moon, Settings, Sun } from "lucide-react";

import { useTheme } from "@/lib/use-theme";
import { useWorkspace } from "@/store/hooks";

import { GlobalSearch } from "./global-search";
import { NotificationsMenu } from "./notifications-menu";

const iconBtn =
  "pressable grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink";

/** Top bar: search with suggestions on the left; theme, notifications and settings on the right. */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { can } = useWorkspace();
  const { dark, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-md print:hidden">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenNav} className={`${iconBtn} lg:hidden`} aria-label="Open navigation">
          <Menu className="size-4" aria-hidden />
        </button>

        <GlobalSearch />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className={iconBtn}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            title={dark ? "Light mode" : "Dark mode"}
            aria-pressed={dark}
          >
            {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </button>
          <NotificationsMenu />
          {can("manage_workspace") ? (
            <Link href="/app/settings" className={iconBtn} aria-label="Settings" title="Settings">
              <Settings className="size-4" aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={() => window.dispatchEvent(new Event("ow:shortcuts"))} className={`${iconBtn} max-sm:hidden`} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
              <Keyboard className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
