import { spawn, type ChildProcess } from 'node:child_process'
import { cp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { CancelledError, noopCtx, type JobCtx } from '../jobs/registry'
import type { PageHtmlMap } from './store'

/** List every file under a directory (relative paths, '/'-separated). */
async function listFiles(dir: string, base = ''): Promise<string[]> {
  const ents = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const e of ents) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) files.push(...(await listFiles(path.join(dir, e.name), rel)))
    else files.push(rel)
  }
  return files
}

/** Map a built HTML file path to its route. index.html→/, about/index.html→/about, about.html→/about. */
export function pathnameFromFile(relFile: string): string {
  const p = relFile.replace(/\\/g, '/')
  if (p === 'index.html') return '/'
  if (p.endsWith('/index.html')) return '/' + p.slice(0, -'/index.html'.length)
  if (p.endsWith('.html')) return '/' + p.slice(0, -'.html'.length)
  return '/' + p
}

function run(cmd: string, args: string[], cwd: string, onChild?: (c: ChildProcess) => void): Promise<number> {
  return new Promise((resolve) => {
    // POSIX: `detached` puts the child in its own process group so cancel can kill the
    // whole tree via `-pid`. Windows uses `taskkill /T` by pid, so no detach needed.
    const child = spawn(cmd, args, { cwd, shell: true, stdio: 'ignore', detached: process.platform !== 'win32' })
    onChild?.(child)
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

/** Common built-output folder names a static site produces. */
const OUTPUT_DIRS = ['dist', 'build', '_site', 'out', 'public']

/** A remote repo to clone (vs a local folder path). */
export const isRemoteRepo = (s: string) => /^(https?:\/\/|git@)/i.test(s.trim())

const bail = (ctx: JobCtx) => {
  if (ctx.shouldCancel()) throw new CancelledError()
}

/** Clone a git repo (shallow) into `dir`. */
async function cloneRepo(url: string, dir: string, ctx: JobCtx): Promise<void> {
  await rm(dir, { recursive: true, force: true })
  const code = await run('git', ['clone', '--depth', '1', url, dir], process.cwd(), ctx.registerChild)
  bail(ctx)
  if (code !== 0 || !existsSync(dir)) {
    throw new Error('Could not clone that repo — check the URL is correct and the repo is public (or that git has access).')
  }
}

/**
 * Resolve a source path to a built-site folder:
 *  - if it already contains .html files → use it as-is (it's a dist folder),
 *  - else if it has package.json → install + build, then find the output folder.
 * Reports the install/build stages via `ctx` at the given percents.
 */
export async function resolveBuiltFolder(
  sourcePath: string,
  ctx: JobCtx = noopCtx,
  pct: { install: number; build: number } = { install: 30, build: 55 },
): Promise<string> {
  if (!existsSync(sourcePath)) throw new Error('That folder does not exist on this machine')
  const st = await stat(sourcePath)
  if (!st.isDirectory()) throw new Error('Please point to a folder')

  const files = await listFiles(sourcePath)
  if (files.some((f) => f.toLowerCase().endsWith('.html'))) return sourcePath // already a built site

  if (existsSync(path.join(sourcePath, 'package.json'))) {
    // It's a repo — install + build.
    ctx.reporter(pct.install, 'Installing dependencies…')
    await run('npm', ['install'], sourcePath, ctx.registerChild)
    bail(ctx)
    ctx.reporter(pct.build, 'Building the site…')
    await run('npm', ['run', 'build'], sourcePath, ctx.registerChild)
    bail(ctx)
    for (const d of OUTPUT_DIRS) {
      const out = path.join(sourcePath, d)
      if (existsSync(out) && (await listFiles(out)).some((f) => f.toLowerCase().endsWith('.html'))) return out
    }
    throw new Error('Built the repo but found no HTML output folder (dist/build/…)')
  }
  throw new Error('No built HTML found and no package.json to build')
}

/**
 * Copy the whole built site into SiteAgent's managed storage and read every page's
 * HTML. Returns the managed folder path + the pages map + the list of routes.
 * Reports progress + honors cancel via `ctx` (stages differ for a git URL vs a local folder).
 */
export async function ingestBuiltSite(
  sourcePath: string,
  destDir: string,
  ctx: JobCtx = noopCtx,
  name = 'the site',
): Promise<{ sourcePath: string; pages: PageHtmlMap; pagePaths: string[] }> {
  // A GitHub/remote URL → clone it first, then build it; a local path is used directly.
  let localSource = sourcePath
  const remote = isRemoteRepo(sourcePath)
  if (remote) {
    ctx.reporter(10, `Cloning ${name}…`)
    const repoDir = path.join(path.dirname(destDir), 'repo')
    await cloneRepo(sourcePath.trim(), repoDir, ctx)
    localSource = repoDir
  }
  const built = await resolveBuiltFolder(localSource, ctx, remote ? { install: 30, build: 55 } : { install: 10, build: 45 })
  bail(ctx)
  ctx.reporter(remote ? 80 : 70, 'Copying the site files…')
  await rm(destDir, { recursive: true, force: true })
  await cp(built, destDir, { recursive: true })
  bail(ctx)

  ctx.reporter(remote ? 92 : 90, 'Reading the pages…')
  const files = await listFiles(destDir)
  const pages: PageHtmlMap = {}
  for (const f of files) {
    if (f.toLowerCase().endsWith('.html')) pages[pathnameFromFile(f)] = await readFile(path.join(destDir, f), 'utf8')
  }
  if (Object.keys(pages).length === 0) throw new Error('No HTML pages found in the built site')
  return { sourcePath: destDir, pages, pagePaths: Object.keys(pages) }
}
