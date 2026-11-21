import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  CircleHelp,
  FileText,
  Mail,
  Newspaper,
  Scale,
  ShieldCheck,
} from "lucide-react";

export interface MenuLink {
  href: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

export type NavEntry = { label: string; href: string } | { label: string; items: MenuLink[] };

/** Top navigation: seven tabs, the last two open a menu. */
export const MAIN_NAV: NavEntry[] = [
  { label: "Product", href: "/product" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Use cases", href: "/use-cases" },
  { label: "Security", href: "/security" },
  { label: "Industries", href: "/industries" },
  {
    label: "Resources",
    items: [
      { href: "/resources", label: "Help center", description: "Guides for every step of a case", Icon: BookOpen },
      { href: "/resources#faq", label: "FAQ", description: "Answers to the questions people ask first", Icon: CircleHelp },
      { href: "/resources#glossary", label: "Glossary", description: "Three-way match, tolerance, exposure and more", Icon: Newspaper },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/about", label: "About", description: "Why OpsWarden exists and how we build it", Icon: Building2 },
      { href: "/contact", label: "Contact", description: "Talk to us about a pilot or get support", Icon: Mail },
      { href: "/legal", label: "Legal", description: "Terms, privacy, cookies and acceptable use", Icon: Scale },
    ],
  },
];

export const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Overview" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/industries", label: "Industries" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/use-cases#accounts-payable", label: "Accounts payable" },
      { href: "/use-cases#procurement", label: "Procurement teams" },
      { href: "/use-cases#finance-controllers", label: "Finance controllers" },
      { href: "/use-cases#audit", label: "Internal audit" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/resources", label: "Help center" },
      { href: "/resources#faq", label: "FAQ" },
      { href: "/resources#glossary", label: "Glossary" },
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create account" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/legal", label: "Legal center" },
    ],
  },
];

export const LEGAL_LINKS: { href: string; label: string; Icon: LucideIcon; summary: string }[] = [
  { href: "/legal/terms", label: "Terms of Service", Icon: FileText, summary: "The agreement for using OpsWarden." },
  { href: "/legal/privacy", label: "Privacy Policy", Icon: ShieldCheck, summary: "What personal data we process, why, and your rights." },
  { href: "/legal/cookies", label: "Cookie Policy", Icon: CircleHelp, summary: "The small amount of browser storage the app uses." },
  { href: "/legal/acceptable-use", label: "Acceptable Use Policy", Icon: Scale, summary: "What the service may and may not be used for." },
];
