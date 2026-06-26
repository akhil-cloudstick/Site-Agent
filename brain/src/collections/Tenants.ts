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
    {
      // Tenant-controlled gate: when true, an operator impersonating this tenant
      // may EDIT (not just view) the workspace. Default false = operator is
      // view-only. Only a real member of this tenant may flip it (the toggle route
      // rejects impersonating operators) — Codex R1 #9 / R2 #8.
      name: 'allowOperatorEdit',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Allow a platform operator to edit this site while impersonating.' },
    },
    // Operator-set plan label (free text, e.g. "Free" / "Pro"). Display-only in v1.
    { name: 'planLabel', type: 'text', admin: { description: 'Plan label shown on the operator dashboard.' } },
    // The published site's public URL (set on a successful Cloudflare publish).
    { name: 'liveUrl', type: 'text' },
    // Set later by real provisioning (Module 3); unused in slice 1.
    { name: 'githubRepo', type: 'text' },
    { name: 'deployTargets', type: 'json' },
  ],
}
