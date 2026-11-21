/**
 * Built-in brain for the "Warden" help assistant.
 *
 * Pure and deterministic: it maps a message to an answer, optional links and an
 * optional navigation target, using live workspace data passed in by the widget
 * (counts, cases, findings, approvals). It never performs actions; it explains,
 * looks things up and links. Questions it can't match return `matched: false`
 * and the widget may ask the backend model instead.
 *
 * What makes it useful rather than a keyword menu:
 *  - typo tolerance (one-letter slips in key words are corrected),
 *  - real lookups: cases by number/PO/supplier/title, findings by severity or
 *    value, approvals by waiting time, stale cases, the user's own cases,
 *  - page awareness: on a case page, "what's wrong here?" summarises that case,
 *  - follow-ups: "open it" / "take me there" opens the last thing it showed.
 *
 * Unit-tested in tests/assistant.test.ts.
 */
import { GLOSSARY, type GlossaryTerm } from "./glossary.ts";

export interface AssistantLink {
  label: string;
  href: string;
}

export interface AssistantReply {
  text: string;
  links?: AssistantLink[];
  /** Navigate here right after replying (only for explicit "go to" requests). */
  navigate?: string;
  suggestions?: string[];
  matched: boolean;
}

export interface AssistantCase {
  id: string;
  case_number: string;
  title: string;
  supplier_name: string | null;
  supplier_reference: string | null;
  status: string;
  owner_user_id?: string;
  owner_name?: string | null;
  finding_count?: number;
  updated_at?: string;
}

export interface AssistantFinding {
  id: string;
  case_id: string;
  case_number: string;
  supplier_name: string | null;
  title: string;
  severity: string;
  status: string;
  impact_amount: string | null;
  currency: string | null;
}

export interface AssistantApproval {
  id: string;
  case_id: string;
  case_number: string | null;
  supplier_name: string | null;
  subject: string | null;
  status: string;
  created_at: string;
}

export interface AssistantContext {
  pathname: string;
  canCreate: boolean;
  canReview: boolean;
  canApprove: boolean;
  canManage: boolean;
  userId?: string;
  counts?: {
    pendingApprovals: number;
    needsReview: number;
    openCases: number;
    openFindings: number;
    exposure: string;
  };
  cases?: AssistantCase[];
  findings?: AssistantFinding[];
  approvals?: AssistantApproval[];
  /** Links from Warden's previous answer, for "open it" follow-ups. */
  lastLinks?: AssistantLink[];
  /** Clock override for tests. */
  now?: number;
}

export const STARTER_SUGGESTIONS = [
  "What needs my attention?",
  "What should I do on this page?",
  "Show high-severity findings",
  "Which approvals are waiting longest?",
];

const CAPABILITIES = [
  "• Tell you what needs your attention right now",
  "• Find a case by number, PO reference, supplier or title",
  "• List cases that need review, your cases, or cases with no recent activity",
  "• Show high-severity or highest-value findings",
  "• Show approvals that have waited longest",
  "• Summarise the case you're looking at",
  "• Explain any page, term or step, and take you there",
].join("\n");

/* ------------------------------------------------------------------ text utils */

const VOCAB = [
  "approvals", "approval", "approve", "findings", "finding", "documents", "document", "suppliers", "supplier",
  "analytics", "exposure", "dashboard", "settings", "notifications", "investigations", "investigation", "analysis",
  "analyze", "analyse", "dismiss", "confirm", "upload", "resolve", "archive", "invite", "export", "shortcuts",
  "severity", "delivery", "invoice", "receipt", "purchase", "review", "critical", "highest", "biggest", "waiting",
  "oldest", "engine", "report", "attention", "pending", "summary", "activity",
  // Real words near the ones above, listed so they are never "corrected" into them.
  "resolved", "approved", "confirmed", "dismissed", "archived", "delivered", "reviewed", "reviewer", "reviewers",
  "contributor", "invited", "exported", "uploaded", "analyst", "invoices", "receipts", "reports", "engines",
];

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Corrects one-letter slips (or two in long words) in key product words: "aprovals" -> "approvals". */
function fixTypos(t: string): string {
  return t
    .split(" ")
    .map((w) => {
      if (w.length < 5 || VOCAB.includes(w)) return w;
      let best: string | null = null;
      let bestD = (w.length >= 8 ? 2 : 1) + 1; // must beat this
      for (const v of VOCAB) {
        const d = levenshtein(w, v);
        if (d < bestD) {
          best = v;
          bestD = d;
        }
      }
      return best ?? w;
    })
    .join(" ");
}

function normalize(s: string) {
  const base = s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9&\-\s]/g, " ").replace(/\s+/g, " ").trim();
  return ` ${fixTypos(base)} `;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function parseIso(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
}

