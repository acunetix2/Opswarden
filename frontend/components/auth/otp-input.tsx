"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all digits are filled (typed or pasted). */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * One box per digit. Typing moves forward, Backspace moves back, arrow keys
 * navigate, and pasting a full code fills every box. Works with phone SMS/email
 * autofill through autocomplete="one-time-code" on the first box.
 */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled, invalid, autoFocus }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function focus(i: number) {
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  }

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  }

  function onInput(i: number, raw: string) {
    // The value is kept gap-free: typing past the end appends, typing inside replaces.
    const at = Math.min(i, value.length);
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    if (typed.length > 1) {
      // Autofill or fast typing delivered several digits into one box.
      const merged = commit((value.slice(0, at) + typed).slice(0, length));
      focus(merged.length);
      return;
    }
    const next = commit(value.slice(0, at) + typed + value.slice(at + 1));
    focus(Math.min(at + 1, next.length));
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        commit(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const merged = commit(pasted);
    focus(merged.length);
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label={`${length}-digit verification code`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={length}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-12 w-full min-w-0 rounded-[10px] border bg-surface text-center font-mono text-[22px] font-semibold text-ink tabular",
            "transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(217_84_30/0.18)]",
            invalid ? "border-danger" : d ? "border-ink-3" : "border-line hover:border-line-strong focus-visible:border-ink-3",
            "disabled:cursor-not-allowed disabled:bg-surface-muted",
          )}
        />
      ))}
    </div>
  );
}
