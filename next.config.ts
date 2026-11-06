import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every page here renders from static data or
  // browser storage, so there is no server data worth caching, and leaving it
  // off keeps pages simple (no Suspense boundaries just to read the URL).
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
