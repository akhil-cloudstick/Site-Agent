/**
 * ChangeSet status — the single source of truth for the state machine.
 *
 * This list is imported by the Changesets collection (the `select` options),
 * the transition guard, AND the SQL partial-unique-index migration. Keeping
 * one definition is load-bearing: Codex flagged (R1 #1 / R2) that if the
 * index's predicate and the app's "blocking" set ever drift, a Site could
 * either get a second active ChangeSet or be wrongly locked. A unit test
 * asserts the constants and the migration predicate agree.
 *
 * Full state machine + meanings: docs/DB-Architecture.md.
 */

export const CHANGESET_STATUSES = [
  'active',
  'previewing',
  'publishing',
  'published',
  'aborted',
  'deployed_pending_publish',
  'failed_deploy_reverted',
  'rolled_back_from_deployed_pending_publish',
] as const

export type ChangesetStatus = (typeof CHANGESET_STATUSES)[number]

/**
 * States in which a Site must NOT be given a new ChangeSet (the
 * one-active-ChangeSet invariant). MUST equal the SQL partial-unique-index
 * predicate in the migration and the transition guard's blocking set.
 */
export const BLOCKING_STATUSES = [
  'active',
  'previewing',
  'publishing',
  'deployed_pending_publish',
] as const satisfies readonly ChangesetStatus[]

/** Terminal / non-blocking states — a Site is publishable again. */
export const TERMINAL_STATUSES = [
  'published',
  'aborted',
  'failed_deploy_reverted',
  'rolled_back_from_deployed_pending_publish',
] as const satisfies readonly ChangesetStatus[]

export const isBlockingStatus = (s: ChangesetStatus): boolean =>
  (BLOCKING_STATUSES as readonly string[]).includes(s)
