import withPWA from 'next-pwa';

// Server Actions only accept same-origin requests; list the deployed host plus localhost for dev.
const allowedOrigins = ['localhost:3000'];
if (process.env.NEXT_PUBLIC_APP_URL) {
  try {
    allowedOrigins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).host);
  } catch {
    /* invalid URL: ignore here, env validation reports it where it is used */
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'images.clerk.dev' },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: allowedOrigins,
    },
    // Next 14 key (serverExternalPackages is Next 15+): keep server-only packages out of the bundle
    serverComponentsExternalPackages: ['bullmq', 'ioredis'],
  },
  // Lint errors fail the build (warnings do not). CI also runs `pnpm run lint`.
  eslint: {
    ignoreDuringBuilds: false,
  },

  // @valkey/valkey-glide is an optional peer of BullMQ that we do not use. Alias it away so the
  // build trace does not fail on it (kept deliberately; revisit when BullMQ is upgraded).
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark as external (don't bundle)
      config.externals = [...(config.externals || []), '@valkey/valkey-glide'];

      // CRITICAL: Tell Webpack to resolve this package to 'false' (empty module)
      // This prevents the "Module not found" error during the build trace
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@valkey/valkey-glide': false,
      };
    }
    return config;
  },
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig);
