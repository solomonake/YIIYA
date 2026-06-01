import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./")
    }
  },
  test: {
    environment: "node",
    globals: false,
    coverage: {
      reporter: ["text", "lcov"],
      include: [
        "lib/security/**/*.ts",
        "lib/critic/**/*.ts",
        "lib/brief/**/*.ts",
        "lib/agent/**/*.ts",
        "lib/scene/**/*.ts"
      ],
      exclude: ["**/*.d.ts", "**/node_modules/**"]
    },
    include: ["lib/**/*.test.ts", "services/**/*.test.ts"],
    testTimeout: 10_000
  }
});
