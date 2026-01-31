import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-localstorage"],
  webpack: (config, { isServer }) => {
    // Handle node-localstorage for server
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("node-localstorage");
    }
    // Fallback for fs (client-side)
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

export default nextConfig;
