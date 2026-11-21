import type { Metadata } from "next";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal-doc";

export const metadata: Metadata = { title: "Cookie Policy", description: "The browser storage OpsWarden uses and why." };

const STORAGE: [string, string, string, string][] = [
  ["opswarden.token", "Local storage", "Keeps you signed in (access token)", "Until you sign out or it expires"],
  ["opswarden.refresh", "Local storage", "Renews your session without signing in again", "Until you sign out"],
  ["opswarden.workspace", "Local storage", "Remembers the workspace you last opened", "Until cleared"],
  ["ow-theme", "Local storage", "Remembers light or dark mode", "Until cleared"],
  ["ow-sidebar-pinned", "Local storage", "Remembers whether the sidebar is collapsed", "Until cleared"],
  ["ow-saved-views:*", "Local storage", "Your saved case filters", "Until you delete them"],
  ["ow-getting-started-hidden:*", "Local storage", "Hides the getting-started checklist once dismissed", "Until cleared"],
];

const SECTIONS: LegalSection[] = [
  {
    id: "summary",
    title: "Summary",
    body: (
      <p>
        OpsWarden uses only strictly necessary browser storage to sign you in and remember a few preferences. We do not use advertising cookies, analytics
        trackers or cross-site tracking, so there is nothing to opt in to.
      </p>
    ),
  },
  {
    id: "what",
    title: "What we store",
    body: (
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {STORAGE.map(([name, type, purpose, duration]) => (
            <tr key={name}>
              <td><code>{name}</code></td>
              <td>{type}</td>
              <td>{purpose}</td>
              <td>{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: "third-party",
    title: "Third parties",
    body: (
      <p>
        Signing in contacts our authentication provider (Supabase) directly from your browser. It may set its own strictly necessary storage for that
        purpose. Fonts are served from our own domain.
      </p>
    ),
  },
  {
    id: "control",
    title: "Your choices",
    body: (
      <p>
        You can clear site data in your browser settings at any time. If you do, you will be signed out and your preferences will reset. Blocking this
        storage entirely will prevent sign-in.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return <LegalDoc current="/legal/cookies" title="Cookie Policy" intro="Short version: only what's needed to keep you signed in and remember your settings." sections={SECTIONS} />;
}
