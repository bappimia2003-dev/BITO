import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@bito/shared', '@bito/engine', '@bito/integrations', '@bito/nodes'],
};

export default nextConfig;
