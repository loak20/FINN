/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lint is not part of the build pipeline for this prototype; `npm run typecheck` covers types.
  eslint: { ignoreDuringBuilds: true },
  // cheerio pulls in undici/parse5; keep it as a plain Node dependency instead of bundling it.
  serverExternalPackages: ['cheerio'],
};

export default nextConfig;
