import type { CollectionConfig } from 'payload'

import { CHANGESET_STATUSES } from '../lib/changeset/status'

/**
 * ChangeSets — the join key between the two stores (content + code) and the
 * publish state machine. The full status enum is implemented now even though
 * slice 1 only exercises active -> published|aborted, so the one-active-
 * ChangeSet partial-unique-index (added as custom SQL in the migration) is
 * correct from day one (Codex R1 #1 / R2). siteId == tenant in v1 (see
 * PENDING.md: explicit siteId column deferred to the future multi-Site split).
 */
export const Changesets: CollectionConfig = {
  slug: 'changesets',
  admin: { useAsTitle: 'id' },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [...CHANGESET_STATUSES],
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'content',
      options: ['content', 'structural'],
    },
    { name: 'gitBranch', type: 'text' },
    { name: 'headSha', type: 'text' },
    { name: 'previewDeploymentId', type: 'text' },
    { name: 'productionDeploymentId', type: 'text' },
    // The human initiator (audit only) — never the principal a write runs as.
    { name: 'initiatedBy', type: 'relationship', relationTo: 'users' },
    // The operator who last edited this ChangeSet while impersonating the tenant (abuse
    // traceability). The write itself still runs as the tenant's service principal.
    { name: 'impersonatedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'correlationId', type: 'text', index: true },
    { name: 'publishedAt', type: 'date' },
  ],
}
