import prisma from '../config/database'
import { Prisma } from '@prisma/client'

type NumberedModel = 'compensationEvent' | 'earlyWarning' | 'riskItem' | 'notice'

const fieldMap: Record<NumberedModel, string> = {
  compensationEvent: 'ceNumber',
  earlyWarning: 'ewNumber',
  riskItem: 'riskId',
  notice: 'noticeNumber',
}

// Next sequential reference for a project (e.g. CE-004). Based on the highest
// existing number - not row count - so deletions never cause duplicates.
export async function nextNumber(model: NumberedModel, projectId: string, prefix: string): Promise<string> {
  const field = fieldMap[model]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = prisma[model] as any
  const rows: Array<Record<string, string>> = await delegate.findMany({
    where: { projectId },
    select: { [field]: true },
  })
  const max = rows.reduce((m, r) => {
    const n = parseInt(String(r[field]).replace(/\D/g, ''), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

export const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'

// Runs a create that embeds a generated sequence number; retries on the
// unique-constraint race when two users create records simultaneously.
export async function createWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      lastError = e
    }
  }
  throw lastError
}
