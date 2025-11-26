import { withSentryConfig } from "@sentry/nextjs";
import { fileURLToPath } from "url";
import path from "path";
import { existsSync } from "fs";

const asyncStorageShimPath = fileURLToPath(new URL("./lib/asyncStorageShim.ts", import.meta.url));
const frontendRoot = fileURLToPath(new URL(".", import.meta.url));
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable source maps for better error tracking
  productionBrowserSourceMaps: true,
  // Enable server-side source maps for TypeScript stack traces
  experimental: {
    serverSourceMaps: true,
    externalDir: true,
  },
  turbopack: {
    root: frontendRoot,
  },
  // Silence warnings
  // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
  webpack: (config, { isServer }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");

    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias["@react-native-async-storage/async-storage"] = asyncStorageShimPath;
    
    // Ensure drizzle-orm resolves correctly in both local and CI environments
    // process.cwd() will be the frontend directory when running npm commands from frontend/
    const frontendDir = process.cwd();
    const localDrizzlePath = path.resolve(frontendDir, 'node_modules/drizzle-orm');
    const parentDrizzlePath = path.resolve(frontendDir, '../node_modules/drizzle-orm');
    
    // Use local node_modules if it exists, otherwise try parent (for monorepo setups)
    const drizzlePath = existsSync(localDrizzlePath) ? localDrizzlePath : parentDrizzlePath;
    
    config.resolve.alias['drizzle-orm'] = drizzlePath;
    config.resolve.alias['drizzle-orm/node-postgres'] = path.resolve(drizzlePath, 'node-postgres');

    // Ensure source maps are generated for TypeScript files
    if (config.mode === 'production') {
      config.devtool = 'source-map';
    }

    return config;
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG || "gmgmgm",

  project: process.env.SENTRY_PROJECT || "chessball",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Only upload source maps if auth token is provided
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});