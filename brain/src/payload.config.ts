import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import type { Config as PayloadGeneratedConfig } from './payload-types'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Tenants } from './collections/Tenants'
import { Changesets } from './collections/Changesets'
import { Pages } from './collections/Pages'
import { ConnectedSites } from './collections/ConnectedSites'
import { Jobs } from './collections/Jobs'
import { ModelUsage } from './collections/ModelUsage'
import { ErrorLogs } from './collections/ErrorLogs'
import { Settings } from './globals/Settings'
import { getEnv } from './config/env'

const env = getEnv()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      // A "back to the operator dashboard" link at the top of Payload's nav.
      beforeNavLinks: ['/components/BackToAdminLink#BackToAdminLink'],
    },
  },
  // Payload's own admin UI moves to /admin/payload so the app can own /admin for the
  // custom operator dashboard. Payload regenerates its internal admin/asset/redirect
  // links from this value (the physical route folder is moved to match).
  routes: {
    admin: '/admin/payload',
  },
  collections: [Users, Media, Tenants, Changesets, Pages, ConnectedSites, Jobs, ModelUsage, ErrorLogs],
  globals: [Settings],
  // Expected access-control denials (403 "not allowed") are logged at ERROR with
  // a full stack by default — far too noisy. Drop them below the default visible
  // level so the console shows only genuine problems. Real (non-Forbidden) errors
  // still log normally.
  loggingLevels: {
    Forbidden: 'debug', // access denied (403)
    AuthenticationError: 'debug', // wrong email/password (401)
    ValidationError: 'debug', // bad input (400)
    NotFound: 'debug', // 404
    Locked: 'debug',
    LockedAuth: 'debug',
    UnverifiedEmail: 'debug',
  },
  editor: lexicalEditor(),
  secret: env.payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // Never auto-sync schema (dev "push"); always go through migrations. Prevents
    // stray "dev" migration entries and push-vs-migrate conflicts (esp. for
    // `payload run` scripts, which otherwise default to dev/push).
    push: false,
    pool: {
      connectionString: env.databaseUrl,
    },
  }),
  sharp,
  plugins: [
    // Row-level tenant scoping. Adds a `tenant` field to the listed collections
    // and a `tenants` array to users. Operators (super-admins) see all tenants.
    multiTenantPlugin<PayloadGeneratedConfig>({
      collections: {
        pages: {},
        media: {},
        connectedSites: {},
        jobs: {},
        errorLogs: {},
      },
      userHasAccessToAllTenants: (user) => Boolean(user?.isOperator),
    }),
  ],
})
