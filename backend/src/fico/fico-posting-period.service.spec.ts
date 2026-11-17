import { BadRequestException } from '@nestjs/common'
import { FicoPostingPeriodService } from './fico-posting-period.service'

const user = { id: 'user-1' } as never

function periodRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'period-1',
        companyId: 'company-1',
        fiscalYear: 2026,
        periodNumber: 10,
        name: 'October 2026',
        periodType: 'NORMAL',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-31T00:00:00.000Z'),
        status: 'CLOSED',
        statusReason: null,
        remarks: null,
        closingDate: new Date('2026-10-31T00:00:00.000Z'),
        lockDate: null,
        reopenedAt: null,
        reopenedBy: null,
        closedAt: new Date('2026-11-01T00:00:00.000Z'),
        closedBy: 'user-2',
        ...overrides,
    }
}

function setup(overrides: Record<string, unknown> = {}) {
    const row = periodRow(overrides)
    const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        ficoFinancialPeriod: {
            update: jest
                .fn()
                .mockImplementation(({ data }) => ({ ...row, ...data })),
        },
        ficoPostingPeriodControl: { upsert: jest.fn().mockResolvedValue({}) },
        ficoPostingPeriodAuditLog: { create: jest.fn().mockResolvedValue({}) },
        ficoJournalEntry: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const prisma = {
        ficoFinancialPeriod: {
            findUnique: jest.fn().mockResolvedValue(row),
            update: tx.ficoFinancialPeriod.update,
            groupBy: jest.fn().mockResolvedValue([
                { status: 'OPEN', _count: { _all: 1 } },
                { status: 'CLOSED', _count: { _all: 2 } },
            ]),
            findMany: jest
                .fn()
                .mockResolvedValueOnce([
                    {
                        id: 'period-2',
                        fiscalYear: 2026,
                        periodNumber: 11,
                        name: 'November 2026',
                        periodType: 'NORMAL',
                        startDate: new Date('2026-11-01T00:00:00.000Z'),
                        endDate: new Date('2026-11-30T00:00:00.000Z'),
                        status: 'OPEN',
                        closingDate: null,
                        lockDate: null,
                    },
                    {
                        id: 'period-1',
                        fiscalYear: 2026,
                        periodNumber: 10,
                        name: 'October 2026',
                        periodType: 'NORMAL',
                        startDate: new Date('2026-10-01T00:00:00.000Z'),
                        endDate: new Date('2026-10-31T00:00:00.000Z'),
                        status: 'CLOSED',
                        closingDate: new Date('2026-10-31T00:00:00.000Z'),
                        lockDate: null,
                    },
                ])
                .mockResolvedValueOnce([{ id: 'period-1' }]),
            findFirst: jest.fn().mockResolvedValue({
                id: 'period-2',
                fiscalYear: 2026,
                periodNumber: 11,
                status: 'OPEN',
            }),
        },
        ficoJournalEntry: { count: jest.fn().mockResolvedValue(7) },
        $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const service = new FicoPostingPeriodService(
        prisma as never,
        access as never,
        audit as never,
    )
    return { service, prisma, tx, access, audit, row }
}

describe('FicoPostingPeriodService reopen', () => {
    it('requires an explicit reason before reopening a closed period', async () => {
        const { service, tx } = setup()

        await expect(
            service.transition('period-1', 'reopen', '   ', user),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(tx.ficoFinancialPeriod.update).not.toHaveBeenCalled()
    })

    it('records reopenedBy/reopenedAt and clears the close dates', async () => {
        const { service, tx } = setup()

        await service.transition('period-1', 'reopen', 'Late supplier invoice', user)

        const data = tx.ficoFinancialPeriod.update.mock.calls[0][0].data
        expect(data).toMatchObject({
            status: 'OPEN',
            closedAt: null,
            closedBy: null,
            closingDate: null,
            reopenedBy: 'user-1',
            updatedBy: 'user-1',
        })
        expect(data.reopenedAt).toBeInstanceOf(Date)
        expect(tx.ficoPostingPeriodAuditLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'PERIOD_REOPEN',
                fromStatus: 'CLOSED',
                toStatus: 'OPEN',
                reason: 'Late supplier invoice',
                actorId: 'user-1',
            }),
        })
    })

    it('stamps the closing date when an open period is closed', async () => {
        const { service, tx } = setup({ status: 'OPEN', closingDate: null })

        await service.transition('period-1', 'close', undefined, user)

        const data = tx.ficoFinancialPeriod.update.mock.calls[0][0].data
        expect(data.status).toBe('CLOSED')
        expect(data.closingDate).toBeInstanceOf(Date)
    })
})

describe('FicoPostingPeriodService summary', () => {
    it('aggregates period status counts and posted period totals', async () => {
        const { service } = setup()

        const summary = await service.summary({ companyId: 'company-1' }, user)

        expect(summary).toMatchObject({
            companyId: 'company-1',
            generatedPeriods: 2,
            journalEntries: 7,
            periodsWithPostings: 1,
            byStatus: {
                FUTURE: 0,
                OPEN: 1,
                RESTRICTED: 0,
                CLOSED: 2,
                LOCKED: 0,
            },
            currentPeriod: expect.objectContaining({ id: 'period-2' }),
        })
    })
})
