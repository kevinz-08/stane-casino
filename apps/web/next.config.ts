import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@casino/shared', '@casino/game-engine'],
};

export default nextConfig;
