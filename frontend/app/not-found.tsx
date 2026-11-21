import { Home } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { BrandedMessage } from "@/components/ui/error-screen";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <BrandedMessage
        tone="neutral"
        eyebrow="Error 404"
        title="No record of this page"
        body="It doesn't exist, or it has moved."
        actions={
          <ButtonLink href="/app/overview" icon={<Home className="size-4" aria-hidden />}>
            Back to dashboard
          </ButtonLink>
        }
      />
    </main>
  );
}