function ago(iso: string, now: number) {
  const h = Math.max(0, Math.round((now - parseIso(iso)) / 3_600_000));
  if (h < 1) return "under an hour";
  if (h < 24) return plural(h, "hour");
  return plural(Math.round(h / 24), "day");
}

const SEVERITY_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const ACTIVE = (f: AssistantFinding) => f.status !== "dismissed";
const CLOSED = new Set(["resolved", "archived"]);

/* ---------------------------------------------------------------------- routes */

interface Route {
  href: string;
  name: string;
  phrases: string[];
  admin?: boolean;
}

/** Longest, most specific phrases first so "ready to approve" beats "approve". */
const ROUTES: Route[] = [
  { href: "/app/investigations/new", name: "New investigation", phrases: ["new investigation", "new case", "create a case", "create case", "open a case", "start a case", "start an investigation", "create an investigation"] },
  { href: "/app/investigations?status=needs_review", name: "Cases that need review", phrases: ["cases that need review", "cases to review", "need review", "needs review", "review queue"] },
  { href: "/app/investigations?status=ready_for_approval", name: "Cases ready to approve", phrases: ["ready to approve", "ready for approval"] },
  { href: "/app/investigations?status=resolved", name: "Resolved cases", phrases: ["resolved cases", "closed cases", "resolved"] },
  { href: "/app/activity", name: "Activity log", phrases: ["activity log", "audit trail", "audit log", "audit", "activity"], admin: true },
  { href: "/app/exposure", name: "Exposure", phrases: ["money in dispute", "value at stake", "exposure"] },
  { href: "/app/analytics", name: "Analytics", phrases: ["analytics", "trends", "charts", "statistics", "stats"] },
  { href: "/app/approvals", name: "Approvals", phrases: ["approvals", "approval queue", "sign off", "sign-off", "approval"] },
  { href: "/app/findings", name: "Findings", phrases: ["findings", "discrepancies", "mismatches", "finding"] },
  { href: "/app/documents", name: "Documents", phrases: ["documents", "document", "files", "uploads", "docs"] },
  { href: "/app/suppliers", name: "Suppliers", phrases: ["suppliers", "supplier", "vendors", "vendor"] },
  { href: "/app/notifications", name: "Notifications", phrases: ["notifications", "alerts", "inbox"] },
  { href: "/app/team", name: "Team & access", phrases: ["team", "members", "people", "users"] },
  { href: "/app/settings", name: "Settings", phrases: ["settings", "tolerances", "tolerance", "policy", "policies", "configuration"], admin: true },
  { href: "/app/overview", name: "Dashboard", phrases: ["dashboard", "overview", "home page", "home"] },
  { href: "/app/investigations", name: "Cases", phrases: ["all cases", "case list", "investigations", "cases"] },
];

const NAV_VERB = /\b(go to|goto|go back to|open|take me|bring me|show me|navigate|jump to|switch to|bring up|visit)\b/;
const QUESTION = /^(how|what|why|when|who|can|could|should|is|are|do|does|where do|where can|which)\b/;

function findRoute(t: string, ctx: AssistantContext): Route | undefined {
  return ROUTES.find((r) => (!r.admin || ctx.canManage) && r.phrases.some((p) => t.includes(` ${p} `)));
}

/* ------------------------------------------------------------------- knowledge */

const AGENT_TEXT =
  "The OpsWarden agent works inside each case. Open a case and press Run analysis in the Analysis engine panel under the title; it then reads the purchase order, delivery receipt and invoice, " +
  "extracts their fields, compares them line by line (a three-way match), and records every mismatch as a finding that points to the exact document field. " +
  "You can watch it work in the progress panel on the case page, and its steps are logged as agent events in the activity trail. " +
  "It never sends emails, changes payments or makes decisions: people confirm findings and approve every supplier email. " +
  "If an AI model is configured, it can also rephrase the supplier email draft, keeping every fact unchanged.";

interface Topic {
  test: RegExp;
  answer: (ctx: AssistantContext) => Omit<AssistantReply, "matched">;
}

