import type { CollectionConfig } from 'payload'

import { stampActiveChangeSet } from '../lib/changeset/stampActiveChangeSet'

/**
 * Pages — tenant-scoped content. Every row carries a NOT NULL `tenant` and
 * `changeSetId` (DB-Architecture.md). `changeSetId` is `required` here, and
 * will be stamped automatically by the shared `beforeChange` hook in a later
 * task (m4-beforechange) so editors never set it by hand. Drafts/versions are
 * on so content accumulates as drafts until Publish.
 *
 * Slice 1 keeps the content model intentionally tiny (a hero) — the real
 * Section-primitive page-builder blocks are a later module.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  hooks: {
    // Forces every write into the Tenant's active ChangeSet (or rejects it).
    beforeValidate: [stampActiveChangeSet],
  },
  fields: [
    // `tenant` is added automatically by the multi-tenant plugin (do not add it
    // here — that would duplicate the field). See payload.config.ts.
    {
      name: 'changeSetId',
      type: 'relationship',
      relationTo: 'changesets',
      required: true,
      index: true,
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'hero',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text' },
        { name: 'subheading', type: 'text' },
      ],
    },
  ],
}
