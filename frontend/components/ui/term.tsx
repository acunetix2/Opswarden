"use client";

import { useId, type ReactNode } from "react";

import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

/**
 * A word with a dotted underline that explains itself on hover or keyboard
 * focus. The definition is also linked via aria-describedby for screen readers.
 */
export function Term({ term, children }: { term: GlossaryTerm; children?: ReactNode }) {
  const id = useId();
  return (
    <span className="group/term relative inline-block">
      <button
        type="button"
        aria-describedby={id}
        className="cursor-help border-b border-dotted border-ink-3 text-inherit hover:border-ink focus-visible:outline-offset-1"
      >
        {children ?? term}
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-[10px] border border-line bg-surface px-3 py-2 text-left font-sans text-[12.5px] font-normal normal-case leading-snug tracking-normal text-ink-2 opacity-0 shadow-[0_12px_32px_rgb(17_17_17/0.16)] transition-opacity duration-150 group-hover/term:visible group-hover/term:opacity-100 group-focus-within/term:visible group-focus-within/term:opacity-100"
      >
        <span className="label mb-1 block text-brand-ink">{term}</span>
        {GLOSSARY[term]}
      </span>
    </span>
  );
}
