import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Pages render in the browser from API data, so no Next.js incremental cache (R2) is needed.
export default defineCloudflareConfig({});
