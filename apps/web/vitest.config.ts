import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror Next's `@/*` path alias (tsconfig "paths") for vitest.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
});
