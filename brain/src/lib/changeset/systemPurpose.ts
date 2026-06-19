/**
 * Typed allowlist of system/bootstrap write purposes permitted to bypass the
 * normal "every tenant-content write belongs to an active ChangeSet" rule
 * (Architecture.md §B, PLAN.md m4-system-deny). Keep this list tiny and explicit.
 *
 * Any tenant-content write that carries a `req.context.systemPurpose` NOT in
 * this list is rejected — so a Job/system call cannot quietly write tenant
 * content outside a ChangeSet.
 */
export const ALLOWED_SYSTEM_PURPOSES = ['bootstrap'] as const

export type SystemPurpose = (typeof ALLOWED_SYSTEM_PURPOSES)[number]

export const isAllowedSystemPurpose = (value: unknown): value is SystemPurpose =>
  typeof value === 'string' && (ALLOWED_SYSTEM_PURPOSES as readonly string[]).includes(value)
