import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig, { dev }) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    // The project lives on a UNC/network drive (\\ZAISERVER) where native fs
    // events don't work (Watchpack "UNKNOWN" errors). Force polling-based
    // watching in dev so hot-reload works and the watcher stops erroring.
    if (dev) {
      webpackConfig.watchOptions = {
        poll: 800,
        aggregateTimeout: 300,
        ignored: ['**/node_modules', '**/.next', '**/.git'],
      }
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
