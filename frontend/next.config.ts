import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

// Lets `next dev` use local Cloudflare bindings; no effect on `next build`.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
