import { spawn } from 'node:child_process'

import { getEnv } from '../config/env'

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['--no-install', 'wrangler', ...args], { env, shell: true })
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (out += d.toString()))
    child.on('close', (code) => resolve({ code: code ?? 1, out }))
    child.on('error', (e) => resolve({ code: 1, out: String(e) }))
  })
}

/** Is Cloudflare publishing configured (account id + token present)? */
export function cloudflareConfigured(): boolean {
  const env = getEnv()
  return Boolean(env.cloudflareAccountId && env.cloudflareApiToken)
}

/** Sanitize to a valid Cloudflare Pages project name (lowercase alphanumeric + dashes). */
const sanitizeProject = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 54)
/** SiteAgent-built tenants get a namespaced project; connected sites use their exact name. */
const projectName = (slug: string) => sanitizeProject(`siteagent-${slug}`)

/** Deploy a static folder to a Cloudflare Pages project by its exact name (creating it
 *  on first deploy). Shared by both the builder and connected-site publishing. */
async function deployDir(project: string, dir: string): Promise<{ url: string; project: string }> {
  const env = getEnv()
  if (!env.cloudflareAccountId || !env.cloudflareApiToken) throw new Error('Cloudflare is not configured.')
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: env.cloudflareAccountId,
    CLOUDFLARE_API_TOKEN: env.cloudflareApiToken,
  }

  // Create the project (idempotent — an "already exists" failure is fine).
  await run(['pages', 'project', 'create', project, '--production-branch', 'main'], childEnv)
  // Direct-upload the static folder.
  const res = await run(['pages', 'deploy', dir, '--project-name', project, '--branch', 'main', '--commit-dirty=true'], childEnv)

  // A *.pages.dev URL (host may have multiple subdomain segments) or a "complete"
  // line means success → return the stable production URL for the project.
  const deployed = /https:\/\/[a-z0-9.-]+\.pages\.dev/i.test(res.out) || /Deployment complete|Success! Uploaded/i.test(res.out)
  if (deployed) return { url: `https://${project}.pages.dev`, project }
  throw new Error('Cloudflare deploy failed: ' + res.out.slice(-600))
}

/**
 * Deploy a SiteAgent-built tenant site (namespaced `siteagent-<slug>` project).
 * Creates the project on first deploy. Returns the live *.pages.dev URL.
 */
export function deployToCloudflare(slug: string, dir: string): Promise<{ url: string; project: string }> {
  return deployDir(projectName(slug), dir)
}

/**
 * Deploy a CONNECTED site to its OWN Cloudflare Pages project, by the EXACT name the
 * client gave (no namespacing) — so we update their real site, or create it on the
 * first deploy if it doesn't exist yet. Returns the project's *.pages.dev URL.
 */
export function deployConnectedSite(project: string, dir: string): Promise<{ url: string; project: string }> {
  const name = sanitizeProject(project)
  if (!name) throw new Error('Invalid Cloudflare project name')
  return deployDir(name, dir)
}
