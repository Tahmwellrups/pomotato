import type { NextConfig } from "next";

// Pages serves the app from /<repo>, so the sub-path has to be baked into the
// bundle at build time. The workflow sets it; dev and local builds leave it
// empty and keep running at the root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // No route handlers, no server functions — everything lives in IndexedDB on
  // the client, so the whole app exports to static files.
  output: "export",
  basePath,
};

export default nextConfig;
