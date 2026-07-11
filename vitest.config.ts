import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The root run also collects apps/web tests; mirror the web app's `@/*`
// path alias (apps/web/tsconfig.json "paths") so those modules resolve.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./apps/web/", import.meta.url)) }],
  },
});
