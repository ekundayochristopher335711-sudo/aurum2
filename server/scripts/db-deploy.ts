import { execSync } from 'child_process'

// Defends against the most common Vercel env-var paste mistakes: a value
// accidentally wrapped in quotes, or with stray leading/trailing whitespace or
// newlines. Prisma reads these vars directly, so we sanitise them here before
// running migrations + seed.
function clean(v?: string): string | undefined {
  if (!v) return v
  return v.trim().replace(/^["'\s]+/, '').replace(/["'\s]+$/, '')
}

const env = { ...process.env }
if (env.DATABASE_URL) env.DATABASE_URL = clean(env.DATABASE_URL)
if (env.DIRECT_URL) env.DIRECT_URL = clean(env.DIRECT_URL)

// Helpful, non-sensitive diagnostics (never prints the password itself — only
// its length and whether it contains symbols, to catch empty/typo'd values).
function describe(label: string, url?: string) {
  if (!url) { console.log(`${label}: (not set)`); return }
  try {
    const u = new URL(url)
    const pw = u.password
    const pwAlnum = /^[A-Za-z0-9]*$/.test(pw)
    console.log(`${label}: host=${u.hostname} port=${u.port} db=${u.pathname.replace('/', '')} user=${u.username} passwordLength=${pw.length} passwordIsAlphanumericOnly=${pwAlnum}`)
  } catch {
    console.log(`${label}: (unparseable — check for quotes or missing parts)`)
  }
}
describe('DATABASE_URL', env.DATABASE_URL)
describe('DIRECT_URL', env.DIRECT_URL)

const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env })

// Prisma client generation has no DB dependency and must succeed.
run('npx prisma generate')

// Migrations + seed need valid DB credentials. If they fail, deploy the site
// anyway — the schema already exists in most retry scenarios, and a live
// /api/health/db endpoint gives a much faster credential-testing loop than
// failing the whole build.
try {
  run('npx prisma migrate deploy')
  run('npx tsx prisma/seed.ts')
} catch {
  console.warn('')
  console.warn('⚠️  ============================================================')
  console.warn('⚠️  DATABASE MIGRATION/SEED FAILED — continuing the build anyway.')
  console.warn('⚠️  The site will deploy, but the API cannot reach the database')
  console.warn('⚠️  until DATABASE_URL / DIRECT_URL credentials are fixed.')
  console.warn('⚠️  After deploy, open /api/health/db to test credentials live.')
  console.warn('⚠️  ============================================================')
  console.warn('')
}
