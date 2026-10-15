/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: '/gps-logger', // リポジトリ名に合わせる
};

export default nextConfig;