const TOPICS: Topic[] = [
  {
    test: /\b(start|create|open|new|make)\b.*\b(case|investigation)\b|\bnew (case|investigation)\b/,
    answer: (ctx) => ({
      text: ctx.canCreate
        ? "Go to Cases and press New investigation. Step 1: name the supplier and PO reference. Step 2: upload the purchase order, invoice and delivery receipt. Step 3: review and start the analysis. The draft is saved as you go."
        : "Your role can't create cases. Ask an admin or reviewer to open one, or to change your role under Team & access.",
      links: ctx.canCreate ? [{ label: "New investigation", href: "/app/investigations/new" }] : [],
    }),
  },
  {
    test: /\b(upload|attach|add)\b.*\b(document|file|invoice|po|purchase order|receipt|pdf)s?\b|\bupload/,
    answer: () => ({
      text: "Open the case and use the three upload slots: purchase order, invoice and delivery receipt. Digital PDFs and JSON exports work best. Each slot shows a badge: Filed or Empty, and the Source documents list shows Extracted or Failed. A failed file can be replaced before you run the analysis.",
      links: [{ label: "Cases", href: "/app/investigations" }],
    }),
  },
  {
    test: /\b(analy[sz]e|analysis|engine|run the check|compare|comparison|three.?way)\b/,
    answer: () => ({
      text: "Open the case: the Analysis engine panel sits right under the case title and progress steps. It shows which of the three documents are on file. Press Run analysis there (it unlocks once at least one document is uploaded). The agent compares the documents and the page updates live; every mismatch becomes a finding with its evidence. After correcting a field, press Re-run analysis in the same panel.",
      links: [{ label: "Cases", href: "/app/investigations" }],
    }),
  },
  {
    test: /\b(undo|reopen|revert|mistake|by accident|accidentally)\b/,
    answer: () => ({
      text: "Confirmed or dismissed findings show an Undo: reopen button on the case page, which puts them back in the open queue. On the Findings page you can tick several and press Reopen. A resolved or archived case has a Reopen case button at the top right.",
      links: [{ label: "Findings", href: "/app/findings" }],
    }),
  },
  {
    test: /\b(confirm|dismiss|false alarm|review (a |the )?findings?|decide|decision)\b/,
    answer: (ctx) => ({
      text: ctx.canReview
        ? "Each finding on a case has Confirm (it's real), Request review, and Dismiss (not a problem, a reason is required). To handle many at once, go to Findings, filter by Needs a decision, tick the rows and use the bar that appears."
        : "Your role can prepare cases but not review findings. A reviewer or admin confirms or dismisses them.",
      links: [{ label: "Findings that need a decision", href: "/app/findings" }],
    }),
  },
  {
    test: /\b(approv\w*|sign\w*)\b/,
    answer: (ctx) => ({
      text: ctx.canApprove
        ? "Open Approvals. Each card shows the letter exactly as it will be sent, the value at stake and the findings behind it. Press the green Approve (or Reject), then Send or Export the approved letter. Editing a letter after approval voids the approval."
        : "Your role can't approve. When a letter is ready, a reviewer or admin approves it under Approvals. You can still see its status there.",
      links: [{ label: "Approvals", href: "/app/approvals" }],
    }),
  },
  {
    test: /\b(email|letter|send|draft|write to|contact) ?(the )?(supplier)?\b/,
    answer: () => ({
      text: "On the case page, scroll to the supplier email section at the bottom and draft the letter. It is built only from confirmed facts. Then press Request approval. Nothing is sent until a reviewer approves it and presses Send (or Export if email isn't connected).",
    }),
  },
  {
    test: /\b(resolve|close|finish|complete)\b.*\bcase\b|\bmark resolved\b/,
    answer: () => ({
      text: "When the supplier has answered, press Mark resolved at the top right of the case and note the outcome, for example 'Credit note issued for 10 units'. The history stays on the case and in the activity log.",
    }),
  },
  {
    test: /\b(archive|delete)\b/,
    answer: () => ({
      text: "Cases are archived, not deleted, so the audit trail survives. Press Archive on the case page and add a reason. Archived cases are hidden from the list until you tick Show archived, and can be reopened.",
    }),
  },
  {
    test: /\b(invite|add (a )?(user|member|teammate|colleague)|role|roles|permission|permissions|access)\b/,
    answer: (ctx) => ({
      text:
        "Roles: Admin can do everything. Reviewer reviews findings and approves emails. Contributor prepares cases, uploads and corrects fields, but can't approve. " +
        (ctx.canManage ? "Invite people and change roles under Team & access." : "An admin invites people and changes roles under Team & access."),
      links: [{ label: "Team & access", href: "/app/team" }],
    }),
  },
  {
    test: /\b(export|csv|excel|download|print|pdf|report)\b/,
    answer: () => ({
      text: "For a single case, press Report at the top of the case page: it opens a formal A4 investigation report (summary, findings with evidence, three-way match, approvals, audit trail, sign-off lines) with a Print or save as PDF button. Cases and Findings also have Export CSV in the page header.",
      links: [
        { label: "Findings", href: "/app/findings" },
        { label: "Cases", href: "/app/investigations" },
      ],
    }),
  },
  {
    test: /\b(shortcut|shortcuts|keyboard|hotkey|hotkeys)\b/,
    answer: () => ({
      text: "Press ? anywhere for the full list. Highlights: g then c for cases, g then a for approvals, g then f for findings, c for a new case, w to open me, and Ctrl+K to search.",
    }),
  },
  {
    test: /\b(dark|theme|light mode|night)\b/,
    answer: () => ({ text: "Open the account menu at the bottom of the left sidebar and choose Dark mode or Light mode. Your choice is remembered on this browser." }),
  },
  {
    test: /\b(save|saved)\b.*\b(view|filter)s?\b|\b(filter|sort)\b/,
    answer: () => ({
      text: "On Cases, use the quick filters (My cases, Needs review, No activity in 7+ days), the Status, Owner and Sort by menus, then press Save this view to keep that combination as a one-click chip.",
      links: [{ label: "Cases", href: "/app/investigations" }],
    }),
  },
  {
    test: /\b(sidebar|side bar|menu|navigation|nav|collapse)\b/,
    answer: () => ({
      text: "The panel icon next to the logo collapses the sidebar to an icon rail; hover the rail to peek at it, or press the icon again to keep it open. On a phone, use the bar at the bottom and More for everything else.",
    }),
  },
  {
    test: /\b(search|look up|lookup)\b/,
    answer: () => ({
      text: "Use the search box in the top bar (Ctrl+K) to search cases by supplier, PO reference, title or case number. You can also just ask me, for example \"find PO-1048\" or \"cases for Northstar\".",
    }),
  },
];

