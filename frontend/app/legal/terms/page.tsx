import type { Metadata } from "next";
import Link from "next/link";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal-doc";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service", description: "The agreement that governs use of OpsWarden." };

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) form an agreement between {SITE.legalName} (&ldquo;OpsWarden&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) and the
          organisation or person that creates a workspace or uses the service (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;). By creating an account, accepting an
          invitation or using OpsWarden you agree to these Terms. If you accept on behalf of an organisation, you confirm you are authorised to bind it.
        </p>
        <p>If you have a separate signed agreement with us, that agreement takes precedence where it conflicts with these Terms.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "The service",
    body: (
      <>
        <p>
          OpsWarden compares procurement documents (purchase orders, delivery receipts and invoices), records discrepancies with evidence, and helps your
          team draft and approve messages to suppliers. We may improve and change the service over time. We will not materially reduce core functionality
          for a paid plan during its current term without notice.
        </p>
        <p>
          OpsWarden is a decision-support tool. It does not make or release payments, change bank details or ledgers, or provide legal, tax or accounting
          advice. You remain responsible for decisions you make and messages you approve.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and workspaces",
    body: (
      <ul>
        <li>You must give accurate account information and keep your credentials secure.</li>
        <li>Workspace administrators control membership and roles and are responsible for who they invite.</li>
        <li>You are responsible for activity under your workspace, and must tell us promptly about any unauthorised use.</li>
        <li>You must be at least 18 and use the service for business purposes.</li>
      </ul>
    ),
  },
  {
    id: "customer-data",
    title: "Your data",
    body: (
      <>
        <p>
          &ldquo;Customer Data&rdquo; means documents, records and content you or your users upload or create in the service. You keep all rights to Customer
          Data. You grant us a limited licence to host, process and display it only to provide, secure and support the service for you.
        </p>
        <p>
          You confirm you have the rights and any notices or consents needed to upload Customer Data. We process personal data within Customer Data as your
          processor, as described in our <Link href="/legal/privacy">Privacy Policy</Link>.
        </p>
        <p>You can export your data (CSV exports and case reports) at any time while your account is active.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <p>
        You agree to follow the <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>. We may suspend access that breaches it or that puts the
        service or other customers at risk, and will tell you why where we reasonably can.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <p>
        Discrepancy detection uses deterministic rules, not AI. Optional AI features rephrase supplier letters from confirmed findings and answer help
        questions. AI output can be wrong; review it before relying on it. We do not use your Customer Data to train AI models, and we instruct AI
        providers not to retain it beyond processing the request where their terms allow.
      </p>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <p>
        Paid plans are billed as set out in your order or plan page. Fees are exclusive of taxes. Unless agreed otherwise, subscriptions renew for the same
        term, and you can cancel at the end of the current term. Pilots and trials are provided as described when offered.
      </p>
    ),
  },
  {
    id: "confidentiality",
    title: "Confidentiality and security",
    body: (
      <p>
        Each party will protect the other&apos;s confidential information with at least reasonable care and use it only for this agreement. We maintain
        technical and organisational measures described on our <Link href="/security">Security page</Link>, including workspace isolation, access control,
        encryption in transit and an audit trail.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: (
      <p>
        We own the service, software and documentation. These Terms do not transfer any of our intellectual property to you. If you send feedback, we may use
        it without obligation to you.
      </p>
    ),
  },
  {
    id: "warranties",
    title: "Warranties and disclaimers",
    body: (
      <p>
        We will provide the service with reasonable skill and care. Apart from that, and to the extent permitted by law, the service is provided &ldquo;as
        is&rdquo; without warranties of any kind, including that every discrepancy will be found or that the service will be uninterrupted.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the extent permitted by law, neither party is liable for indirect or consequential losses, or for lost profits, revenue or data. Each
        party&apos;s total liability under these Terms is limited to the fees paid or payable by you in the 12 months before the claim. These limits do not
        apply to liability that cannot be limited by law, or to your payment obligations.
      </p>
    ),
  },
  {
    id: "term",
    title: "Term and termination",
    body: (
      <p>
        These Terms apply while you use the service. Either party may end them if the other materially breaches them and doesn&apos;t fix the breach within
        30 days of notice. After termination you can request an export of Customer Data for 30 days, after which we delete it from active systems, except
        where the law requires us to keep it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms. For material changes we will give reasonable notice by email or in the app before they take effect. Continuing to use
        the service after that means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <p>
        These Terms are the whole agreement on their subject. If a provision is unenforceable, the rest still applies. You may not assign these Terms
        without our consent, except as part of a merger or sale of your business. The governing law and courts are those stated in your order, or otherwise
        those of the place where {SITE.legalName} is established.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      current="/legal/terms"
      title="Terms of Service"
      intro="The agreement for using OpsWarden. We've kept it as plain as we can; the headings are a guide, the text is what applies."
      sections={SECTIONS}
    />
  );
}
