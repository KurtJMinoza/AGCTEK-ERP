import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FicoJournalService } from './fico-journal.service'
import { Prisma } from '@prisma/client'

const Decimal = Prisma.Decimal
const user = { id: 'user-1', name: 'Test User' } as never

function makeJournal(overrides: Record<string, unknown> = {}) {
    return {
        id: 'je-1',
        companyId: 'company-1',
        status: 'DRAFT',
        approvalStatus: 'DRAFT',
        requiresApproval: true,
        documentNumber: 'JE-000001',
        postingDate: new Date('2026-03-15'),
        fiscalYear: 2026,
        fiscalPeriodId: 'period-1',
        currencyCode: 'PHP',
        totalAmount: new Decimal(100),
        lines: [
            {
                id: 'line-1',
                lineNumber: 1,
                glAccountId: 'acct-1',
                companyId: 'company-1',
                debitAmount: new Decimal(100),
                creditAmount: new Decimal(0),
                currency: 'PHP',
                description: 'Debit line',
            },
            {
                id: 'line-2',
                lineNumber: 2,
                glAccountId: 'acct-2',
                companyId: 'company-1',
                debitAmount: new Decimal(0),
                creditAmount: new Decimal(100),
                currency: 'PHP',
                description: 'Credit line',
            },
        ],
        ...overrides,
    }
}

function setup(initialApprovalStatus: string = 'DRAFT') {
    const prisma: Record<string, any> = {
        ficoJournalEntry: {
            findUnique: jest
                .fn()
                .mockResolvedValue(makeJournal({ approvalStatus: initialApprovalStatus })),
            update: jest.fn(),
        },
        ficoAccountingAuditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    }

    const service = new FicoJournalService(
        prisma as never,
        { canPostToPeriod: jest.fn().mockResolvedValue({ allowed: true }) } as never,
        {
            assertAccountPostable: jest.fn().mockResolvedValue({
                glAccountId: 'acct-1',
                accountCode: '1000',
                accountName: 'Cash',
                accountType: 'ASSET',
            }),
        } as never,
        undefined as never,
    )

    return { prisma, service }
}

function updatedWith(approvalStatus: string, status?: string) {
    return makeJournal({
        approvalStatus,
        status: status ?? approvalStatus,
        postedAt: status === 'POSTED' ? new Date() : undefined,
    })
}

describe('FicoJournalService approval workflow', () => {
    describe('submitForApproval', () => {
        it('moves a draft to pending approval', async () => {
            const { prisma, service } = setup('DRAFT')
            prisma.ficoJournalEntry.findUnique.mockResolvedValue(
                makeJournal({ approvalStatus: 'DRAFT' }),
            )
            prisma.ficoJournalEntry.update.mockResolvedValue(
                updatedWith('PENDING_APPROVAL', 'DRAFT'),
            )

            const result = await service.submitForApproval('je-1', user)

            expect(result.status).toBe('DRAFT')
            expect(result.approvalStatus).toBe('PENDING_APPROVAL')
            expect(prisma.ficoAccountingAuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ action: 'JOURNAL_SUBMIT' }),
                }),
            )
        })

        it('rejects submitting an entry that is not a draft', async () => {
            const { service } = setup('APPROVED')
            await expect(
                service.submitForApproval('je-1', user),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('throws not found when the entry does not exist', async () => {
            const { prisma, service } = setup()
            prisma.ficoJournalEntry.findUnique.mockResolvedValue(null)
            await expect(
                service.submitForApproval('je-1', user),
            ).rejects.toBeInstanceOf(NotFoundException)
        })
    })

    describe('approve', () => {
        it('approves a pending entry', async () => {
            const { prisma, service } = setup('PENDING_APPROVAL')
            prisma.ficoJournalEntry.findUnique.mockResolvedValue(
                makeJournal({ approvalStatus: 'PENDING_APPROVAL' }),
            )
            prisma.ficoJournalEntry.update.mockResolvedValue(
                updatedWith('APPROVED'),
            )

            const result = await service.approve('je-1', user)

            expect(result.approvalStatus).toBe('APPROVED')
        })

        it('rejects approving an entry that is not pending', async () => {
            const { service } = setup('DRAFT')
            await expect(service.approve('je-1', user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })
    })

    describe('reject', () => {
        it('rejects a pending entry with a reason', async () => {
            const { prisma, service } = setup('PENDING_APPROVAL')
            prisma.ficoJournalEntry.findUnique.mockResolvedValue(
                makeJournal({ approvalStatus: 'PENDING_APPROVAL' }),
            )
            prisma.ficoJournalEntry.update.mockResolvedValue(
                updatedWith('REJECTED', 'DRAFT'),
            )

            const result = await service.reject('je-1', user, 'Wrong account')

            expect(result.approvalStatus).toBe('REJECTED')
        })

        it('requires a rejection reason', async () => {
            const { service } = setup('PENDING_APPROVAL')
            await expect(
                service.reject('je-1', user, ''),
            ).rejects.toBeInstanceOf(BadRequestException)
        })
    })

    describe('resubmit', () => {
        it('resubmits a rejected entry to pending approval', async () => {
            const { prisma, service } = setup('REJECTED')
            prisma.ficoJournalEntry.findUnique.mockResolvedValue(
                makeJournal({ approvalStatus: 'REJECTED' }),
            )
            prisma.ficoJournalEntry.update.mockResolvedValue(
                updatedWith('PENDING_APPROVAL'),
            )

            const result = await service.resubmit('je-1', user)

            expect(result.approvalStatus).toBe('PENDING_APPROVAL')
        })
    })

    describe('postApproved', () => {
        it('posts an approved entry', async () => {
            const { prisma, service } = setup('APPROVED')
            prisma.ficoJournalEntry.findUnique.mockResolvedValue(
                makeJournal({ approvalStatus: 'APPROVED', status: 'DRAFT' }),
            )
            prisma.ficoJournalEntry.update.mockResolvedValue(
                updatedWith('POSTED', 'POSTED'),
            )

            const result = await service.postApproved('je-1', user)

            expect(result.status).toBe('POSTED')
            expect(result.approvalStatus).toBe('POSTED')
            expect(result.postedAt).toBeDefined()
        })

        it('rejects posting an entry that is not approved', async () => {
            const { service } = setup('PENDING_APPROVAL')
            await expect(
                service.postApproved('je-1', user),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects posting an already-posted entry', async () => {
            const { service } = setup('POSTED')
            await expect(
                service.postApproved('je-1', user),
            ).rejects.toBeInstanceOf(BadRequestException)
        })
    })
})
