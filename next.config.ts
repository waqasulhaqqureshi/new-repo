import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser microphone requires a secure origin. These development-only
  // allowlists let the same app work through ngrok and Arena's HTTPS preview.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.e2b.app",
  ],
};

export default nextConfig;
