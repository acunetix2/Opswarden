import type { Metadata } from "next";
import { LifeBuoy, Mail, ShieldCheck } from "lucide-react";

import { ContactForm } from "@/components/marketing/contact-form";
import { MarketingShell, PageHero } from "@/components/marketing/marketing-shell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Book a walkthrough, start a pilot or get help with your OpsWarden workspace.",
};

const CHANNELS = [
  { Icon: Mail, title: "Sales and pilots", text: "Walkthroughs, pilots and pricing questions.", email: SITE.supportEmail },
  { Icon: LifeBuoy, title: "Support", text: "Help with your workspace, cases or sign-in.", email: SITE.supportEmail },
  { Icon: ShieldCheck, title: "Security and privacy", text: "Vulnerability reports and data requests.", email: SITE.securityEmail },
];

export default function ContactPage() {
  return (
    <MarketingShell>
      <PageHero eyebrow="Contact" title="Talk to us" intro="We usually reply within one business day." />
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:py-20">
        <ul className="space-y-3">
          {CHANNELS.map(({ Icon, title, text, email }) => (
            <li key={title} className="flex items-start gap-4 rounded-[18px] border border-line bg-surface p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-brand-tint text-brand-ink">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15.5px] font-semibold text-ink">{title}</span>
                <span className="block text-[14px] text-ink-2">{text}</span>
                <a href={`mailto:${email}`} className="mt-1 block truncate text-[14px] font-medium text-brand-ink hover:underline">
                  {email}
                </a>
              </span>
            </li>
          ))}
        </ul>
        <ContactForm />
      </div>
    </MarketingShell>
  );
}
