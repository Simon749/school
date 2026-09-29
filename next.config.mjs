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
      allowedOrigins: [
        "localhost:3000",
      ],
    },
  },
  // 1. Allow the build to succeed even with ESLint warnings/errors
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 2. Tell Next.js not to bundle these server-side packages
  serverExternalPackages: ["bullmq", "ioredis", "@valkey/valkey-glide"],
  // 3. Explicitly tell Webpack to ignore the missing optional valkey dependency
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "@valkey/valkey-glide"];
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