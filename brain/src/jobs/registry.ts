import { spawn, type ChildProcess } from 'node:child_process'

/**
 * In-memory registry of LIVE jobs — the fast, high-frequency source of truth for a
 * running operation's percent/logs, its cancel flag, and the currently-spawned child
 * process (so cancel can kill it). Mirrored to Postgres (src/jobs/store.ts) at stage
 * boundaries for durability across a refresh / server restart.
 *
 * Kept on `globalThis` so it survives Next.js dev HMR (module re-evaluation).
 */

/** Thrown by a stage when a cancel was requested between stages. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}

export type LogFlavor = 'info' | 'ok' | 'error'
export interface JobLog {
  at: number
  text: string
  flavor: LogFlavor
}
export type JobType = 'connect' | 'publish' | 'delete'
export type JobStatus = 'running' | 'cancelling' | 'done' | 'error' | 'cancelled'

export interface LiveJob {
  jobId: number
  tenant: number
  siteId: number | null
  type: JobType
  percent: number
  stage: string
  logs: JobLog[]
  cancelRequested: boolean
  child?: ChildProcess
}

/** A stage reporter: bump the percent + add a one-line human log. */
export type JobReporter = (percent: number, text: string, flavor?: LogFlavor) => void

/** Passed into the long-running functions so they can report progress + honor cancel. */
export interface JobCtx {
  reporter: JobReporter
  shouldCancel: () => boolean
  registerChild: (child: ChildProcess) => void
}

/** A no-op context, so the long functions can still be called outside a job. */
export const noopCtx: JobCtx = { reporter: () => {}, shouldCancel: () => false, registerChild: () => {} }

export const LOG_CAP = 50

const g = globalThis as unknown as {
  __saJobs?: Map<number, LiveJob>
  __saJobsRunning?: Set<Promise<unknown>>
}
const registry: Map<number, LiveJob> = (g.__saJobs ??= new Map())
/** Holds in-flight detached promises so the GC can't collect them mid-run. */
const running: Set<Promise<unknown>> = (g.__saJobsRunning ??= new Set())

export function startLive(meta: { jobId: number; tenant: number; siteId: number | null; type: JobType }): LiveJob {
  const live: LiveJob = { ...meta, percent: 0, stage: '', logs: [], cancelRequested: false }
  registry.set(meta.jobId, live)
  return live
}

export function getLive(jobId: number): LiveJob | undefined {
  return registry.get(jobId)
}

export function removeLive(jobId: number): void {
  registry.delete(jobId)
}

/** Record progress in the live entry (memory only). Caller mirrors to Postgres. */
export function report(jobId: number, percent: number, text: string, flavor: LogFlavor = 'info'): LiveJob | undefined {
  const live = registry.get(jobId)
  if (!live) return undefined
  live.percent = percent
  live.stage = text
  live.logs.push({ at: Date.now(), text, flavor })
  if (live.logs.length > LOG_CAP) live.logs = live.logs.slice(-LOG_CAP)
  return live
}

export function shouldCancel(jobId: number): boolean {
  return registry.get(jobId)?.cancelRequested ?? false
}

export function registerChild(jobId: number, child: ChildProcess): void {
  const live = registry.get(jobId)
  if (live) live.child = child
}

export function clearChild(jobId: number): void {
  const live = registry.get(jobId)
  if (live) live.child = undefined
}

/** Kill a process AND its descendants (git/npm/wrangler grandchildren). */
export function killTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === 'win32') {
    // `taskkill /T` walks the whole tree by pid — the only reliable kill on Windows,
    // where `child.kill()` on a shell-wrapped spawn would leave the real process alive.
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {})
  } else {
    // POSIX children are spawned `detached`, so `-pid` targets the process group.
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }
}

/** Mark cancel requested + kill any active child immediately. */
export function requestCancel(jobId: number): boolean {
  const live = registry.get(jobId)
  if (!live) return false
  live.cancelRequested = true
  killTree(live.child?.pid)
  return true
}

/** Keep a detached job promise referenced until it settles. */
export function trackRunning(p: Promise<unknown>): void {
  running.add(p)
  void p.finally(() => running.delete(p))
}
