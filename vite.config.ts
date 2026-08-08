import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // React 19 + @xyflow/react + lucide is a non-trivial bundle; warn if a
    // chunk grows past this so a regression is visible in the build log.
    chunkSizeWarningLimit: 900
  },
  test: {
    // Default to node so the engine tests keep their web-stream APIs; component
    // tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
