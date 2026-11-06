/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['@sales-hub/shared'],
  // o lint do monorepo roda via `pnpm lint` (eslint flat) na raiz, não no build
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
