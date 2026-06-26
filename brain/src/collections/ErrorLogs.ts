import type { CollectionConfig } from 'payload'

/**
 * ErrorLogs — a durable, TENANT-SCOPED record of failures a tenant hit, so the operator
 * can see on /admin/errors WHAT the tenant tried and WHY it failed (a failed page-create,
 * publish, connect, an overloaded model, etc.). Written best-effort from each failure seam
 * via operator/errorLog.ts `logTenantError` (and the job runner on job failure). Job errors
 * are already mirrored to the Jobs row; logging here too makes this page one source of truth.
 *
 * Tenant-scoped via the multi-tenant plugin (adds the `tenant` field). Operator-read-only;
 * all writes go through the broker with overrideAccess.
 */
export const ErrorLogs: CollectionConfig = {
  slug: 'errorLogs',
  admin: { useAsTitle: 'action', hidden: true },
  access: {
    read: ({ req }) => Boolean(req.user?.isOperator),
    create: () => false,
    update: () => false,
    delete: ({ req }) => Boolean(req.user?.isOperator),
  },
  fields: [
    // What the tenant was trying to do, e.g. 'connect_site' | 'publish' | 'edit_content'
    // | 'create_page' | 'generate_section' | 'ai_chat'.
    { name: 'action', type: 'text', required: true, index: true },
    // Human one-line reason (never a raw stack/terminal dump).
    { name: 'message', type: 'text', required: true },
    // Optional longer context (truncated).
    { name: 'detail', type: 'text' },
    // The ConnectedSites id involved (loose number; null for builder/page actions).
    { name: 'siteId', type: 'number' },
    // Who triggered it (the member, or the impersonating operator).
    { name: 'userId', type: 'number' },
  ],
}
