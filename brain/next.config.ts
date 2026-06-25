import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  devIndicators: false,
  // `sharp` is a native module — never bundle it (it must be require()'d at runtime).
  // Without this, Turbopack (`dev:fast`) fails with "Cannot find module 'sharp-<hash>'".
  serverExternalPackages: ['sharp'],
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

// `devBundleServerPackages: true` lets Payload's server packages be bundled rather than
// kept external — required for Turbopack (`dev:fast`) on Next 16, which otherwise fails to
// resolve the externalized `payload` / `@payloadcms/db-postgres` modules. The only package
// that must stay external is the native `sharp` (see `serverExternalPackages` above).
export default withPayload(nextConfig, { devBundleServerPackages: true })
