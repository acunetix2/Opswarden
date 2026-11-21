"""Builds the human-readable investigation summary and supplier email draft.

Grounded strictly in validated findings. The deterministic builder guarantees
every factual statement maps to a finding; the optional LLM only rephrases the
same grounded text and can never add evidence.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from app.agents.llm_guard import guard as llm_guard
from app.agents.llm_provider import SYSTEM_GUARDRAIL, LLMError, get_llm_provider
from app.core.logging import get_logger
from app.models.finding import Finding

log = get_logger("opswarden.investigation")


def _severity_rank(sev: str) -> int:
    order = ["info", "low", "medium", "high", "critical"]
    return order.index(sev) if sev in order else 0


def build_summary(case_title: str, supplier: str | None, findings: list[Finding]) -> str:
    active = [f for f in findings if f.status != "dismissed"]
    if not active:
        return (
            f"No discrepancies were detected for {case_title}. The purchase order, invoice, "
            "and delivery receipt reconcile within the configured tolerances."
        )
    active.sort(key=lambda f: _severity_rank(f.severity), reverse=True)
    lines = [
        f"OpsWarden identified {len(active)} point(s) needing attention for "
        f"{case_title}{f' with {supplier}' if supplier else ''}:",
    ]
    for f in active:
        lines.append(f"- [{f.severity.upper()}] {f.title}: {f.description}")
    lines.append(
        "These findings are derived from deterministic comparison of the uploaded documents. "
        "Review the evidence and approve any supplier communication before it is sent."
    )
    return "\n".join(lines)


def build_email_draft(
    case_number: str,
    supplier: str | None,
    supplier_reference: str | None,
    findings: list[Finding],
    currency: str,
) -> tuple[str, str]:
    active = [f for f in findings if f.status != "dismissed" and f.finding_type != "missing_document"]
    ref = supplier_reference or case_number
    subject = f"Clarification requested for {ref}"

    body_lines = [
        f"Hello{f' {supplier}' if supplier else ''},",
        "",
        f"We are reviewing documents related to {ref} and found the following points that "
        "need clarification:",
        "",
    ]
    if active:
        for f in active:
            line = f"- {f.title}: {f.description}"
            body_lines.append(line)
    else:
        body_lines.append("- (No open discrepancies; this is a general clarification request.)")
    body_lines += [
        "",
        "Could you please review these items and confirm the correct values or provide "
        "supporting documentation?",
        "",
        "Thank you,",
        "Procurement Team",
    ]
    body = "\n".join(body_lines)
    return subject, body


# ---- AI-assisted drafting (optional) -------------------------------------------

_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def _numbers(text: str) -> set[str]:
    """Numeric tokens, normalized so '1,200.00' and '1200.00' compare equal."""
    out = set()
    for raw in _NUMBER.findall(text):
        n = raw.replace(",", "")
        out.add(n)
        if "." in n:
            out.add(n.rstrip("0").rstrip("."))  # 12.00 -> 12
    return out


def grounding_problem(draft: str, candidate: str, reference: str) -> str | None:
    """Rejects model output that could contain facts the findings don't support.

    Every number in the rewrite must already appear in the deterministic draft,
    the document reference must survive, and the model may not introduce email
    addresses or links.
    """
    if not candidate.strip():
        return "empty"
    if len(candidate) > max(3 * len(draft), 600):
        return "too_long"
    extra = _numbers(candidate) - _numbers(draft)
    if extra:
        return "new_numbers"
    if reference and reference.lower() not in candidate.lower():
        return "reference_missing"
    if ("@" in candidate and "@" not in draft) or re.search(r"https?://|www\.", candidate, re.I):
        return "new_contact_or_link"
    return None


@dataclass
class EmailDraftResult:
    subject: str
    body: str
    provider: str  # builtin | gemma | openai
    model: str
    ai_assisted: bool
    # Why the AI rewrite wasn't used, when a model is configured.
    fallback_reason: str | None = None


def _clean(text: str) -> str:
    """Drops a leading 'Subject:' line or code fences some models add."""
    t = text.strip().strip("`").strip()
    lines = t.splitlines()
    if lines and lines[0].lower().startswith("subject:"):
        lines = lines[1:]
    return "\n".join(lines).strip()


def draft_supplier_email(
    case_number: str,
    supplier: str | None,
    supplier_reference: str | None,
    findings: list[Finding],
    currency: str,
) -> EmailDraftResult:
    """Deterministic draft, optionally rephrased by the configured model.

    The model only sees the already-grounded draft, never document text, and its
    output is kept only if it passes `grounding_problem`.
    """
    subject, body = build_email_draft(case_number, supplier, supplier_reference, findings, currency)

    def template(reason: str | None) -> EmailDraftResult:
        return EmailDraftResult(subject, body, "builtin", "deterministic", ai_assisted=False, fallback_reason=reason)

    provider = get_llm_provider()
    if not provider.configured:
        return template(None)

    # Nothing worth rephrasing: the template is a one-line general request.
    has_content = any(f.status != "dismissed" and f.finding_type != "missing_document" for f in findings)
    if not has_content:
        return template("not_needed")

    reference = supplier_reference or case_number
    key = llm_guard.key(provider.name, provider.model, reference, body)

    def call() -> EmailDraftResult:
        task = json.dumps(
            {
                "task": (
                    "Rewrite this supplier clarification email so it reads naturally and politely. "
                    "Keep every fact, quantity, price, and reference exactly as written. Do not add "
                    "facts, numbers, dates, email addresses, links, or promises. Do not mention fraud. "
                    "Return only the email body as plain text, with no subject line."
                ),
                "email_body": body,
            }
        )
        try:
            result = provider.complete(SYSTEM_GUARDRAIL, task)
        except LLMError as exc:
            log.warning("AI drafting unavailable, using template: %s", exc)
            llm_guard.report_error()  # pause calls; errors are not cached
            return template("provider_error")

        candidate = _clean(result.text)
        problem = grounding_problem(body, candidate, reference)
        if problem:
            log.info("AI draft rejected by grounding check (%s); using template", problem)
            out = template(problem)
            llm_guard.put(key, out, negative=True)  # same input would be rejected again
            return out
        out = EmailDraftResult(subject, candidate, result.provider, result.model, ai_assisted=True)
        llm_guard.put(key, out)
        return out

    outcome = llm_guard.run(key, call)
    if outcome.value is not None:
        return outcome.value
    log.info("AI drafting skipped (%s); using template", outcome.skipped)
    return template(outcome.skipped)
