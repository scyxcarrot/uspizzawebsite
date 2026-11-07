import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every page here renders from static data or
  // browser storage, so there is no server data worth caching, and leaving it
  // off keeps pages simple (no Suspense boundaries just to read the URL).
  // Keep the demo out of search engines (also set as a meta tag in layout.tsx).
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
