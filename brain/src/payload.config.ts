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
  },
  collections: [Users, Media, Tenants, Changesets, Pages],
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
      },
      userHasAccessToAllTenants: (user) => Boolean(user?.isOperator),
    }),
  ],
})
