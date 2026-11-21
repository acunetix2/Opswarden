import type { Metadata } from "next";
import {
  Building2,
  Factory,
  GraduationCap,
  HardHat,
  HeartPulse,
  Landmark,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { ClosingCta, MarketingShell, PageHero, Section } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: "Industries",
  description: "Where OpsWarden applies: any organisation that orders goods, receives them, and pays supplier invoices.",
};

interface Industry {
  id: string;
  Icon: LucideIcon;
  name: string;
  context: string;
  catches: string[];
  example: string;
}

const INDUSTRIES: Industry[] = [
  {
    id: "manufacturing",
    Icon: Factory,
    name: "Manufacturing",
    context: "Raw materials and components arrive in partial loads against large, long-running purchase orders.",
    catches: ["Invoices for full quantities when only part was delivered", "Unit prices above the contracted rate", "Components substituted under a different SKU"],
    example: "A steel order is delivered in three loads; the second invoice bills the full order again.",
  },
  {
    id: "retail",
    Icon: ShoppingBag,
    name: "Retail and e-commerce",
    context: "High volumes of restock orders from many suppliers, often with promotional pricing that expires.",
    catches: ["Short shipments billed in full", "Promotional prices not applied on the invoice", "The same invoice submitted twice"],
    example: "A seasonal restock arrives 12 cartons short, but the invoice matches the original order.",
  },
  {
    id: "construction",
    Icon: HardHat,
    name: "Construction",
    context: "Materials are delivered straight to sites, and delivery notes travel separately from invoices.",
    catches: ["Deliveries billed that the site never signed for", "Quantities that differ between the site note and the invoice", "Invoices without a matching PO reference"],
    example: "Concrete is invoiced for 40 m³ while the site's delivery note records 34 m³.",
  },
  {
    id: "healthcare",
    Icon: HeartPulse,
    name: "Healthcare and hospitals",
    context: "Consumables and medical supplies are reordered constantly across wards and departments.",
    catches: ["Backordered items invoiced before they arrive", "Price changes on recurring supplies", "Missing delivery receipts for high-value items"],
    example: "Surgical consumables are billed in full while half the order is still on backorder.",
  },
  {
    id: "hospitality",
    Icon: UtensilsCrossed,
    name: "Hospitality and food service",
    context: "Perishables arrive daily, and weights and substitutions vary from what was ordered.",
    catches: ["Weight shortfalls on produce and meat", "Substituted products charged at the original price", "Credit notes promised but never applied"],
    example: "A kitchen orders 20 kg of fish, receives 17 kg, and is invoiced for 20.",
  },
  {
    id: "logistics",
    Icon: Truck,
    name: "Logistics and distribution",
    context: "Goods pass through warehouses where receiving counts are the only record of what actually arrived.",
    catches: ["Invoiced quantities above warehouse receiving counts", "Duplicate invoices across depots", "Currency mismatches on cross-border suppliers"],
    example: "A pallet count at the depot is 46, but the supplier invoices 50.",
  },
  {
    id: "public-sector",
    Icon: Landmark,
    name: "Public sector and NGOs",
    context: "Every payment must be justified, and audits ask who approved what, and on what evidence.",
    catches: ["Payments without a complete set of documents", "Spend above the approved purchase order", "Approvals that weren't recorded"],
    example: "An auditor asks why an invoice was held; the case report shows the evidence and the sign-off.",
  },
  {
    id: "education",
    Icon: GraduationCap,
    name: "Education",
    context: "Campus procurement spans many departments buying equipment, furniture and supplies from shared vendors.",
    catches: ["Equipment billed but delivered to the wrong department", "Price drift on framework agreements", "Invoices that reference a closed PO"],
    example: "A lab orders 30 microscopes, 28 arrive, and the invoice bills 30.",
  },
  {
    id: "energy",
    Icon: Zap,
    name: "Energy, utilities and mining",
    context: "Spare parts and consumables are ordered for remote sites with long, fragmented delivery chains.",
    catches: ["Parts invoiced that never reached site", "Freight or surcharges added outside the PO", "Totals that don't add up line by line"],
    example: "An invoice total is higher than the sum of its own lines plus tax.",
  },
  {
    id: "property",
    Icon: Building2,
    name: "Property and facilities",
    context: "Maintenance supplies and fit-out materials are ordered by many people across many buildings.",
    catches: ["Materials billed to one site but delivered to another", "Repeat invoices for one-off works", "Quantities above what was ordered"],
    example: "Two facility managers receive the same invoice for one delivery of fittings.",
  },
];

const SCENARIOS: [string, string][] = [
  ["Short delivery", "Fewer units arrived than the invoice charges for."],
  ["Price creep", "The invoice unit price is above the agreed PO price."],
  ["Duplicate invoice", "The same invoice number is billed again."],
  ["Totals that don't add up", "Lines, subtotal, tax and total disagree."],
  ["Missing paperwork", "There's an invoice but no receipt, or no PO."],
  ["Wrong reference", "The invoice points at a different or unknown PO."],
];

export default function IndustriesPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Industries"
        title="Wherever goods are ordered, delivered and invoiced"
        intro="If your organisation raises purchase orders, receives goods and pays supplier invoices, the same three documents can disagree. OpsWarden finds where, and helps you settle it on the record."
      />

      <Section eyebrow="The common thread" title="The same six problems, in every sector" intro="The goods change from industry to industry. The ways the paperwork goes wrong don't.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map(([title, text], i) => (
            <Reveal key={title} delay={(i % 3) * 50}>
              <div className="h-full rounded-[16px] border border-line bg-surface p-5">
                <p className="text-[15.5px] font-semibold text-ink">{title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section muted eyebrow="By industry" title="Where teams use OpsWarden">
        {/* Quick jump links */}
        <nav aria-label="Industries" className="no-scrollbar -mt-4 mb-8 flex gap-2 overflow-x-auto pb-1">
          {INDUSTRIES.map((ind) => (
            <a key={ind.id} href={`#${ind.id}`} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
              {ind.name}
            </a>
          ))}
        </nav>

        <div className="grid gap-4 lg:grid-cols-2">
          {INDUSTRIES.map(({ id, Icon, name, context, catches, example }, i) => (
            <Reveal key={id} delay={(i % 2) * 60}>
              <article id={id} className="lift flex h-full scroll-mt-24 flex-col rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-brand-tint text-brand-ink">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{name}</h3>
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{context}</p>
                <p className="mt-4 text-[12.5px] font-medium text-ink-3">What OpsWarden catches</p>
                <ul className="mt-2 space-y-1.5">
                  {catches.map((c) => (
                    <li key={c} className="flex gap-2.5 text-[14px] leading-snug text-ink">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-5">
                  <span className="block rounded-[12px] border border-line bg-canvas/60 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
                    <span className="font-semibold text-ink">For example: </span>
                    {example}
                  </span>
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section eyebrow="Is it a fit?" title="OpsWarden works best when">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            "You raise purchase orders before buying goods",
            "Someone records what was actually received",
            "Supplier invoices arrive as PDFs or exports",
            "You want a person to approve every supplier dispute",
            "Auditors or managers ask why an invoice was held",
            "Overpayments are found late, or not at all",
          ].map((t, i) => (
            <Reveal key={t} delay={(i % 2) * 50}>
              <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 text-[14.5px] text-ink">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-[12px] font-semibold text-success">✓</span>
                {t}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <ClosingCta title="Recognise your own paperwork here?" text="Bring one real case to a walkthrough and we'll run it end to end with you." />
    </MarketingShell>
  );
}
