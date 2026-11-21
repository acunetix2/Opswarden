"use client";

import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SITE } from "@/lib/site";

const TOPICS = ["Book a walkthrough", "Start a pilot", "Support with my workspace", "Security or privacy question", "Something else"];

/**
 * Contact form that hands off to the visitor's email app. There is no hidden
 * backend: the message goes exactly where the page says it will.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]!);
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = `${topic}${company ? ` · ${company}` : ""}`;
    const body = `${message}\n\n${name}${company ? `\n${company}` : ""}`;
    window.location.href = `mailto:${SITE.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(17_17_17/0.04)] sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="c-name" required>
          <Input id="c-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Company" htmlFor="c-company">
          <Input id="c-company" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
      </div>
      <Field label="Topic" htmlFor="c-topic">
        <Select id="c-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          {TOPICS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Field label="Message" htmlFor="c-message" required hint="Please don't include invoices or other confidential documents here.">
        <Textarea id="c-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-[12.5px] text-ink-3">Opens your email app, addressed to {SITE.supportEmail}.</p>
        <Button type="submit" variant="accent" disabled={!name.trim() || !message.trim()} icon={<Send className="size-4" aria-hidden />}>
          Write email
        </Button>
      </div>
      {opened ? (
        <p role="status" className="text-[13px] text-success">
          Your email app should be open with the message ready. If nothing happened, email {SITE.supportEmail} directly.
        </p>
      ) : null}
    </form>
  );
}
