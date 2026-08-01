/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ESLint telt weer mee bij de build. Stond op negeren, waardoor lintfouten
  // nooit ergens tegenaan liepen. Waarschuwingen blokkeren een build niet, dus
  // alleen echte fouten houden je nu tegen.
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
