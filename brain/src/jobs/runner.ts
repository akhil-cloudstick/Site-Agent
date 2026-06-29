import {
  CancelledError,
  clearChild,
  getLive,
  registerChild as registerChildLive,
  removeLive,
  report,
  shouldCancel as shouldCancelLive,
  startLive,
  trackRunning,
  type JobCtx,
  type JobType,
} from './registry'
import { createJob, updateJob } from './store'

/** What a job's work returns on success — the payload the UI needs to finish up. */
export type JobResult = Record<string, unknown>

export interface JobSpec {
  tenant: number
  type: JobType
  siteId: number | null
  /** The actual long-running operation. Reports progress + honors cancel via `ctx`. */
  work: (ctx: JobCtx) => Promise<JobResult | void>
  /**
   * Cleanup run when the job is CANCELLED or FAILS (e.g. remove the cloned folder).
   * Receives a reporter so it can show its own progress ("Cancelling… removing files…").
   */
  cleanup?: (report: (text: string) => void, reason: 'cancelled' | 'error') => Promise<void>
}

/**
 * Start a job: create the durable row + live entry, then run `work` DETACHED (not
 * awaited) so the HTTP response returns immediately with the jobId. Progress streams
 * into the live registry and mirrors to Postgres at each reporter call (stage boundary).
 * Relies on this being a single persistent node — the detached promise keeps running
 * after the response; stale-job reaping is the backstop if the node dies mid-job.
 */
export async function startJob(spec: JobSpec): Promise<number> {
  const jobId = await createJob(spec.tenant, spec.type, spec.siteId)
  startLive({ jobId, tenant: spec.tenant, siteId: spec.siteId, type: spec.type })

  const ctx: JobCtx = {
    reporter: (percent, text, flavor = 'info') => {
      const live = report(jobId, percent, text, flavor)
      // Mirror to Postgres at the stage boundary (bounded — a handful of calls per job).
      void updateJob(spec.tenant, jobId, {
        percent: live?.percent ?? percent,
        stage: text,
        logs: live?.logs ?? [],
      })
    },
    shouldCancel: () => shouldCancelLive(jobId),
    registerChild: (child) => registerChildLive(jobId, child),
  }

  const run = (async () => {
    try {
      const result = (await spec.work(ctx)) || {}
      await updateJob(spec.tenant, jobId, {
        status: 'done',
        percent: 100,
        result,
        logs: getLive(jobId)?.logs ?? [],
        finishedAt: new Date().toISOString(),
      })
    } catch (err) {
      const cancelled = err instanceof CancelledError || shouldCancelLive(jobId)
      if (cancelled) {
        // User cancel: show "removing files…" progress, then mark cancelled.
        if (spec.cleanup) {
          try {
            await spec.cleanup((text) => ctx.reporter(getLive(jobId)?.percent ?? 0, text, 'info'), 'cancelled')
          } catch {
            /* best-effort cleanup */
          }
        }
        await updateJob(spec.tenant, jobId, { status: 'cancelled', logs: getLive(jobId)?.logs ?? [], finishedAt: new Date().toISOString() })
      } else {
        // Real failure: surface the reason IMMEDIATELY (don't let cleanup, which can
        // be slow on a network drive, block the terminal state), then tidy up quietly.
        console.error(`[job ${jobId}/${spec.type}] failed:`, err)
        await updateJob(spec.tenant, jobId, {
          status: 'error',
          error: humanError(err),
          logs: getLive(jobId)?.logs ?? [],
          finishedAt: new Date().toISOString(),
        })
        // (Job failures are surfaced on /admin/errors by merging the Jobs collection — see
        // operator/errorLog.ts loadOperatorErrors — so we don't double-log them here.)
        if (spec.cleanup) {
          try {
            await spec.cleanup(() => {}, 'error')
          } catch {
            /* best-effort cleanup */
          }
        }
      }
    } finally {
      clearChild(jobId)
      // Keep the live entry briefly so a final poll still reads smooth state, then drop it.
      setTimeout(() => removeLive(jobId), 10_000)
    }
  })()
  trackRunning(run)
  return jobId
}

/** A short, human one-line message — never a raw stack/terminal dump. */
function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.split('\n')[0].slice(0, 300) || 'Something went wrong.'
}
