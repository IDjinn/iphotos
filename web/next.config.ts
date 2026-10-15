import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output serves the Docker web image (backend/compose.vps.yaml
  // sets NEXT_STANDALONE=1); desktop/electron keeps the default .next layout.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
