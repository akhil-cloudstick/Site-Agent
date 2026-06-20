import type { CollectionConfig } from 'payload'

import { pageBlocks } from '../blocks'
import { stampActiveChangeSet } from '../lib/changeset/stampActiveChangeSet'

/**
 * Pages — tenant-scoped content. Every row carries a NOT NULL `tenant` and
 * `changeSetId` (stamped by the `beforeValidate` hook). Drafts/versions on.
 *
 * Content is the dynamic `layout` — an ordered list of section blocks (hero,
 * features, testimonials, cta, contact, richText), any number in any order.
 * `theme` styles the whole page.
 *
 * NOTE: the old fixed group fields (hero/features/cta/testimonials/contact) are
 * kept temporarily so the migration is additive (no interactive rename prompt);
 * they are unused by the app now and get dropped in a later cleanup migration.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  hooks: {
    beforeValidate: [stampActiveChangeSet],
  },
  fields: [
    {
      name: 'changeSetId',
      type: 'relationship',
      relationTo: 'changesets',
      required: true,
      index: true,
    },
    { name: 'title', type: 'text', required: true },
    // The page's route key within the site: 'home' => /, 'about' => /about.
    { name: 'slug', type: 'text', index: true },
    // Label shown for this page in the site's nav menu.
    { name: 'navLabel', type: 'text' },
    // Position of this page in the nav menu (lower = earlier).
    { name: 'navOrder', type: 'number', defaultValue: 0 },
    {
      name: 'theme',
      type: 'group',
      fields: [
        { name: 'primaryColor', type: 'text' },
        { name: 'font', type: 'select', options: ['sans', 'serif'], defaultValue: 'sans' },
      ],
    },
    // The dynamic stack of sections (the model the app uses).
    {
      name: 'layout',
      type: 'blocks',
      blocks: pageBlocks,
    },
    // Snapshot of the layout before the most recent change — powers one-level Undo.
    { name: 'previousLayout', type: 'json', admin: { hidden: true } },
  ],
}
