"""Branded email layouts for OpsWarden.

Every email is sent as plain text plus HTML. The HTML uses the same layout as
`email_templates/supabase-*.html`: a navy header with the wordmark, an orange
rule, a white card and a quiet footer. It uses tables and inline styles so it
renders in Outlook and Gmail, and has no images or tracking.

All dynamic values are HTML-escaped. Supplier letters use `render_letter`, which
shows the approved text exactly as approved and adds nothing to it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape

from app.core.config import settings

# Brand palette (matches the web app's light theme and the Supabase templates).
NAVY = "#11151C"
CREAM = "#F3EEE3"
ORANGE = "#EE6A24"
ORANGE_INK = "#C2471A"
PAGE = "#F4F1EA"
CARD_BORDER = "#E6E0D4"
DIVIDER = "#EFEBE3"
TEXT = "#3F444D"
MUTED = "#6B6F76"
FAINT = "#9A968D"
TINT = "#FDF3EC"
TINT_BORDER = "#F4C9AE"

_SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
_MONO = "'SF Mono', Menlo, Consolas, 'Courier New', monospace"


@dataclass(frozen=True)
class Rendered:
    text: str
    html: str


@dataclass(frozen=True)
class Fact:
    """A label/value row, e.g. ("Case", "OW-2026-0004")."""

    label: str
    value: str


def _site() -> str:
    return settings.frontend_origin.rstrip("/")


def _p(text: str, *, size: int = 15, color: str = TEXT, margin: str = "0 0 16px 0", align: str = "left") -> str:
    return (
        f'<p style="margin:{margin}; font-family:{_SANS}; font-size:{size}px; line-height:{size + 9}px; '
        f'color:{color}; text-align:{align};">{text}</p>'
    )


def _button(label: str, url: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>'
        f'<td bgcolor="{NAVY}" style="background-color:{NAVY}; border-radius:8px;">'
        f'<a href="{escape(url, quote=True)}" style="display:inline-block; padding:13px 24px; font-family:{_SANS}; '
        f'font-size:15px; font-weight:600; line-height:20px; color:{CREAM}; text-decoration:none; border-radius:8px;">'
        f"{escape(label)}</a></td></tr></table>"
    )


def _code(code: str) -> str:
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 24px auto;"><tr>'
        f'<td align="center" bgcolor="{TINT}" style="background-color:{TINT}; border:1px solid {TINT_BORDER}; '
        f'border-radius:8px; padding:18px 22px 18px 32px;">'
        f'<span style="font-family:{_MONO}; font-size:32px; font-weight:700; line-height:38px; letter-spacing:10px; '
        f'color:{NAVY};">{escape(code)}</span></td></tr></table>'
    )


def _facts(facts: list[Fact]) -> str:
    rows = "".join(
        "<tr>"
        f'<td style="padding:9px 0; border-bottom:1px solid {DIVIDER}; font-family:{_SANS}; font-size:13px; '
        f'line-height:20px; color:{MUTED}; width:38%; vertical-align:top;">{escape(f.label)}</td>'
        f'<td style="padding:9px 0; border-bottom:1px solid {DIVIDER}; font-family:{_SANS}; font-size:14px; '
        f'line-height:20px; color:{NAVY}; font-weight:600; vertical-align:top;">{escape(f.value)}</td>'
        "</tr>"
        for f in facts
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:4px 0 24px 0; border-top:1px solid {DIVIDER};">{rows}</table>'
    )


def _divider() -> str:
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">'
        f'<tr><td style="border-top:1px solid {DIVIDER}; font-size:0; line-height:0;">&nbsp;</td></tr></table>'
    )


def _layout(*, title: str, preheader: str, inner: str, reason: str | None, links: bool = True) -> str:
    site = escape(_site(), quote=True)
    year = datetime.now(timezone.utc).year
    footer_links = (
        _p(
            f'<a href="{site}/resources" style="color:{TEXT}; text-decoration:none;">Help center</a>'
            f'<span style="color:#C9C1B2;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>'
            f'<a href="{site}/legal/privacy" style="color:{TEXT}; text-decoration:none;">Privacy policy</a>'
            f'<span style="color:#C9C1B2;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>'
            f'<a href="{site}/legal/terms" style="color:{TEXT}; text-decoration:none;">Terms of service</a>',
            size=13, color=MUTED, margin="0 0 16px 0", align="center",
        )
        if links
        else ""
    )
    reason_html = _p(escape(reason), size=12, color=FAINT, margin="0 0 4px 0", align="center") if reason else ""
    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{escape(title)}</title>
<!--[if mso]><style>table, td, p, a, span, h1 {{ font-family: Arial, sans-serif !important; }}</style><![endif]-->
</head>
<body style="margin:0; padding:0; width:100%; background-color:{PAGE};">
<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{PAGE}" style="background-color:{PAGE};">
<tr><td align="center" style="padding:40px 16px 48px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" bgcolor="{NAVY}" style="background-color:{NAVY}; border-radius:10px 10px 0 0; padding:24px 24px 22px 24px;">
<a href="{site}" style="text-decoration:none; color:{CREAM};"><span style="font-family:{_SANS}; font-size:22px; font-weight:700; letter-spacing:-0.3px; color:{CREAM};">Ops</span><span style="font-family:Georgia, 'Times New Roman', serif; font-size:23px; font-style:italic; color:{CREAM};">Warden</span></a>
</td></tr>
<tr><td bgcolor="{ORANGE}" style="background-color:{ORANGE}; height:3px; font-size:0; line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border:1px solid {CARD_BORDER}; border-top:0; border-radius:0 0 10px 10px; padding:40px 40px 32px 40px;">
{inner}
</td></tr>
<tr><td align="center" style="padding:28px 16px 0 16px;">
{footer_links}{reason_html}{_p(f"&copy; {year} OpsWarden", size=12, color=FAINT, margin="0", align="center")}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>"""


