const isPages = process.env.GITHUB_PAGES === 'true'

const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', '192.168.1.18'],
  devIndicators: false,
  output: 'export',
  ...(isPages ? { basePath: '/generate-memo' } : {}),
  turbopack: { root: process.cwd() }
}

export default nextConfig
