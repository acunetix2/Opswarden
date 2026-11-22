"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { StateBadge } from "@/components/status/status-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AutomationCard } from "./automation-card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { formatBytes } from "@/lib/format";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { useSettingsQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { PolicyForm } from "./policy-form";

function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
      <div>
        <dt className="text-[13.5px] font-medium text-ink">{label}</dt>
        {hint ? <p className="text-[12px] leading-snug text-ink-3">{hint}</p> : null}
      </div>
      <dd className="text-[13.5px] text-ink sm:text-right">{value}</dd>
    </div>
  );
}

function Integration({ code, name, connected, description, setup }: { code: string; name: string; connected: boolean; description: string; setup?: string }) {
  return (
    <li className="grid grid-cols-[3rem_1fr_auto] items-start gap-4 px-5 py-4">
      <span className="grid h-9 place-items-center rounded-[8px] border border-line bg-canvas font-mono text-[11px] font-semibold text-ink-2">{code}</span>
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-ink">{name}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{description}</p>
        {!connected && setup ? <p className="mt-1.5 font-mono text-[11px] text-ink-3">{setup}</p> : null}
      </div>
      <StateBadge on={connected} onLabel="Connected" offLabel="Not connected" />
    </li>
  );
}

export function SettingsView() {
  const { workspace, can } = useWorkspace();
  const { data: s, error, refetch } = useSettingsQuery(workspace.id);
  const isAdmin = can("manage_workspace");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description={isAdmin ? "Workspace policy and integrations. Every change is recorded in the activity log." : "Policies and integrations in effect for this workspace. Only admins can change them."}
      />
      {error && !s ? (
        <Card><ErrorState error={error} onRetry={refetch} /></Card>
      ) : !s ? (
        <Card><SkeletonRows rows={6} className="px-5" /></Card>
      ) : (
        <div className="grid gap-8 xl:grid-cols-2">
          <Card className="xl:row-span-2">
            <CardHeader index="01" title="Policy" description="Deterministic rules. The AI never decides arithmetic, severity, or who may approve." />
            <CardBody className="py-5">
              {isAdmin ? (
                <PolicyForm settings={s} />
              ) : (
                <dl>
                  <Row label="Workspace name" value={s.workspace_name} />
                  <Row label="Unit price tolerance" value={<span className="figure">± {s.price_tolerance}</span>} />
                  <Row label="Quantity tolerance" value={<span className="figure">± {s.quantity_tolerance} units</span>} />
                  <Row label="Reviewers may approve" value={<StateBadge on={s.reviewers_can_approve} onLabel="Yes" offLabel="No, admins only" />} />
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader index="02" title="Access" />
            <CardBody className="py-2">
              <dl>
                <Row label="Your role" value={ROLE_DESCRIPTIONS[s.your_role].label} hint={ROLE_DESCRIPTIONS[s.your_role].summary} />
                <Row label="Members and roles" value={<Link href="/app/team" className="font-medium text-brand-ink hover:underline">Team &amp; access →</Link>} />
                <Row label="Human approval for external actions" value={<Badge tone="success">Always on</Badge>} hint="Payments, bank details, and ledgers are out of scope." />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader index="03" title="Uploads" />
            <CardBody className="py-2">
              <dl>
                <Row label="Maximum file size" value={<span className="figure">{formatBytes(s.max_upload_bytes)}</span>} hint="Server limit." />
                <Row label="Accepted formats" value={<span className="font-mono text-[12px]">{s.accepted_extensions.join(" ")}</span>} hint="Extension, type, and file signature are checked on the server." />
              </dl>
            </CardBody>
          </Card>

          <AutomationCard settings={s} canEdit={isAdmin} />

          <Card className="xl:col-span-2">
            <CardHeader
              index="05"
              title="Integrations"
              description="Credentials live in the server's secret store, never in the browser. OpsWarden shows the real state and never pretends an action happened."
            />
            <ul className="divide-y divide-line">
              <Integration
                code="R2"
                name={`Document storage · ${s.storage_backend === "r2" ? "Cloudflare R2" : s.storage_backend === "s3" ? "S3 bucket" : "server disk"}`}
                connected={s.storage_backend === "r2" || s.storage_backend === "s3"}
                description={
                  s.storage_backend === "r2" || s.storage_backend === "s3"
                    ? "Uploaded documents are kept in a private bucket and streamed only to signed-in members."
                    : "Uploaded documents are saved on the API server's disk. On hosts like Render that disk is wiped on every deploy."
                }
                setup="Set STORAGE_BACKEND=r2 with R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY on the API server, then restart it."
              />
              <Integration
                code="SMTP"
                name={`Email sending${s.email_sender ? ` · ${s.email_sender}` : ""}`}
                connected={s.email_configured}
                description={s.email_configured ? "Approved letters, invitations, and reset links go out through SMTP." : "Approved letters are exported; invitation and reset links are shared by hand."}
                setup="Set SMTP_HOST and SMTP_FROM (plus SMTP_USERNAME / SMTP_PASSWORD) on the API server."
              />
              <Integration
                code="AI"
                name={`Writing assistant${s.llm_provider ? ` · ${s.llm_provider}` : ""}`}
                connected={s.llm_configured}
                description={
                  s.llm_configured
                    ? "Rephrases supplier letters from validated findings only. Rewrites that change a fact are discarded; identical drafts are cached."
                    : "Letters use deterministic templates built from findings."
                }
                setup={
                  s.llm_provider
                    ? `LLM_PROVIDER is ${s.llm_provider}, but LLM_API_KEY is empty. Add the key on the API server and restart it.`
                    : "Set LLM_PROVIDER (groq, gemma or openai) and LLM_API_KEY on the API server, then restart it."
                }
              />
              <Integration
                code="OCR"
                name="Scanned documents"
                connected={s.ocr_available}
                description={
                  s.ocr_available
                    ? "Scans, photos and unfamiliar PDF layouts are read by a vision model. Numbers that don't add up on the page are flagged for a person to check."
                    : "Not connected. Set GEMINI_API_KEY on the API server to read scans and photos; until then they are flagged as failed."
                }
              />
              <Integration
                code="TTS"
                name="Read aloud"
                connected={Boolean(s.tts_available)}
                description={
                  s.tts_available
                    ? "Warden's answers and case summaries can be read aloud. Audio is generated on request and not stored."
                    : "Not connected. Set TTS_PROVIDER and its key on the API server to enable read-aloud."
                }
              />
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
