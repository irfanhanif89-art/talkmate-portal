import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // puppeteer-core + @sparticuz/chromium must NOT be webpack-bundled. Marking them
  // external keeps them in node_modules at runtime so @sparticuz/chromium's brotli
  // Chromium binary is traced into the serverless function (otherwise executablePath()
  // throws "The input directory ... does not exist").
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Ship the proposal templates + self-hosted fonts into the serverless
  // bundles that read them at runtime (PDF render + confirmation page).
  outputFileTracingIncludes: {
    '/api/sales/send-proposal': ['./src/lib/proposal/templates/**', './public/fonts/**'],
    '/api/sales/proposals/quick-send': ['./src/lib/proposal/templates/**', './public/fonts/**'],
    '/p/accept/[token]': ['./src/lib/proposal/templates/**', './public/fonts/**'],
  },
  async redirects() {
    return [
      {
        source: '/command',
        destination: '/command-centre',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
