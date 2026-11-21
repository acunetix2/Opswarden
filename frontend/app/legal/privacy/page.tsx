import type { Metadata } from "next";
import Link from "next/link";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal-doc";
import { SITE, SUBPROCESSORS } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy", description: "What personal data OpsWarden processes, why, and your rights." };

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are and our role",
    body: (
      <>
        <p>
          {SITE.legalName} provides OpsWarden. For account and website data we are the <strong>controller</strong>. For documents and records your
          organisation uploads (&ldquo;Customer Data&rdquo;) we act as a <strong>processor</strong> on your organisation&apos;s behalf, and your organisation
          decides how that data is used.
        </p>
        <p>
          Contact us at <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Data we process",
    body: (
      <>
        <h3>Account data</h3>
        <p>Name, work email address, role, workspace membership and sign-in records.</p>
        <h3>Customer Data</h3>
        <p>
          Uploaded purchase orders, invoices and delivery receipts, the fields extracted from them, findings, comments, supplier letters and their recipients,
          and the audit trail of actions. These may contain names and contact details of supplier staff.
        </p>
        <h3>Usage and technical data</h3>
        <p>Request logs (IP address, browser, time, request ID) kept for security, debugging and abuse prevention.</p>
        <h3>Messages to us</h3>
        <p>What you send when you email us or use the contact form.</p>
      </>
    ),
  },
  {
    id: "purposes",
    title: "Why we use it",
    body: (
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Legal basis</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Provide the service: sign-in, workspaces, analysis, approvals, email delivery</td><td>Contract</td></tr>
          <tr><td>Keep the service secure, prevent abuse, investigate incidents</td><td>Legitimate interests</td></tr>
          <tr><td>Support, service messages and important changes</td><td>Contract / legitimate interests</td></tr>
          <tr><td>Process Customer Data on your organisation&apos;s instructions</td><td>As processor for your organisation</td></tr>
          <tr><td>Meet legal obligations</td><td>Legal obligation</td></tr>
        </tbody>
      </table>
    ),
  },
  {
    id: "ai",
    title: "AI processing",
    body: (
      <p>
        Discrepancy detection does not use AI. If your workspace enables the optional AI features, letter drafts built from confirmed findings and help
        questions are sent to the configured AI provider to produce a response. Raw documents are not sent. We do not use Customer Data to train models.
      </p>
    ),
  },
  {
    id: "subprocessors",
    title: "Service providers (subprocessors)",
    body: (
      <>
        <p>We use these providers to run the service. Each is bound by contract to process data only on our instructions and to protect it.</p>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name}>
                <td>
                  {s.name}
                  {s.optional ? " (optional)" : ""}
                </td>
                <td>{s.purpose}</td>
                <td>{s.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        Some providers may process data outside your country. Where required, we rely on appropriate safeguards such as standard contractual clauses.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <ul>
        <li>Account data: while the account is active, then deleted or anonymised within 90 days unless your organisation keeps the workspace.</li>
        <li>Customer Data: for as long as your organisation keeps it in the workspace; deleted from active systems within 30 days after the workspace is closed.</li>
        <li>Security logs: up to 12 months.</li>
        <li>Backups roll off on the providers&apos; normal schedule.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>
          Depending on where you live, you may have the right to access, correct, delete, restrict or object to processing of your personal data, and to data
          portability. Email <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>. For Customer Data we will pass requests to the organisation
          that controls the workspace. You can also complain to your local data protection authority.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We protect data with workspace isolation, role-based access control, encryption in transit, encrypted storage at our providers and an audit
        trail. See our <Link href="/security">Security page</Link> for details.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <p>
        We use only what the app needs to work, such as keeping you signed in and remembering your theme. There is no advertising or cross-site tracking. See
        the <Link href="/legal/cookies">Cookie Policy</Link>.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>We will update this page when our practices change and note the date at the top. Material changes are announced in the app or by email.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      current="/legal/privacy"
      title="Privacy Policy"
      intro="What personal data OpsWarden processes, why, who helps us process it, and the choices you have."
      sections={SECTIONS}
    />
  );
}