def render_notice(
    *,
    title: str,
    greeting: str | None,
    paragraphs: list[str],
    preheader: str | None = None,
    facts: list[Fact] | None = None,
    button: tuple[str, str] | None = None,
    code: str | None = None,
    footnote: str | None = None,
    reason: str | None = None,
) -> Rendered:
    """A message from OpsWarden to a person: sign-up codes, resets, invitations, alerts."""
    parts: list[str] = [
        f'<h1 style="margin:0 0 16px 0; font-family:{_SANS}; font-size:22px; font-weight:600; line-height:30px; '
        f'color:{NAVY};">{escape(title)}</h1>'
    ]
    text: list[str] = []
    if greeting:
        parts.append(_p(escape(greeting)))
        text.append(greeting)
    for para in paragraphs:
        parts.append(_p(escape(para)))
        text.append(para)
    if code:
        parts.append(_code(code))
        text.append(f"    {code}")
    if facts:
        parts.append(_facts(facts))
        text.append("\n".join(f"{f.label}: {f.value}" for f in facts))
    if button:
        label, url = button
        parts.append(_button(label, url))
        text.append(f"{label}: {url}")
        parts.append(_p(
            f'If the button doesn&#39;t work, copy this link into your browser:<br>'
            f'<a href="{escape(url, quote=True)}" style="color:{ORANGE_INK}; text-decoration:none; word-break:break-all;">{escape(url)}</a>',
            size=13, color=MUTED,
        ))
    if footnote:
        parts.append(_divider())
        parts.append(_p(escape(footnote), size=13, color=MUTED, margin="0"))
        text.append(footnote)
    text.append("OpsWarden")
    if reason:
        text.append(reason)
    html = _layout(title=title, preheader=preheader or (paragraphs[0] if paragraphs else title), inner="".join(parts), reason=reason)
    return Rendered(text="\n\n".join(text), html=html)


def render_letter(body: str) -> str:
    """HTML for an approved supplier letter.

    The visible text is exactly `body`, the text the approver approved. Paragraphs
    and line breaks are kept; nothing is added except an orange top rule. Links and
    addresses are not turned into anchors."""
    paragraphs = [p for p in body.replace("\r\n", "\n").split("\n\n")]
    inner = "".join(
        _p(escape(p).replace("\n", "<br>"), margin="0 0 16px 0") for p in paragraphs if p.strip()
    )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"></head>
<body style="margin:0; padding:0; width:100%; background-color:#FFFFFF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:32px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;">
<tr><td style="border-top:3px solid {ORANGE}; padding-top:24px;">{inner}</td></tr>
</table></td></tr></table></body></html>"""
