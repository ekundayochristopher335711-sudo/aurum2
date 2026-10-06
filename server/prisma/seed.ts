import { PrismaClient, Role, ContractType } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Seed runs at build time (Vercel) or startup (traditional hosts). Prefer the
// direct connection when available — the Supabase pooler (pgbouncer) can reject
// the prepared statements Prisma uses for one-off scripts.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@aurum.com'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ARLOTECH'

async function main() {
  // Sign-in requires a valid email address, so a malformed SEED_ADMIN_EMAIL
  // would create an account nobody can ever log into. Fail loudly instead.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) {
    console.error(`\nSEED_ADMIN_EMAIL is not a valid email address: "${ADMIN_EMAIL}"`)
    console.error('No admin account created. Fix the variable and redeploy.\n')
    return
  }
  // Ensure an admin exists so the platform is never locked out. The password is
  // only set when the account is first created — a password changed later by the
  // owner must survive every redeploy.
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: await bcrypt.hash(ADMIN_PASSWORD, 12),
        name: 'System Admin',
        role: Role.ADMIN,
        isActive: true,
      },
    })
    console.log(`Created admin account: ${ADMIN_EMAIL}`)
  } else {
    // Never lock the owner out of their own platform
    if (!existingAdmin.isActive || existingAdmin.role !== Role.ADMIN) {
      await prisma.user.update({ where: { id: existingAdmin.id }, data: { isActive: true, role: Role.ADMIN } })
    }
    console.log(`Admin account present: ${ADMIN_EMAIL} (password unchanged)`)
  }

  // Demo content is opt-in only. Without SEED_DEMO=true a wiped database stays
  // clean across deploys, which is what a live/client environment needs.
  if (process.env.SEED_DEMO !== 'true') {
    console.log('Seed complete — no demo data (set SEED_DEMO=true to add it).')
    return
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })
  const cm = await prisma.user.upsert({
    where: { email: 'manager@aurum.com' },
    update: {},
    create: {
      email: 'manager@aurum.com',
      password: await bcrypt.hash('Manager1234!', 12),
      name: 'Commercial Manager',
      role: Role.COMMERCIAL_MANAGER,
    },
  })

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-001' },
    update: {},
    create: {
      id: 'seed-project-001',
      name: 'M25 Motorway Extension Phase 2',
      description: 'Major highway infrastructure project under NEC4 ECC contract',
      contractType: ContractType.NEC4,
      clientName: 'National Highways',
      contractorName: 'Aurum Civil Engineering Ltd',
      contractValue: 45000000,
      startDate: new Date('2024-01-15'),
      endDate: new Date('2026-06-30'),
      members: {
        create: [
          { userId: admin.id, role: Role.ADMIN },
          { userId: cm.id, role: Role.COMMERCIAL_MANAGER },
        ],
      },
    },
  })

  console.log('Seed complete (demo data included).')
  console.log('Demo project:', project.name)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
