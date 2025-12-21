import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/*.test.ts"],
    testTimeout: 30000,
    setupFiles: ["./server/__tests__/setup.ts"],
  },
});