const PAGE_HELP: { match: RegExp; text: string }[] = [
  { match: /^\/app\/investigations\/new/, text: "This is the new-case wizard. Fill in the supplier and PO reference, upload the three documents, then review and start the analysis. You can leave and come back; the draft is saved." },
  { match: /^\/app\/investigations\/[^/]+\/report/, text: "This is the printable investigation report. Press Print or save as PDF at the top; choose Save as PDF in the dialog to keep a file." },
  { match: /^\/app\/investigations\/[^/]+\/review/, text: "This page lists extracted fields that need a person to check them. Correct any wrong value, then go back to the case and press Re-run analysis so the corrections apply." },
  { match: /^\/app\/investigations\/[^/]+\/email/, text: "This is the supplier letter. Check it reads correctly, then request approval. A reviewer approves it under Approvals before anything is sent." },
  { match: /^\/app\/investigations\/[^/]+/, text: "Follow the progress strip under the case title: Upload documents, Run analysis, Review findings, Supplier email, Resolve. The Next line tells you what to do now, and the Analysis engine panel just below it has the Run analysis button." },
  { match: /^\/app\/investigations/, text: "This is the case list. Use the quick filters and menus to narrow it, Save this view to keep a filter set, and click any row to open the case." },
  { match: /^\/app\/approvals/, text: "Approvals holds every supplier letter waiting for sign-off. Each card shows the value at stake, the approval chain, the exact letter and the findings behind it. Use the green Approve or red Reject at the bottom of the card." },
  { match: /^\/app\/findings/, text: "Every finding across all cases. Filter by Needs a decision, tick rows and confirm, dismiss or reopen them together. Click a row to see its evidence on the case." },
  { match: /^\/app\/documents/, text: "All uploaded files. The badge shows whether each was extracted or failed. Open one to see its extracted fields next to the source." },
  { match: /^\/app\/suppliers/, text: "One row per supplier with open cases, open findings and money in dispute. Click a supplier to see its cases." },
  { match: /^\/app\/analytics/, text: "Trends over the chosen date range: monthly cases and findings, severity, finding types and the suppliers with the most findings." },
  { match: /^\/app\/exposure/, text: "Money still in dispute, per currency, with the biggest suppliers and findings. Click a finding to open its case." },
  { match: /^\/app\/activity/, text: "The audit trail: who did what and when, including agent steps. Filter by category or actor." },
  { match: /^\/app\/team/, text: "Members and their roles, plus pending invitations. Admins can invite people, change roles and issue reset links." },
  { match: /^\/app\/settings/, text: "Workspace policy: matching tolerances, who may approve, and integration status such as email sending and the AI model." },
  { match: /^\/app\/notifications/, text: "Recent changes on your cases. Click one to jump to the case." },
  { match: /^\/app\/overview/, text: "Your dashboard: what is waiting on you, key figures, the daily tally and recent cases. The Getting started checklist disappears once you've done each step." },
];

/* ---------------------------------------------------------------- data answers */

type Draft = Omit<AssistantReply, "matched">;

function caseLink(c: { id: string; case_number: string; title?: string }) {
  return { label: c.title ? `${c.case_number} · ${c.title}` : c.case_number, href: `/app/investigations/${c.id}` };
}

