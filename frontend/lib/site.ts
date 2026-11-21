/**
 * Public-site facts in one place. Change contact details here and every
 * marketing and legal page picks them up.
 */
export const SITE = {
  name: "OpsWarden",
  legalName: "OpsWarden",
  tagline: "Procurement investigations with people in control",
  supportEmail: "support@opswarden.aventorgo.xyz",
  legalEmail: "support@opswarden.aventorgo.xyz",
  securityEmail: "support@opswarden.aventorgo.xyz",
  privacyEmail: "support@opswarden.aventorgo.xyz",
  legalUpdated: "21 November 2026",
};

/** Third parties that process data for the hosted service. Keep in sync with the deployment. */
export const SUBPROCESSORS: { name: string; purpose: string; data: string; optional?: boolean }[] = [
  { name: "Supabase", purpose: "Sign-in (authentication) and the application database", data: "Account details, workspace records, case data" },
  { name: "Cloudflare R2", purpose: "Private storage for uploaded documents", data: "Uploaded purchase orders, invoices and receipts" },
  { name: "Render", purpose: "Hosting of the web application and API", data: "All data in transit through the service" },
  { name: "Brevo", purpose: "Delivery of invitations, password resets and approved supplier letters", data: "Recipient email addresses and message content" },
  { name: "Groq", purpose: "Optional AI rephrasing of supplier letters and help answers", data: "Letter drafts built from findings; help questions. Never raw documents.", optional: true },
];
