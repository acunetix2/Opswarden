"use client";

import type { ChangeEvent, ReactNode } from "react";

import { Dropdown, selectChangeEvent, useOptions } from "./dropdown";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
}

/** Options-array API over the custom dropdown. */
export function Select({ value, options, onChange, placeholder, disabled, className, label, error }: SelectProps) {
  return (
    <div className={className}>
      {label ? <span className="label mb-1.5 block">{label}</span> : null}
      <Dropdown
        value={value}
        options={options.map((o) => ({ ...o, text: o.label }))}
        onValueChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}

/** `<option>`-children API over the custom dropdown, compact size for filter bars. */
export function NativeSelect({
  id,
  value,
  onChange,
  children,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const options = useOptions(children);
  return (
    <Dropdown
      id={id}
      value={value}
      options={options}
      onValueChange={(v) => onChange(selectChangeEvent(v))}
      disabled={disabled}
      size="sm"
      className={className}
    />
  );
}
