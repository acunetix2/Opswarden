/** Mirrors backend normalize_text(): lowercase, collapse whitespace. Used to spot unregistered names. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
