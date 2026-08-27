import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent serverless functions from bundling canvas or node pdfjs dependencies
  serverExternalPackages: ['pdfjs-dist'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
