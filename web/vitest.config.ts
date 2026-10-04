import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      // The contract modules fail fast without an API URL; tests never hit it.
      NEXT_PUBLIC_API_URL: "http://localhost:5205",
    },
  },
});
