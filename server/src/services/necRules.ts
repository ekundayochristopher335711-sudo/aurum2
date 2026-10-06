// Pure NEC contract rules - no database, no framework, so they can be tested
// directly. These are the calculations money depends on.

export const CE_WORKFLOW = ['NOTIFIED', 'QUOTED', 'ASSESSED', 'IMPLEMENTED', 'CLOSED'] as const
export type CEStatus = typeof CE_WORKFLOW[number]

// NEC4 clause clocks, in days
export const REPLY_DAYS = 7          // cl. 61.4 - PM replies to a CE notification within 1 week
export const QUOTATION_DAYS = 21     // cl. 62.3 - contractor submits a quotation within 3 weeks
export const QUOTE_REPLY_DAYS = 14   // cl. 62.3 - PM replies to a quotation within 2 weeks
export const TIME_BAR_DAYS = 56      // cl. 61.3 - 8 weeks from awareness to notify

export const addDays = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * 24 * 60 * 60 * 1000)

// The NEC workflow is forward-only: a compensation event may skip ahead but
// never move backwards, so the contractual history cannot be rewritten.
export function isValidTransition(from: string, to: string): boolean {
  const fromIdx = CE_WORKFLOW.indexOf(from as CEStatus)
  const toIdx = CE_WORKFLOW.indexOf(to as CEStatus)
  if (fromIdx === -1 || toIdx === -1) return false
  return toIdx >= fromIdx
}

export const replyDueFrom = (notified: Date): Date => addDays(notified, REPLY_DAYS)
export const quotationDueFrom = (notified: Date): Date => addDays(notified, QUOTATION_DAYS)
export const quoteReplyDueFrom = (quoted: Date): Date => addDays(quoted, QUOTE_REPLY_DAYS)

// cl. 61.3 - the date by which a compensation event must be notified
export const timeBarDeadline = (awareness: Date): Date => addDays(awareness, TIME_BAR_DAYS)

// Whole days remaining before the 8-week bar bites. Negative means it has passed.
export function daysUntilTimeBar(awareness: Date, asOf: Date = new Date()): number {
  const deadline = timeBarDeadline(awareness)
  return Math.floor((deadline.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000))
}

export const isTimeBarred = (awareness: Date, notifiedOn: Date): boolean =>
  notifiedOn.getTime() > timeBarDeadline(awareness).getTime()
