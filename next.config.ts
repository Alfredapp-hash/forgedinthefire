import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

// Prevent Turbopack from walking up to ~/package-lock.json and treating $HOME as the app root.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@shiguredo/rnnoise-wasm', 'mediabunny'],
  turbopack: {
    root: projectRoot,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // The brand lockup is fine metallic detail on near-black; the default 75
    // introduces visible banding in the flame.
    qualities: [75, 90, 95],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
    ],
  },
  async headers() {
    return [
      {
        // Everything except the public podcast embed player may not be framed.
        source: '/((?!podcast/embed).*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
        ],
      },
      {
        // Guest join links carry a secret token: never leak it via Referer.
        source: '/studio/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // No redirects needed - /admin serves the dashboard directly
    ];
  },
};

export default nextConfig;