function attention(ctx: AssistantContext): Draft {
  const c = ctx.counts;
  if (!c) return { text: "I'm still loading your workspace figures. Ask again in a moment." };
  const parts: string[] = [];
  const links: AssistantLink[] = [];
  if (c.pendingApprovals) {
    parts.push(`${plural(c.pendingApprovals, "supplier letter")} waiting for approval`);
    links.push({ label: "Approvals", href: "/app/approvals" });
  }
  if (c.needsReview) {
    parts.push(`${plural(c.needsReview, "case")} needing review`);
    links.push({ label: "Cases to review", href: "/app/investigations?status=needs_review" });
  }
  if (c.openFindings) {
    parts.push(`${plural(c.openFindings, "open finding")}`);
    links.push({ label: "Findings", href: "/app/findings" });
  }
  const tail = ` ${plural(c.openCases, "case")} open in total${c.exposure ? `, ${c.exposure} in dispute` : ""}.`;
  if (!parts.length) return { text: `Nothing is waiting on you right now.${tail}`, links: [{ label: "Dashboard", href: "/app/overview" }] };
  return {
    text: `You have ${parts.join(", ")}.${tail}`,
    links,
    suggestions: ["Which approvals are waiting longest?", "Show high-severity findings"],
  };
}

function lookupByReference(message: string, ctx: AssistantContext): Draft | null {
  const ref = message.match(/\b(OW-\d{4}-\d+|PO-[\w-]+|INV-[\w-]+|DR-[\w-]+)\b/i)?.[1];
  if (!ref) return null;
  if (!ctx.cases) return { text: `Searching for ${ref}…`, links: [{ label: `Search ${ref}`, href: `/app/investigations?search=${encodeURIComponent(ref)}` }] };
  const q = ref.toLowerCase();
  const hits = ctx.cases.filter((c) => [c.case_number, c.supplier_reference ?? "", c.title].some((s) => s.toLowerCase().includes(q))).slice(0, 4);
  if (!hits.length) {
    return {
      text: `I couldn't find a case matching ${ref} in the current list. It may be archived; the full search includes more fields.`,
      links: [{ label: `Search ${ref}`, href: `/app/investigations?search=${encodeURIComponent(ref)}&archived=1` }],
    };
  }
  const one = hits[0]!;
  return {
    text:
      hits.length === 1
        ? `Found ${one.case_number}: ${one.title}${one.supplier_name ? ` (${one.supplier_name})` : ""}. Status: ${one.status.replace(/_/g, " ")}${one.finding_count !== undefined ? `, ${plural(one.finding_count, "open finding")}` : ""}.`
        : `Found ${hits.length} matching cases.`,
    links: hits.map(caseLink),
  };
}

function lookupSupplier(t: string, ctx: AssistantContext): Draft | null {
  if (!ctx.cases?.length) return null;
  const names = [...new Set(ctx.cases.map((c) => c.supplier_name).filter((n): n is string => Boolean(n && n.length >= 3)))];
  const name = names
    .sort((a, b) => b.length - a.length)
    .find((n) => {
      const nn = normalize(n).trim();
      const first = nn.split(" ")[0]!;
      return t.includes(` ${nn} `) || (first.length >= 4 && t.includes(` ${first} `));
    });
  if (!name) return null;
  const cases = ctx.cases.filter((c) => c.supplier_name === name);
  const open = cases.filter((c) => !CLOSED.has(c.status));
  const findings = (ctx.findings ?? []).filter((f) => f.supplier_name === name && ACTIVE(f));
  const byCur = new Map<string, number>();
  findings.forEach((f) => f.impact_amount && f.currency && byCur.set(f.currency, (byCur.get(f.currency) ?? 0) + Math.abs(Number(f.impact_amount))));
  const value = [...byCur.entries()].map(([c, n]) => money(n, c)).join(" + ");
  return {
    text:
      `${name}: ${plural(cases.length, "case")} (${open.length} open), ${plural(findings.length, "active finding")}` +
      `${value ? `, ${value} in dispute` : ""}.`,
    links: [...open.slice(0, 3).map(caseLink), { label: `All ${name} cases`, href: `/app/investigations?search=${encodeURIComponent(name)}` }],
  };
}

