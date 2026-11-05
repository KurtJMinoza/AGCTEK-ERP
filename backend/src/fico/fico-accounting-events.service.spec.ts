import { ForbiddenException } from '@nestjs/common'
import {
    FicoAccountingEventsService,
    summarizeAccountingError,
} from './fico-accounting-events.service'

const user = { id: 'user-1' } as never

describe('summarizeAccountingError', () => {
    it('extracts the database message from a Prisma error', () => {
        const error =
            '\nInvalid `prisma.ficoJournalEntry.create()` invocation:\n\n\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "P0001", message: "Journal lines for posted accounting document abc are immutable", severity: "ERROR" }) })'
        expect(summarizeAccountingError(error)).toBe(
            'Journal lines for posted accounting document abc are immutable',
        )
    })

    it('names the violated foreign key', () => {
        const error =
            '\nInvalid `prisma.ficoJournalEntry.create()` invocation:\n\n\nForeign key constraint violated on the constraint: `fico_journal_entries_mmAccountingEventId_fkey`'
        expect(summarizeAccountingError(error)).toBe(
            'Foreign key constraint violated (fico_journal_entries_mmAccountingEventId_fkey)',
        )
    })

    it('keeps plain business errors as they are', () => {
        expect(
            summarizeAccountingError('No active GR_IR account mapping exists for the material valuation class.'),
        ).toBe('No active GR_IR account mapping exists for the material valuation class.')
        expect(summarizeAccountingError(null)).toBeNull()
    })
})

describe('FicoAccountingEventsService', () => {
    function setup(accessible: string[] | null = ['co-1']) {
        const prisma = {
            mmAccountingEvent: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'ev-1',
                        status: 'FAILED',
                        totalValue: { toString: () => '80' },
                        lastError: 'Mapping missing',
                        ficoJournalEntry: null,
                    },
                ]),
                count: jest.fn().mockResolvedValue(1),
                groupBy: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({ id: 'ev-2', companyId: null }),
            },
        }
        const access = {
            assertAccess: jest.fn().mockResolvedValue(undefined),
            accessibleCompanyIds: jest.fn().mockResolvedValue(accessible),
        }
        return {
            service: new FicoAccountingEventsService(prisma as never, access as never),
            prisma,
            access,
        }
    }

    it('scopes the list to the requested company after an access check', async () => {
        const { service, prisma, access } = setup()
        const result = await service.list({ companyId: 'co-1', status: 'FAILED' }, user)
        expect(access.assertAccess).toHaveBeenCalledWith(user, 'co-1')
        expect(prisma.mmAccountingEvent.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { companyId: 'co-1', status: 'FAILED' } }),
        )
        expect(result.items[0]).toMatchObject({ totalValue: '80', errorSummary: 'Mapping missing' })
    })

    it('hides company-less events from users who are not super admins', async () => {
        const { service } = setup(['co-1'])
        await expect(service.get('ev-2', user)).rejects.toBeInstanceOf(ForbiddenException)
    })
})
