import type { Metadata } from "next";
import { Eye, HeartHandshake, Lightbulb, Target } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { ClosingCta, InfoCard, MarketingShell, PageHero, Section } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: "About",
  description: "Why OpsWarden exists and the principles we build it by.",
};

const PRINCIPLES = [
  { Icon: Target, title: "Precise over clever", text: "Money questions deserve exact answers. Arithmetic is done by rules you can read, not by a model's guess." },
  { Icon: Eye, title: "Show the evidence", text: "Every claim the software makes points to the document and field behind it, so anyone can check it." },
  { Icon: HeartHandshake, title: "People stay in charge", text: "The software prepares; people decide. Nothing leaves the workspace without a recorded approval." },
  { Icon: Lightbulb, title: "Honest by default", text: "If something isn't connected or couldn't be read, the app says so instead of pretending it worked." },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="About"
        title="We help finance teams pay for what they actually received"
        intro="Billing mistakes are rarely dramatic. A few units short here, a price that crept up there. OpsWarden exists to catch them early, explain them clearly, and settle them on the record."
      />
      <Section title="What we believe">
        <div className="grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 60}>
              <InfoCard Icon={p.Icon} title={p.title}>{p.text}</InfoCard>
            </Reveal>
          ))}
        </div>
      </Section>
      <Section muted eyebrow="How we build" title="Small, careful and auditable">
        <Reveal className="max-w-3xl space-y-4 text-[16px] leading-relaxed text-ink-2">
          <p>
            OpsWarden is deliberately narrow. It compares three documents, records what disagrees, and helps you resolve it. It does not try to
            run your accounts payable process or replace your ERP.
          </p>
          <p>
            That focus lets us keep the important parts boring and reliable: workspace isolation on every request, a complete audit trail, and
            approval before anything is sent.
          </p>
        </Reveal>
      </Section>
      <ClosingCta title="Want to see it with your team?" text="Book a short walkthrough and we'll run a case end to end with you." />
    </MarketingShell>
  );
}
