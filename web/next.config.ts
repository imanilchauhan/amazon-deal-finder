import path from "node:path";
import type { NextConfig } from "next";

// One token per build, inherited by the static-generation workers, so they share a single
// Firestore read of the catalogue (see src/lib/deals.ts loadCatalog).
process.env.CARTCRUSH_BUILD_TOKEN ??= `${process.pid}-${Date.now()}`;

const nextConfig: NextConfig = {
  /* config options here */
  // Pin the workspace root so a stray lockfile higher up the tree is not picked instead.
  turbopack: { root: path.resolve(import.meta.dirname) },
  // Static export: deploys to Cloudflare Pages like pixdocket. Deals are read from Firestore at build
  // time, and a GitHub Action rebuilds the site after every scrape.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
