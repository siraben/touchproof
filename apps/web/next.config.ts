import type { NextConfig } from "next";

const staticExport = process.env["TOUCHPROOF_STATIC_EXPORT"] === "1";

const config: NextConfig = {
  transpilePackages: ["@touchproof/core"],
  ...(staticExport ? { output: "export" as const } : {}),
};

export default config;
