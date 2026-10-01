import type { NextConfig } from "next";

// Static export: the Go server (api/) serves `out/` and the API from one origin.
// The same export also works on any static host, with the live widgets degrading gracefully.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
