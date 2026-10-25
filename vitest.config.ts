import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Several sessions build and test on this machine at once, and a few
    // tests read every file under app/; the 5 s default timed them out under
    // that load (2026-10-25) while each passed alone.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
