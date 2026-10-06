import { describe, it, expect } from 'vitest'
import {
  isValidTransition, replyDueFrom, quotationDueFrom, quoteReplyDueFrom,
  timeBarDeadline, daysUntilTimeBar, isTimeBarred, addDays,
} from '../necRules'

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('CE workflow (forward-only)', () => {
  it('allows moving to the next stage', () => {
    expect(isValidTransition('NOTIFIED', 'QUOTED')).toBe(true)
    expect(isValidTransition('ASSESSED', 'IMPLEMENTED')).toBe(true)
  })

  it('allows skipping stages forwards', () => {
    expect(isValidTransition('NOTIFIED', 'CLOSED')).toBe(true)
  })

  it('allows staying on the same stage (edits that do not change status)', () => {
    expect(isValidTransition('QUOTED', 'QUOTED')).toBe(true)
  })

  it('refuses to move backwards - history must not be rewritten', () => {
    expect(isValidTransition('QUOTED', 'NOTIFIED')).toBe(false)
    expect(isValidTransition('CLOSED', 'IMPLEMENTED')).toBe(false)
    expect(isValidTransition('IMPLEMENTED', 'NOTIFIED')).toBe(false)
  })

  it('rejects statuses that are not part of the workflow', () => {
    expect(isValidTransition('NOTIFIED', 'CANCELLED')).toBe(false)
    expect(isValidTransition('', 'CLOSED')).toBe(false)
  })
})

describe('NEC clause clocks', () => {
  it('cl. 61.4 - the reply is due one week after notification', () => {
    expect(replyDueFrom(at('2026-08-02'))).toEqual(at('2026-08-09'))
  })

  it('cl. 62.3 - a quotation is due three weeks after notification', () => {
    expect(quotationDueFrom(at('2026-08-02'))).toEqual(at('2026-08-23'))
  })

  it('cl. 62.3 - the PM replies to a quotation within two weeks', () => {
    expect(quoteReplyDueFrom(at('2026-08-10'))).toEqual(at('2026-08-24'))
  })

  it('carries correctly across a month boundary', () => {
    expect(replyDueFrom(at('2026-08-28'))).toEqual(at('2026-09-04'))
  })

  it('handles a leap day without drifting', () => {
    expect(addDays(at('2028-02-28'), 1)).toEqual(at('2028-02-29'))
    expect(addDays(at('2028-02-28'), 2)).toEqual(at('2028-03-01'))
  })
})

describe('cl. 61.3 - the 8-week time bar', () => {
  it('falls exactly 56 days after the date of awareness', () => {
    expect(timeBarDeadline(at('2026-01-01'))).toEqual(at('2026-02-26'))
  })

  it('counts the days remaining', () => {
    expect(daysUntilTimeBar(at('2026-01-01'), at('2026-01-01'))).toBe(56)
    expect(daysUntilTimeBar(at('2026-01-01'), at('2026-02-25'))).toBe(1)
    expect(daysUntilTimeBar(at('2026-01-01'), at('2026-02-26'))).toBe(0)
  })

  it('reports a negative count once the bar has passed', () => {
    expect(daysUntilTimeBar(at('2026-01-01'), at('2026-03-01'))).toBe(-3)
  })

  it('is not time-barred when notified on the final day', () => {
    expect(isTimeBarred(at('2026-01-01'), at('2026-02-26'))).toBe(false)
  })

  it('IS time-barred when notified the day after the deadline', () => {
    expect(isTimeBarred(at('2026-01-01'), at('2026-02-27'))).toBe(true)
  })

  it('is not time-barred when notified immediately', () => {
    expect(isTimeBarred(at('2026-01-01'), at('2026-01-02'))).toBe(false)
  })
})
