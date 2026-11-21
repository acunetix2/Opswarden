"use client";

import { useEffect, useState } from "react";

import { ErrorState, Skeleton } from "@/components/ui/states";
import { toAppError, type AppError } from "@/lib/api-error";
import type { DocumentMeta } from "@/lib/types";
import { API_URL } from "@/store/api";
import { useAppSelector } from "@/store/hooks";

type Preview =
  | { kind: "text"; text: string }
  | { kind: "pdf" | "image"; url: string };

const FIXTURE_MARKER = "__OPSWARDEN_JSON__";

function formatText(raw: string, mime: string): string {
  const body = raw.includes(FIXTURE_MARKER) ? raw.split(FIXTURE_MARKER)[1] ?? raw : raw;
  if (mime === "application/json" || body.trim().startsWith("{")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Renders the private file fetched with the user's token. Uploaded content is
 * never executed: text is shown as text, PDFs in a sandboxed frame.
 */
export function DocumentPreview({ doc }: { doc: DocumentMeta }) {
  const token = useAppSelector((s) => s.session.token);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setPreview(null);
    setError(null);
    fetch(`${API_URL}/api/v1/documents/${doc.id}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) throw toAppError({ status: res.status, data: await res.json().catch(() => undefined) });
        if (doc.mime_type === "application/pdf" || doc.mime_type.startsWith("image/")) {
          url = URL.createObjectURL(await res.blob());
          if (!cancelled) setPreview({ kind: doc.mime_type === "application/pdf" ? "pdf" : "image", url });
        } else {
          const text = await res.text();
          if (!cancelled) setPreview({ kind: "text", text: formatText(text, doc.mime_type) });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toAppError(err));
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id, doc.mime_type, token, attempt]);

  if (error) return <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />;
  if (!preview) return <Skeleton className="h-[520px] w-full" />;

  if (preview.kind === "pdf") {
    return (
      <iframe
        src={preview.url}
        title={`Preview of ${doc.original_filename}`}
        sandbox=""
        className="h-[640px] w-full rounded-[12px] border border-line bg-surface"
      />
    );
  }
  if (preview.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={preview.url} alt={`Scanned ${doc.original_filename}`} className="w-full rounded-[12px] border border-line" />;
  }
  if (preview.kind === "text") {
    return (
      // Rendered like a printout with line numbers, so evidence can be pointed to.
      <div className="max-h-[640px] overflow-auto rounded-[12px] border border-line bg-canvas">
        <ol className="py-2 font-mono text-[12px] leading-[22px] text-ink-2">
          {preview.text.split("\n").map((line, i) => (
            <li key={i} className="grid grid-cols-[3rem_1fr] hover:bg-surface-muted/70">
              <span aria-hidden className="select-none border-r border-line pr-2 text-right text-ink-3/70">{i + 1}</span>
              <span className="whitespace-pre-wrap pl-3">{line || " "}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return null;
}
