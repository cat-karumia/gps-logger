/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '/gps-logger',
  assetPrefix: isProd ? '/gps-logger/' : '',
};

export default nextConfig;
