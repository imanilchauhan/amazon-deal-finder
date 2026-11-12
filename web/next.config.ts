import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Pin the workspace root so a stray lockfile higher up the tree is not picked instead.
  turbopack: { root: path.resolve(import.meta.dirname) },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
