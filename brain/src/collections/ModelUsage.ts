import type { CollectionConfig } from 'payload'

/**
 * ModelUsage — PLATFORM-GLOBAL (not tenant-scoped) per-model call telemetry, so the
 * operator can see, on /admin/settings, which configured models actually carry the load
 * and which fail/overload. One row per model slug, incremented best-effort after every
 * `chat()` model attempt (see agent/recordModelUsage.ts). Operator-read-only; all writes
 * go through the broker with overrideAccess.
 */
export const ModelUsage: CollectionConfig = {
  slug: 'modelUsage',
  admin: { useAsTitle: 'model', hidden: true },
  access: {
    read: ({ req }) => Boolean(req.user?.isOperator),
    create: () => false,
    update: () => false,
    delete: ({ req }) => Boolean(req.user?.isOperator),
  },
  fields: [
    { name: 'model', type: 'text', required: true, unique: true, index: true },
    { name: 'calls', type: 'number', defaultValue: 0 }, // successful completions
    { name: 'fails', type: 'number', defaultValue: 0 }, // HTTP error / timeout / empty
    { name: 'promptTokens', type: 'number', defaultValue: 0 },
    { name: 'completionTokens', type: 'number', defaultValue: 0 },
    { name: 'lastUsedAt', type: 'date' },
  ],
}
