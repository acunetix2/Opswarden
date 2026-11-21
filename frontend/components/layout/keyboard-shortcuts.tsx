"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/** "g" then a letter jumps to a page. Kept short and mnemonic. */
export const GO_TO: { key: string; href: string; label: string }[] = [
  { key: "o", href: "/app/overview", label: "Dashboard (overview)" },
  { key: "c", href: "/app/investigations", label: "Cases" },
  { key: "r", href: "/app/investigations?status=needs_review", label: "Cases needing review" },
  { key: "a", href: "/app/approvals", label: "Approvals" },
  { key: "f", href: "/app/findings", label: "Findings" },
  { key: "d", href: "/app/documents", label: "Documents" },
  { key: "s", href: "/app/suppliers", label: "Suppliers" },
  { key: "y", href: "/app/analytics", label: "Analytics" },
  { key: "e", href: "/app/exposure", label: "Exposure" },
  { key: "n", href: "/app/notifications", label: "Notifications" },
];

const OTHER: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Search cases and suppliers" },
  { keys: ["c"], label: "New investigation" },
  { keys: ["w"], label: "Ask Warden, the assistant" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["Esc"], label: "Close a dialog or menu" },
];

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function Kbd({ children }: { children: string }) {
  return <kbd className="inline-flex min-w-6 justify-center rounded-[6px] border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">{children}</kbd>;
}

/** Global shortcuts. Ignored while typing in a field or when a modifier is held. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingG = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (document.querySelector("dialog[open]") && e.key !== "?") return;
      const key = e.key.toLowerCase();

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const dest = GO_TO.find((g) => g.key === key);
        if (dest) {
          e.preventDefault();
          router.push(dest.href);
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
      } else if (key === "c" && !e.shiftKey) {
        e.preventDefault();
        router.push("/app/investigations/new");
      } else if (key === "w" && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new Event("ow:assistant"));
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("ow:shortcuts", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ow:shortcuts", onOpenRequest);
    };
  }, [router]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      className="m-auto w-[min(92vw,34rem)] overflow-hidden rounded-[14px] border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_rgb(17_17_17/0.22)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-6 pt-5 pb-4">
        <h2 id={titleId} className="text-[18px] font-semibold">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="pressable -mr-2 rounded-sm p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
        <section>
          <h3 className="label mb-2">Go to (press g, then)</h3>
          <ul className="space-y-1.5">
            {GO_TO.map((g) => (
              <li key={g.key} className="flex items-center gap-3 text-[13px] text-ink-2">
                <span className="flex gap-1"><Kbd>g</Kbd><Kbd>{g.key}</Kbd></span>
                {g.label}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="label mb-2">Anywhere</h3>
          <ul className="space-y-1.5">
            {OTHER.map((o) => (
              <li key={o.label} className="flex items-center gap-3 text-[13px] text-ink-2">
                <span className="flex gap-1">{o.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                {o.label}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">Shortcuts are paused while you type in a field.</p>
        </section>
      </div>
    </dialog>
  );
}
