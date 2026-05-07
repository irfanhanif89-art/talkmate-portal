import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
