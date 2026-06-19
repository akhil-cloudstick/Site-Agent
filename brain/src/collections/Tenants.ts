import type { CollectionConfig } from 'payload'

/**
 * Tenants — one row per Operator customer (one Site per Tenant in v1).
 * In a later task the multi-tenant plugin will use this as its tenants
 * collection; for now it is a plain collection holding Site attributes.
 */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'provisioning',
      options: ['provisioning', 'active', 'suspended', 'failed'],
    },
    // Set later by real provisioning (Module 3); unused in slice 1.
    { name: 'githubRepo', type: 'text' },
    { name: 'deployTargets', type: 'json' },
  ],
}
