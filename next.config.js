/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.ctfassets.net',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/airbnb',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