function lookupTitle(t: string, ctx: AssistantContext): Draft | null {
  if (!ctx.cases?.length || !/\b(case|investigation|find|where is|open)\b/.test(t)) return null;
  const stop = new Set(["case", "cases", "the", "for", "find", "open", "where", "show", "about", "with", "investigation", "and", "that", "this", "what"]);
  const words = t.trim().split(" ").filter((w) => w.length >= 4 && !stop.has(w));
  if (!words.length) return null;
  const scored = ctx.cases
    .map((c) => ({ c, score: words.filter((w) => normalize(c.title).includes(` ${w}`)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0]!.score < Math.min(2, words.length)) return null;
  const hits = scored.slice(0, 3).map((x) => x.c);
  return { text: hits.length === 1 ? `This looks like ${hits[0]!.case_number}: ${hits[0]!.title}.` : `These cases match:`, links: hits.map(caseLink) };
}

function listCasesNeedingReview(ctx: AssistantContext): Draft {
  const list = (ctx.cases ?? []).filter((c) => c.status === "needs_review");
  if (!ctx.cases) return { text: "Loading cases…", links: [{ label: "Cases to review", href: "/app/investigations?status=needs_review" }] };
  if (!list.length) return { text: "No cases are waiting for review right now." };
  return {
    text: `${plural(list.length, "case")} ${list.length === 1 ? "needs" : "need"} review:\n${list.slice(0, 5).map((c) => `• ${c.case_number} · ${c.title}`).join("\n")}`,
    links: [...list.slice(0, 3).map(caseLink), { label: "All cases to review", href: "/app/investigations?status=needs_review" }],
  };
}

function myCases(ctx: AssistantContext): Draft {
  if (!ctx.cases || !ctx.userId) return { text: "Use the My cases quick filter on the Cases page.", links: [{ label: "Cases", href: "/app/investigations" }] };
  const mine = ctx.cases.filter((c) => c.owner_user_id === ctx.userId && !CLOSED.has(c.status));
  if (!mine.length) return { text: "You don't own any open cases right now." };
  return {
    text: `You own ${plural(mine.length, "open case")}:\n${mine.slice(0, 5).map((c) => `• ${c.case_number} · ${c.title} (${c.status.replace(/_/g, " ")})`).join("\n")}`,
    links: [...mine.slice(0, 3).map(caseLink), { label: "My cases", href: `/app/investigations?owner=${ctx.userId}` }],
  };
}

function staleCases(ctx: AssistantContext): Draft {
  const now = ctx.now ?? Date.now();
  const list = (ctx.cases ?? [])
    .filter((c) => !CLOSED.has(c.status) && c.updated_at && now - parseIso(c.updated_at) > 7 * 86_400_000)
    .sort((a, b) => parseIso(a.updated_at!) - parseIso(b.updated_at!));
  if (!list.length) return { text: "Every open case has had activity in the last 7 days." };
  return {
    text: `${plural(list.length, "open case")} with no activity for over a week:\n${list.slice(0, 5).map((c) => `• ${c.case_number} · idle ${ago(c.updated_at!, now)}`).join("\n")}`,
    links: [...list.slice(0, 3).map(caseLink), { label: "Stale cases", href: "/app/investigations?stale=1" }],
  };
}

function severeFindings(ctx: AssistantContext): Draft {
  const list = (ctx.findings ?? [])
    .filter((f) => ACTIVE(f) && (f.severity === "critical" || f.severity === "high"))
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
  if (!ctx.findings) return { text: "Loading findings…", links: [{ label: "Findings", href: "/app/findings" }] };
  if (!list.length) return { text: "There are no open high or critical findings. Nice.", links: [{ label: "All findings", href: "/app/findings" }] };
  return {
    text: `${plural(list.length, "high or critical finding")} still active:\n${list
      .slice(0, 5)
      .map((f) => `• ${f.title} (${f.severity}, ${f.case_number})`)
      .join("\n")}`,
    links: [
      ...list.slice(0, 3).map((f) => ({ label: `${f.case_number} · ${f.title}`, href: `/app/investigations/${f.case_id}#finding-${f.id}` })),
      { label: "Findings page", href: "/app/findings" },
    ],
  };
}

function biggestFindings(ctx: AssistantContext): Draft {
  if (!ctx.findings) return { text: "Loading findings…", links: [{ label: "Exposure", href: "/app/exposure" }] };
  const priced = ctx.findings.filter((f) => ACTIVE(f) && f.impact_amount && f.currency && Number(f.impact_amount) !== 0);
  if (!priced.length) return { text: "No active finding has a money impact right now." };
  const top = [...priced].sort((a, b) => Math.abs(Number(b.impact_amount)) - Math.abs(Number(a.impact_amount))).slice(0, 5);
  const byCur = new Map<string, number>();
  priced.forEach((f) => byCur.set(f.currency!, (byCur.get(f.currency!) ?? 0) + Math.abs(Number(f.impact_amount))));
  return {
    text: `In dispute overall: ${[...byCur.entries()].map(([c, n]) => money(n, c)).join(" + ")}. Largest findings:\n${top
      .map((f) => `• ${money(Math.abs(Number(f.impact_amount)), f.currency!)} · ${f.title} (${f.case_number})`)
      .join("\n")}`,
    links: [...top.slice(0, 2).map((f) => ({ label: `${f.case_number} · ${f.title}`, href: `/app/investigations/${f.case_id}#finding-${f.id}` })), { label: "Exposure", href: "/app/exposure" }],
  };
}

function waitingApprovals(ctx: AssistantContext): Draft {
  if (!ctx.approvals) return { text: "Loading approvals…", links: [{ label: "Approvals", href: "/app/approvals" }] };
  const now = ctx.now ?? Date.now();
  const list = ctx.approvals.filter((a) => a.status === "pending").sort((a, b) => parseIso(a.created_at) - parseIso(b.created_at));
  if (!list.length) return { text: "No letters are waiting for approval.", links: [{ label: "Approvals", href: "/app/approvals" }] };
  return {
    text: `${plural(list.length, "letter")} waiting, oldest first:\n${list
      .slice(0, 5)
      .map((a) => `• ${a.case_number ?? "Case"} · ${a.supplier_name ?? "Supplier"} · waiting ${ago(a.created_at, now)}`)
      .join("\n")}${ctx.canApprove ? "" : "\nA reviewer or admin needs to sign these."}`,
    links: [{ label: "Review in Approvals", href: "/app/approvals" }, ...list.slice(0, 2).map((a) => ({ label: `${a.case_number ?? "Case"} evidence`, href: `/app/investigations/${a.case_id}` }))],
  };
}

function currentCaseSummary(ctx: AssistantContext): Draft | null {
  const id = ctx.pathname.match(/^\/app\/investigations\/([^/]+)/)?.[1];
  if (!id || id === "new") return null;
  const kase = ctx.cases?.find((c) => c.id === id);
  const findings = (ctx.findings ?? []).filter((f) => f.case_id === id);
  const active = findings.filter(ACTIVE);
  const undecided = findings.filter((f) => f.status === "open" || f.status === "needs_review");
  const byCur = new Map<string, number>();
  active.forEach((f) => f.impact_amount && f.currency && byCur.set(f.currency, (byCur.get(f.currency) ?? 0) + Math.abs(Number(f.impact_amount))));
  const value = [...byCur.entries()].map(([c, n]) => money(n, c)).join(" + ");
  const head = kase ? `${kase.case_number} · ${kase.title} is ${kase.status.replace(/_/g, " ")}.` : "On this case:";
  if (!findings.length) {
    return {
      text: `${head} No findings yet. If the documents are uploaded, press Run analysis in the Analysis engine panel under the title.`,
      links: [{ label: "Report", href: `/app/investigations/${id}/report` }],
    };
  }
  const worst = [...active].sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)).slice(0, 3);
  return {
    text:
      `${head} ${plural(active.length, "active finding")}${value ? `, ${value} in dispute` : ""}; ${plural(undecided.length, "still needs", "still need")} a decision.` +
      (worst.length ? `\n${worst.map((f) => `• ${f.title} (${f.severity})`).join("\n")}` : "") +
      (undecided.length ? "\nNext: confirm or dismiss the open findings, then draft the supplier email." : "\nNext: draft the supplier email, or mark the case resolved."),
    links: [
      ...worst.slice(0, 2).map((f) => ({ label: f.title, href: `/app/investigations/${id}#finding-${f.id}` })),
      { label: "Printable report", href: `/app/investigations/${id}/report` },
    ],
  };
}

