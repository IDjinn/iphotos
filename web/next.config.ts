import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output serves the Docker web image (backend/compose.vps.yaml
  // sets NEXT_STANDALONE=1); desktop/electron keeps the default .next layout.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  compiler: {
    styledComponents: true,
  },
  rewrites() {
    // API_PROXY_TARGET lets `bun dev` proxy a remote API same-origin (no CORS);
    // the default is the compose service name used by the Docker image.
    const target = (process.env.API_PROXY_TARGET ?? "http://api:8080").replace(/\/+$/, "");
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
    ];
  }
};

export default nextConfig;
