import { BadRequestException, ConflictException } from '@nestjs/common'
import {
    ACTIVE_QUOTATION_STATUSES,
    QUOTATION_STATUSES,
    canQuotation,
    effectiveQuotationStatus,
    endOfManilaDay,
    formatQuotationNumber,
    isQuotationExpired,
    manilaDate,
    nextQuotationStatus,
    normalizeQuotationSections,
    resolveValidUntil,
    type QuotationAction,
    type QuotationStatus,
} from './quotation.rules'

describe('normalizeQuotationSections', () => {
    it('trims titles and sorts headings by the line they sit above', () => {
        expect(
            normalizeQuotationSections(
                [
                    { title: '  Accessories ', beforeLineNumber: 3 },
                    { title: 'Main units', beforeLineNumber: 1 },
                ],
                4,
            ),
        ).toEqual([
            { title: 'Main units', beforeLineNumber: 1 },
            { title: 'Accessories', beforeLineNumber: 3 },
        ])
        expect(normalizeQuotationSections(undefined, 2)).toEqual([])
    })

    it.each([
        [[{ title: '   ', beforeLineNumber: 1 }], 'Section titles cannot be blank'],
        [[{ title: 'x'.repeat(121), beforeLineNumber: 1 }], 'at most 120 characters'],
        [[{ title: 'Trailing', beforeLineNumber: 3 }], 'at least one product line after it'],
        [[{ title: 'Zero', beforeLineNumber: 0 }], 'at least one product line after it'],
        [
            [
                { title: 'A', beforeLineNumber: 1 },
                { title: 'B', beforeLineNumber: 1 },
            ],
            'Only one section heading can sit above a line',
        ],
    ])('rejects %j', (sections, message) => {
        expect(() => normalizeQuotationSections(sections, 2)).toThrow(BadRequestException)
        expect(() => normalizeQuotationSections(sections, 2)).toThrow(message)
    })
})

const ALLOWED: Record<QuotationStatus, Partial<Record<QuotationAction, QuotationStatus>>> = {
    DRAFT: { EDIT: 'DRAFT', SEND: 'SENT', CANCEL: 'CANCELLED' },
    SENT: {
        ACCEPT: 'ACCEPTED',
        REJECT: 'REJECTED',
        CANCEL: 'CANCELLED',
        REVISE: 'SUPERSEDED',
        EXPIRE: 'EXPIRED',
        CONVERT: 'CONVERTED',
    },
    ACCEPTED: { CANCEL: 'CANCELLED', REVISE: 'SUPERSEDED', EXPIRE: 'EXPIRED', CONVERT: 'CONVERTED' },
    REJECTED: { REVISE: 'REJECTED' },
    EXPIRED: { REVISE: 'EXPIRED' },
    CANCELLED: {},
    SUPERSEDED: {},
    CONVERTED: {},
}
const ACTIONS: QuotationAction[] = ['EDIT', 'SEND', 'ACCEPT', 'REJECT', 'CANCEL', 'REVISE', 'EXPIRE', 'CONVERT']

describe('quotation status rules', () => {
    const cases = QUOTATION_STATUSES.flatMap((status) =>
        ACTIONS.map((action) => [status, action, ALLOWED[status][action]] as const),
    )

    it.each(cases.filter(([, , next]) => next))('%s + %s → %s', (status, action, next) => {
        expect(canQuotation(status, action)).toBe(true)
        expect(nextQuotationStatus(status, action)).toBe(next)
    })

    it.each(cases.filter(([, , next]) => !next))('%s + %s is refused', (status, action) => {
        expect(canQuotation(status, action)).toBe(false)
        expect(() => nextQuotationStatus(status, action)).toThrow(ConflictException)
    })

    it('names the refused action and status', () => {
        expect(() => nextQuotationStatus('DRAFT', 'CONVERT')).toThrow('Cannot convert a DRAFT quotation')
        expect(() => nextQuotationStatus('BOGUS', 'SEND')).toThrow(ConflictException)
    })

    it('keeps the active set aligned with the partial unique index', () => {
        expect([...ACTIVE_QUOTATION_STATUSES]).toEqual(['DRAFT', 'SENT', 'ACCEPTED'])
    })

    it('formats sequence values as Q-000012', () => {
        expect(formatQuotationNumber(12n)).toBe('Q-000012')
        expect(formatQuotationNumber(1234567)).toBe('Q-1234567')
    })
})

describe('quotation validity (Asia/Manila, UTC+8)', () => {
    it('uses the Manila calendar day', () => {
        expect(manilaDate(new Date('2026-10-06T15:59:59Z'))).toBe('2026-10-06')
        expect(manilaDate(new Date('2026-10-06T16:00:00Z'))).toBe('2026-10-07')
    })

    it('ends a validity day at 23:59:59.999 Manila time', () => {
        expect(endOfManilaDay('2026-11-05').toISOString()).toBe('2026-11-05T15:59:59.999Z')
    })

    it('defaults to 30 days after today (Manila)', () => {
        expect(resolveValidUntil(undefined, new Date('2026-10-06T10:00:00Z')).toISOString()).toBe(
            '2026-11-05T15:59:59.999Z',
        )
        // 01:00 on Oct 7 in Manila is still Oct 6 in UTC.
        expect(resolveValidUntil(undefined, new Date('2026-10-06T17:00:00Z')).toISOString()).toBe(
            '2026-11-06T15:59:59.999Z',
        )
    })

    it('accepts today or a later day and rejects past or malformed dates', () => {
        const now = new Date('2026-10-06T10:00:00Z')
        expect(resolveValidUntil('2026-10-06', now).toISOString()).toBe('2026-10-06T15:59:59.999Z')
        expect(() => resolveValidUntil('2026-10-05', now)).toThrow('validUntil cannot be in the past')
        for (const bad of ['2026-02-30', '06/10/2026', '2026-10-6', '']) {
            expect(() => resolveValidUntil(bad, now)).toThrow(BadRequestException)
        }
    })

    it('treats overdue SENT / ACCEPTED as expired without changing DRAFT or closed quotations', () => {
        const now = new Date('2026-11-06T00:00:00Z')
        const validUntil = new Date('2026-11-05T15:59:59.999Z')
        for (const status of ['SENT', 'ACCEPTED']) {
            expect(isQuotationExpired({ status, validUntil }, now)).toBe(true)
            expect(effectiveQuotationStatus({ status, validUntil }, now)).toBe('EXPIRED')
        }
        for (const status of ['DRAFT', 'REJECTED', 'CONVERTED', 'CANCELLED']) {
            expect(effectiveQuotationStatus({ status, validUntil }, now)).toBe(status)
        }
        expect(isQuotationExpired({ status: 'SENT', validUntil }, new Date('2026-11-05T15:59:59.999Z'))).toBe(false)
        expect(isQuotationExpired({ status: 'SENT', validUntil: null }, now)).toBe(false)
    })
})
