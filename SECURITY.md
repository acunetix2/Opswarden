# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the steps to reproduce, the affected endpoint or page, and the impact you expect.

You'll get an acknowledgement within 3 working days. Fixes for confirmed issues are prioritised over feature work.

## Scope

In scope: the OpsWarden API and web app in this repository, including authentication, workspace isolation, document access, approvals and the AI features.

Out of scope: the third-party services OpsWarden connects to (Supabase, Cloudflare, Groq, Google, Brevo, Render). Report those to the provider.

## Design

The threat model, trust boundaries and controls are described in [`OpsWarden_Documentation/SECURITY.md`](OpsWarden_Documentation/SECURITY.md).
