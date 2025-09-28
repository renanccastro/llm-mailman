/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@ai-dev/shared'],
  },
  transpilePackages: ['@ai-dev/shared'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_WS_URL: process.env.WEBSOCKET_URL || 'ws://localhost:4000',
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    NEXT_PUBLIC_API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:4000/api/v1',
  },
}

module.exports = nextConfig