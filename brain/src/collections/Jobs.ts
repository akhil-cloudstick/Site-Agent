import type { CollectionConfig } from 'payload'

/**
 * Jobs — a durable record of a long-running operation (connect / publish / delete)
 * on a ConnectedSite, so progress survives a page refresh AND a dev-server restart.
 *
 * Live progress (smooth %/logs, cancel flag, the spawned child process) lives in an
 * in-memory registry (src/jobs/registry.ts); this row is the durable mirror, updated
 * at each stage boundary + on completion. On restart the registry is empty, so a row
 * still `running`/`cancelling` with no live entry is detected as stale and cleaned up.
 *
 * Tenant-scoped via the multi-tenant plugin (same as ConnectedSites).
 */
export const Jobs: CollectionConfig = {
  slug: 'jobs',
  admin: { useAsTitle: 'type' },
  fields: [
    { name: 'type', type: 'select', options: ['connect', 'publish', 'delete'], required: true },
    // The ConnectedSites id this job acts on. A loose number (not a relationship) so the
    // job row survives even if the site record is deleted (e.g. a cancelled connect).
    { name: 'siteId', type: 'number' },
    { name: 'status', type: 'select', options: ['running', 'cancelling', 'done', 'error', 'cancelled'], defaultValue: 'running' },
    { name: 'percent', type: 'number', defaultValue: 0 },
    { name: 'stage', type: 'text' },
    // One-line human logs: [{ at, text, flavor: 'info'|'ok'|'error' }], capped at 50 in code.
    { name: 'logs', type: 'json' },
    // A human one-line failure message (never a raw stack/terminal dump).
    { name: 'error', type: 'text' },
    // Completion payload the UI needs (e.g. { url, pagePaths, name }).
    { name: 'result', type: 'json' },
    { name: 'finishedAt', type: 'date' },
  ],
}