function glossary(t: string): Draft | null {
  if (!/\b(what|define|meaning|mean|means|explain)\b/.test(t)) return null;
  const term = (Object.keys(GLOSSARY) as GlossaryTerm[]).find((k) => t.includes(` ${k.replace(/-/g, " ")} `) || t.includes(` ${k} `) || t.includes(` ${k}s `));
  return term ? { text: `${term.charAt(0).toUpperCase()}${term.slice(1)}: ${GLOSSARY[term]}` } : null;
}

/* ---------------------------------------------------------------------- answer */

export function answer(message: string, ctx: AssistantContext): AssistantReply {
  const raw = message.trim();
  const t = normalize(raw);
  const done = (r: Draft): AssistantReply => ({ ...r, matched: true });

  if (!raw) return { text: "Ask me anything about OpsWarden.", suggestions: STARTER_SUGGESTIONS, matched: false };

  // Small talk and capabilities
  if (/^ (hi|hello|hey|yo|hiya|good (morning|afternoon|evening)) /.test(t) && raw.length < 30) {
    return done({ text: "Hi, I'm Warden. Here's what I can do:\n" + CAPABILITIES, suggestions: STARTER_SUGGESTIONS });
  }
  if (/\b(thanks|thank you|cheers|perfect|great)\b/.test(t) && raw.length < 40) return done({ text: "Happy to help. Ask any time." });
  if (/\b(help|what can you do|what do you do|who are you|capabilities)\b/.test(t) && raw.length < 40) {
    return done({ text: "I'm Warden, your OpsWarden guide. I can:\n" + CAPABILITIES, suggestions: STARTER_SUGGESTIONS });
  }

  // Follow-up: "open it", "take me there"
  if (/^ (open|show|go to|take me to|take me) (it|that|this|there|the first one|the first) $|^ (open it|go there|take me there) $/.test(t)) {
    const target = ctx.lastLinks?.[0];
    return target ? done({ text: `Opening ${target.label}.`, navigate: target.href, links: [target] }) : done({ text: "Open what? Ask me for a case, page or finding first." });
  }

  if (/\bagents?\b|\b(ai|bot|robot|automation|automatic|automated)\b|who (runs|does) the (analysis|check)/.test(t)) {
    return done({ text: AGENT_TEXT, links: [{ label: "Activity log", href: "/app/activity" }].filter(() => ctx.canManage) });
  }

  // Exact references, then data questions
  const ref = lookupByReference(raw, ctx);
  if (ref) return done(ref);

  if (/\b(this|current) case\b|\bwhat s wrong\b|\bwhats wrong\b|\bproblems? (here|with this)\b|\bsummar(y|ise|ize) (this|it|the case)\b/.test(t)) {
    const s = currentCaseSummary(ctx);
    if (s) return done(s);
  }
  if (/\b(which|what|list|show|any)\b.*\bcases?\b.*\b(need|needs|waiting for|to)\b.*\breview\b/.test(t)) return done(listCasesNeedingReview(ctx));
  if (/\bmy (open )?cases\b|\bcases (i own|assigned to me|i m working on)\b|\bmine\b/.test(t)) return done(myCases(ctx));
  if (/\b(stuck|stale|stalled|idle|inactive|no activity|forgotten|old)\b.*\bcases?\b|\bcases?\b.*\b(stuck|stale|idle|no activity)\b/.test(t)) return done(staleCases(ctx));
  if (/\b(high|critical|severe|serious|worst|urgent)\b.*\bfindings?\b|\bfindings?\b.*\b(high|critical)\b/.test(t)) return done(severeFindings(ctx));
  if (/\b(biggest|largest|most expensive|highest value|highest|top|most money)\b.*\b(findings?|exposure|disputes?|amounts?|issues?)\b|\bhow much\b.*\b(dispute|at stake|exposure|money)\b|\bwhere is the money\b/.test(t)) {
    return done(biggestFindings(ctx));
  }
  if (/\b(oldest|longest|waiting|pending|outstanding)\b.*\b(approvals?|letters?|sign ?offs?)\b|\b(approvals?|letters?)\b.*\b(waiting|oldest|pending)\b/.test(t)) {
    return done(waitingApprovals(ctx));
  }

  if (/\b(what|which|anything)\b.*\b(need|needs|waiting|pending|attention|to do|todo|urgent)\b|\bhow many\b|\bmy (tasks|work|queue)\b|\bwhat s up\b|\bstatus\b|\bsummary\b/.test(t)) {
    return done(attention(ctx));
  }

  if (/\b(this page|here|this screen|next step|what next|what now|what should i do|what do i do|where am i)\b/.test(t)) {
    const caseSummary = /^\/app\/investigations\/(?!new)[^/]+$/.test(ctx.pathname) ? currentCaseSummary(ctx) : null;
    const page = PAGE_HELP.find((p) => p.match.test(ctx.pathname));
    if (page) return done(caseSummary && ctx.findings ? { ...caseSummary, text: `${page.text}\n\n${caseSummary.text}` } : { text: page.text });
  }

  const def = glossary(t);
  if (def) return done(def);

  const isQuestion = QUESTION.test(t.trim());
  const route = findRoute(t, ctx);
  if (route && NAV_VERB.test(t) && !isQuestion) {
    return done({ text: `Opening ${route.name}.`, navigate: route.href, links: [{ label: route.name, href: route.href }] });
  }

  const supplier = lookupSupplier(t, ctx);
  if (supplier) return done(supplier);

  const topic = TOPICS.find((tp) => tp.test.test(t));
  if (topic) return done(topic.answer(ctx));

  if (route) {
    return done({
      text: isQuestion && /\bwhere\b/.test(t) ? `${route.name} is in the left sidebar. Here's a direct link.` : `Here's ${route.name}.`,
      links: [{ label: route.name, href: route.href }],
    });
  }

  const title = lookupTitle(t, ctx);
  if (title) return done(title);

  return {
    text: "I'm not sure about that one. Try asking about a case number, a supplier, findings, approvals, or how to do something. Here's what I can do:\n" + CAPABILITIES,
    suggestions: STARTER_SUGGESTIONS,
    matched: false,
  };
}
