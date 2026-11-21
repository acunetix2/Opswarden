import { permanentRedirect } from "next/navigation";

/** The Integrations page was replaced by Industries; keep old links working. */
export default function IntegrationsPage() {
  permanentRedirect("/industries");
}
