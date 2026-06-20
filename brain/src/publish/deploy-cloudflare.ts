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

/** A Cloudflare Pages project name is lowercase alphanumeric + dashes. */
const projectName = (slug: string) => `siteagent-${slug}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 54)

/**
 * Deploy a static folder to the tenant's Cloudflare Pages project via direct
 * upload (no GitHub needed). Creates the project on first deploy. Returns the
 * live *.pages.dev URL.
 */
export async function deployToCloudflare(slug: string, dir: string): Promise<{ url: string; project: string }> {
  const env = getEnv()
  if (!env.cloudflareAccountId || !env.cloudflareApiToken) throw new Error('Cloudflare is not configured.')
  const project = projectName(slug)
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: env.cloudflareAccountId,
    CLOUDFLARE_API_TOKEN: env.cloudflareApiToken,
  }

  // Create the project (idempotent — a "already exists" failure is fine).
  await run(['pages', 'project', 'create', project, '--production-branch', 'main'], childEnv)
  // Direct-upload the static folder.
  const res = await run(['pages', 'deploy', dir, '--project-name', project, '--branch', 'main', '--commit-dirty=true'], childEnv)

  // A *.pages.dev URL (host may have multiple subdomain segments) or a "complete"
  // line means success → return the stable production URL for the project.
  const deployed = /https:\/\/[a-z0-9.-]+\.pages\.dev/i.test(res.out) || /Deployment complete|Success! Uploaded/i.test(res.out)
  if (deployed) return { url: `https://${project}.pages.dev`, project }
  throw new Error('Cloudflare deploy failed: ' + res.out.slice(-600))
}
