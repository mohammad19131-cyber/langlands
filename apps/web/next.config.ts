import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Isolated production checks can set NEXT_DIST_DIR so `next build` does not
  // replace the running `next dev` output under .next.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  transpilePackages: ["@langlands/sim", "@langlands/round-machine"],
  outputFileTracingRoot: path.join(fileURLToPath(new URL(".", import.meta.url)), "../.."),
  // packages/sim uses TypeScript ESM specifiers (./foo.js → foo.ts). Webpack
  // does not remap those without this alias. Engine source is unchanged.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
