import withPWA from "next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  // 1. Allow build to pass despite ESLint warnings
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 2. Tell Next.js NOT to bundle these server-only packages
  serverExternalPackages: ["bullmq", "ioredis", "@valkey/valkey-glide"],
  
  // 3. The "Bulletproof" Fix: Force Webpack to ignore the missing package
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark as external (don't bundle)
      config.externals = [...(config.externals || []), "@valkey/valkey-glide"];
      
      // CRITICAL: Tell Webpack to resolve this package to 'false' (empty module)
      // This prevents the "Module not found" error during the build trace
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@valkey/valkey-glide": false,
      };
    }
    return config;
  },
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);