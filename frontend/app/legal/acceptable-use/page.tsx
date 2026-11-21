import type { Metadata } from "next";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal-doc";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Acceptable Use Policy", description: "What OpsWarden may and may not be used for." };

const SECTIONS: LegalSection[] = [
  {
    id: "purpose",
    title: "Purpose",
    body: <p>This policy keeps OpsWarden safe and reliable for everyone. It applies to all users and forms part of the Terms of Service.</p>,
  },
  {
    id: "do-not",
    title: "You must not",
    body: (
      <ul>
        <li>Upload content you have no right to use, or that is unlawful, infringing or malicious (including malware).</li>
        <li>Use the service to defraud, mislead or harass suppliers or anyone else, or to send unsolicited bulk email.</li>
        <li>Try to access workspaces, accounts or data that aren&apos;t yours, or bypass permissions, rate limits or approval steps.</li>
        <li>Probe, scan or test the security of the service except as described in our responsible disclosure process.</li>
        <li>Overload the service, or use automated means to access it except through features we provide.</li>
        <li>Reverse engineer the service, or copy it to build a competing product.</li>
        <li>Upload special category data (for example health data) unless it is genuinely needed for an investigation and you have a legal basis.</li>
        <li>Rely on OpsWarden as the sole control for releasing payments where your policies require additional checks.</li>
      </ul>
    ),
  },
  {
    id: "supplier-messages",
    title: "Messages to suppliers",
    body: (
      <p>
        Letters sent through OpsWarden must be accurate, based on the evidence in the case, and approved by an authorised person. Do not use the service to
        make accusations of fraud; describe discrepancies factually.
      </p>
    ),
  },
  {
    id: "security-research",
    title: "Security research",
    body: (
      <p>
        We welcome good-faith reports. Email <a href={`mailto:${SITE.securityEmail}`}>{SITE.securityEmail}</a>, avoid accessing other people&apos;s data or
        disrupting the service, and give us reasonable time to fix issues before disclosure.
      </p>
    ),
  },
  {
    id: "enforcement",
    title: "Enforcement",
    body: (
      <p>
        We may remove content or suspend access that breaches this policy, and will explain why where we reasonably can. Serious or repeated breaches may lead
        to termination. Report misuse to <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
      </p>
    ),
  },
];

export default function AcceptableUsePage() {
  return <LegalDoc current="/legal/acceptable-use" title="Acceptable Use Policy" intro="What OpsWarden may and may not be used for." sections={SECTIONS} />;
}
