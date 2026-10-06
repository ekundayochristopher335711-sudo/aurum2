-- =====================================================================
-- AURUM PROJECT CONTROLS — FULL DATABASE WIPE (client handover)
--
-- DESTRUCTIVE AND IRREVERSIBLE. Deletes every project, compensation
-- event, early warning, risk, notice, document, invitation, audit log
-- entry and user account.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query ->
--             paste this file -> Run.
--
-- AFTERWARDS: redeploy on Vercel. The seed recreates the admin account
--             using SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, so set a
--             strong SEED_ADMIN_PASSWORD in Vercel BEFORE redeploying.
--
-- The _prisma_migrations table is deliberately left untouched so Prisma
-- does not try to re-run migrations on the next deploy.
-- =====================================================================

TRUNCATE TABLE
  "AuditLog",
  "Document",
  "Notice",
  "RiskItem",
  "EarlyWarning",
  "CompensationEvent",
  "Invitation",
  "ProjectMember",
  "PasswordReset",
  "Project",
  "User"
CASCADE;

-- Verify everything is empty (all counts should be 0)
SELECT 'User' AS table, COUNT(*) FROM "User"
UNION ALL SELECT 'Project', COUNT(*) FROM "Project"
UNION ALL SELECT 'CompensationEvent', COUNT(*) FROM "CompensationEvent"
UNION ALL SELECT 'EarlyWarning', COUNT(*) FROM "EarlyWarning"
UNION ALL SELECT 'RiskItem', COUNT(*) FROM "RiskItem"
UNION ALL SELECT 'Notice', COUNT(*) FROM "Notice"
UNION ALL SELECT 'Document', COUNT(*) FROM "Document"
UNION ALL SELECT 'Invitation', COUNT(*) FROM "Invitation"
UNION ALL SELECT 'AuditLog', COUNT(*) FROM "AuditLog";
