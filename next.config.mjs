const nextConfig = {
  distDir: process.env.JOBMAX_NEXT_DIST_DIR?.trim() || ".next",
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*"
    ]
  }
};

export default nextConfig;
