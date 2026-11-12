import path from "node:path";
import type { NextConfig } from "next";

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
