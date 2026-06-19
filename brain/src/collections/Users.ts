import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    // Email added by default.
    // Operator = the platform owner / super-admin who can access ALL tenants.
    // Tenant members get their tenant via the multi-tenant plugin's `tenants`
    // array (added to this collection by the plugin).
    {
      name: 'isOperator',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Operator/super-admin: access to all tenants.' },
    },
    {
      // The agent/broker acts AS this machine identity (one per tenant), never
      // as a human user — so it can't inherit a human editor/admin's powers.
      name: 'isServicePrincipal',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Machine identity the broker writes as for its tenant.' },
    },
  ],
  versions: false,
}
