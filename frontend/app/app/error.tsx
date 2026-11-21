"use client";

import { ErrorScreen } from "@/components/ui/error-screen";

/** Errors inside the app keep the sidebar and top bar usable. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} inline />;
}
