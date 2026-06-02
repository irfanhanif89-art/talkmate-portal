import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // puppeteer-core + @sparticuz/chromium must NOT be webpack-bundled.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Trace the proposal templates, fonts, AND the @sparticuz/chromium binary
  // (bin/*.br) into the serverless functions that render the PDF. Without the
  // chromium path, executablePath() throws "The input directory ... does not exist".
  outputFileTracingIncludes: {
    '/api/sales/send-proposal': ['./src/lib/proposal/templates/**', './public/fonts/**', './node_modules/@sparticuz/chromium/**'],
    '/api/sales/proposals/quick-send': ['./src/lib/proposal/templates/**', './public/fonts/**', './node_modules/@sparticuz/chromium/**'],
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
