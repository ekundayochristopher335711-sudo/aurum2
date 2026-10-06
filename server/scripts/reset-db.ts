/**
 * Wipes all project data for a clean handover.
 *
 * DESTRUCTIVE AND IRREVERSIBLE. Guarded so it can never run by accident:
 *   npx tsx scripts/reset-db.ts --confirm
 *
 * Flags:
 *   --confirm      required; without it the script only reports counts
 *   --keep-admin   keep the admin account (default; pass --wipe-users to remove all)
 *   --wipe-users   delete every user account, including admins
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})

const args = process.argv.slice(2)
const confirmed = args.includes('--confirm')
const wipeUsers = args.includes('--wipe-users')
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@aurum.com'

async function counts() {
  const [users, projects, ews, risks, ces, notices, docs, invites, logs] = await Promise.all([
    prisma.user.count(), prisma.project.count(), prisma.earlyWarning.count(),
    prisma.riskItem.count(), prisma.compensationEvent.count(), prisma.notice.count(),
    prisma.document.count(), prisma.invitation.count(), prisma.auditLog.count(),
  ])
  return { users, projects, ews, risks, ces, notices, docs, invites, logs }
}

async function main() {
  const before = await counts()
  console.log('\nCurrent contents:')
  console.table(before)

  if (!confirmed) {
    console.log('\nDry run — nothing deleted. Re-run with --confirm to wipe.\n')
    return
  }

  // Order matters: AuditLog and PasswordReset are not cascade-deleted from
  // every parent, so clear dependants before their parents.
  await prisma.auditLog.deleteMany()
  await prisma.document.deleteMany()
  await prisma.notice.deleteMany()
  await prisma.riskItem.deleteMany()
  await prisma.earlyWarning.deleteMany()
  await prisma.compensationEvent.deleteMany()
  await prisma.invitation.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.passwordReset.deleteMany()

  if (wipeUsers) {
    await prisma.user.deleteMany()
    console.log('\nDeleted ALL users — the next deploy recreates the seed admin.')
  } else {
    const { count } = await prisma.user.deleteMany({ where: { email: { not: ADMIN_EMAIL } } })
    console.log(`\nDeleted ${count} user(s); kept ${ADMIN_EMAIL}.`)
  }

  console.log('\nRemaining contents:')
  console.table(await counts())
  console.log('\nDatabase reset complete.\n')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
