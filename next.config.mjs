/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // De testversie (poort 3004) draait naast de live Dash in dezelfde map. Twee
  // dev-servers in één .next zitten elkaar in de weg, dus test krijgt .next-test.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // ESLint telt weer mee bij de build. Stond op negeren, waardoor lintfouten
  // nooit ergens tegenaan liepen. Waarschuwingen blokkeren een build niet, dus
  // alleen echte fouten houden je nu tegen.
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
