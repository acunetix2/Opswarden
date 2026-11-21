/**
 * Client-side pre-checks for uploads. They give fast feedback only; the
 * backend re-validates extension, MIME type, signature, and size.
 */
export const ACCEPTED_EXTENSIONS = [".pdf", ".json", ".txt", ".png", ".jpg", ".jpeg"];
export const ACCEPT_ATTR = ".pdf,.json,.txt,.png,.jpg,.jpeg,application/pdf,application/json,text/plain,image/png,image/jpeg";
export const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export function precheckFile(file: File, maxBytes = DEFAULT_MAX_BYTES): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return "Use a PDF, JSON, TXT, PNG, or JPEG file.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxBytes) return `This file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
  return null;
}

export function isImage(file: { name: string }): boolean {
  return /\.(png|jpe?g)$/i.test(file.name);
}
