import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-localstorage"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("node-localstorage");
    }
    return config;
  },
};

export default nextConfig;
