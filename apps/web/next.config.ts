import type { NextConfig } from "next";

const staticExport = process.env["TOUCHPROOF_STATIC_EXPORT"] === "1";

const config: NextConfig = {
  transpilePackages: ["@touchproof/core"],
  // Types are gated by the standalone `pnpm --dir apps/web typecheck` step
  // (locally and in CI); running tsc again inside `next build` only duplicates
  // that work and has proven flaky under memory pressure.
  typescript: { ignoreBuildErrors: true },
  ...(staticExport ? { output: "export" as const } : {}),
};

export default config;
