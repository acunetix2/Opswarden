"use client";

import {
  forwardRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

import { Dropdown, selectChangeEvent, useOptions } from "./dropdown";

const control =
  "w-full rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3/80 " +
  "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
  "focus-visible:border-ink-3 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(217_84_30/0.18)] " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-3 aria-invalid:border-danger";

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired for screen readers via ids. */
export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="label text-ink-2">
        {label}
        {required ? <span className="ml-1 text-brand-ink" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[12px] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
};

/**
 * Custom dropdown with the native select's API, so `<Select value onChange><option/></Select>`
 * call sites keep working. Height and width classes in `className` apply to the trigger.
 */
export function Select({ className, children, value, onChange, id, disabled, title, name, ...rest }: SelectProps) {
  const options = useOptions(children);
  const small = /\bh-(8|9)\b/.test(className ?? "");
  return (
    <Dropdown
      id={id}
      value={value}
      options={options}
      onValueChange={(v) => onChange(selectChangeEvent(v))}
      disabled={disabled}
      title={title}
      name={name}
      size={small ? "sm" : "md"}
      className={className}
      aria-describedby={rest["aria-describedby"]}
      aria-label={rest["aria-label"]}
    />
  );
}

/** Custom square checkbox row used for policies and toggles. */
export function Checkbox({ checked, onChange, label, description, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <label className={cn("group flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex size-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-4 cursor-pointer appearance-none rounded-[3px] border border-line-strong bg-surface transition-colors checked:border-ink checked:bg-ink group-hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
        <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute inset-0 size-4 scale-50 text-canvas opacity-0 transition-[opacity,scale] duration-150 peer-checked:scale-100 peer-checked:opacity-100">
          <path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      </span>
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? <span className="block text-[12px] text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}
