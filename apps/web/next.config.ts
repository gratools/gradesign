import type { NextConfig } from "next";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (process.env.NODE_ENV === "production" ? "/gradesign" : "");
const config: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  webpack(config) {
    config.resolve.alias.canvas = false;
    return config;
  },
};
export default config;
