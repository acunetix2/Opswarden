"use client";

import "./globals.css";

/**
 * Last-resort boundary when the root layout itself fails. Kept dependency-free
 * (plain img, no app components) so it renders even if the app bundle is broken.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-canvas px-6">
        <div role="alert" className="w-full max-w-md rounded-[16px] border border-line bg-surface p-7 text-center shadow-[0_12px_40px_rgb(17_17_17/0.08)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OpsWarden" className="mx-auto size-20 object-contain" />
          <p className="mt-5 text-[12.5px] font-medium text-danger">Unexpected error</p>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">OpsWarden couldn&apos;t load</h1>
          <p className="mt-2 text-[13.5px] text-ink-2">Reload the page. If it keeps happening, check that the API is running.</p>
          {error.digest ? <p className="mt-2 font-mono text-[11px] text-ink-3">ref {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-9 cursor-pointer items-center rounded-[8px] bg-ink px-4 text-[13.5px] font-medium text-canvas hover:bg-ink-2"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
