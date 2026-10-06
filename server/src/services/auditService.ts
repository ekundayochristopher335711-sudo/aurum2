import prisma from '../config/database'

interface AuditEntry {
  userId: string
  projectId?: string
  entityType: string
  entityId: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'EXPORT'
  changes?: Record<string, { old: unknown; new: unknown }>
  ipAddress?: string
  userAgent?: string
}

export const logAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        projectId: entry.projectId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        changes: entry.changes as object | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    })
  } catch (err) {
    console.error('Audit log failed:', err)
  }
}

export const diffObjects = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> | undefined => {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  // Only diff fields present in the update - fields the caller didn't touch
  // must not appear in the audit trail as changes.
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { old: before[key], new: after[key] }
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined
}
