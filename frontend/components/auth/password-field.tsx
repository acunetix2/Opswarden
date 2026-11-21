"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** Mirrors backend/app/core/security.py password_problem(). The server re-checks. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (new TextEncoder().encode(pw).length > 72) return "Use at most 72 bytes.";
  if (/^[A-Za-z]+$/.test(pw) || /^\d+$/.test(pw)) return "Mix letters with numbers or symbols.";
  return null;
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "new-password" | "current-password";
  /** Show live policy feedback (for new passwords). */
  checkPolicy?: boolean;
  error?: string | null;
}

export function PasswordField({ id, label, value, onChange, autoComplete, checkPolicy, error }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const problem = checkPolicy && value ? passwordProblem(value) : null;
  const shownError = error ?? null;
  return (
    <Field
      label={label}
      htmlFor={id}
      error={shownError}
      hint={checkPolicy ? (problem ? problem : value ? "Looks good." : "At least 10 characters, mixing letters with numbers or symbols.") : undefined}
    >
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
          aria-invalid={Boolean(shownError) || undefined}
          aria-describedby={shownError ? `${id}-error` : checkPolicy ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className={cn("absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-3 hover:text-ink")}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </Field>
  );
}
