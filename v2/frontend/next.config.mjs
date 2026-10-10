/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export to `out/`, served by the ICP asset canister. There is no
  // server: all data comes from the backend canister.
  output: "export",
  // `/game/` is served as `/game/index.html` by the asset canister.
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Silence warnings
  // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
