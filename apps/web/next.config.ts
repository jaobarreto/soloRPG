import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
    return [
      {
        source: '/api/v1/health/:path*',
        destination: `${api}/api/v1/health/:path*`,
      },
    ];
  },
};
export default nextConfig;
