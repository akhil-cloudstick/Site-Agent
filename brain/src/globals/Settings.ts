import type { GlobalConfig } from 'payload'

import { invalidateAiSettingsCache } from '../agent/aiSettingsCache'

/**
 * Platform-global settings (single doc). Holds the AI provider/model config and the
 * encrypted AI API key (Codex R1 #16/#17). Operator-only read & update.
 *
 * The key lives in `aiApiKeyCiphertext` as AES-256-GCM ciphertext (see secretBox).
 * Its field-level `read: () => false` strips it from EVERY external result
 * (REST / GraphQL / Local API) unless the caller passes `overrideAccess: true` —
 * which only the in-process accessor (`agent/aiSettings.ts`) does. Clients only ever
 * see the derived `hasAiApiKey` boolean, never the ciphertext or plaintext.
 */
export const Settings: GlobalConfig = {
  slug: 'settings',
  access: {
    read: ({ req }) => Boolean(req.user?.isOperator),
    update: ({ req }) => Boolean(req.user?.isOperator),
  },
  hooks: {
    // Drop the in-process AI-settings cache whenever settings change (Codex R1 #18).
    afterChange: [
      () => {
        invalidateAiSettingsCache()
      },
    ],
  },
  fields: [
    {
      name: 'aiProvider',
      type: 'select',
      required: true,
      defaultValue: 'openrouter',
      options: ['openrouter'],
    },
    {
      name: 'aiModels',
      type: 'array',
      labels: { singular: 'Model', plural: 'Models' },
      admin: { description: 'Ordered model slugs; tried in order until one responds.' },
      fields: [{ name: 'slug', type: 'text', required: true }],
    },
    {
      // Encrypted at rest. NEVER returned to a client (read:false). Written only via
      // the operator settings route, which encrypts the plaintext before storing.
      name: 'aiApiKeyCiphertext',
      type: 'text',
      access: { read: () => false },
      admin: { hidden: true, readOnly: true },
    },
  ],
}
