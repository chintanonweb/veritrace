/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship as TS source; let Next transpile them.
  transpilePackages: [
    "@veritrace/core",
    "@veritrace/sdk",
    "@veritrace/anchor",
    "@veritrace/verifier",
    "@veritrace/score",
  ],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
