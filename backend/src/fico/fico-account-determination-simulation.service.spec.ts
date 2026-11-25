import { FicoAccountDeterminationSimulationService } from './fico-account-determination-simulation.service'

const user = { id: 'user-1', role: 'admin' } as never

function line(side: 'DEBIT' | 'CREDIT', glAccountId: string, lineNumber: number) {
    return { lineNumber, side, glAccountId, description: null }
}

function setup(options: { rules?: unknown[]; resolution?: unknown } = {}) {
    const prisma = {
        mmAccountingEvent: { findFirst: jest.fn() },
        ficoAccountDeterminationRule: {
            findMany: jest.fn().mockResolvedValue(options.rules ?? []),
        },
        // Any write surface here would be a Phase 04.23 safety violation.
        ficoJournalEntry: { create: jest.fn(), update: jest.fn() },
        ficoDocumentSequence: { update: jest.fn() },
        $transaction: jest.fn(),
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const resolution = {
        traceCandidates: jest.fn().mockResolvedValue({
            chartOfAccountsId: 'coa-1',
            chartOfAccountsCode: 'AGCTEK_COA',
            candidates: [],
            selected: null,
            resolution: null,
            configurationErrors: [],
            validationWarnings: [],
            ...(options.resolution as object | undefined),
        }),
        resolveDetermination: jest.fn().mockResolvedValue({
            glAccountId: 'acc-1',
            glAccountCode: '120100',
            transactionKey: 'GI_COGS',
        }),
    }
    return {
        service: new FicoAccountDeterminationSimulationService(
            prisma as never,
            access as never,
            resolution as never,
        ),
        prisma,
        access,
        resolution,
    }
}

describe('FicoAccountDeterminationSimulationService', () => {
    it('enforces company access before simulating', async () => {
        const { service, access } = setup()

        await service
            .simulate(
                {
                    mode: 'SINGLE_KEY',
                    companyId: 'co-1',
                    postingDate: '2026-11-25',
                    sourceModule: 'MM',
                    transactionKey: 'GI_COGS',
                },
                user,
            )
            .catch(() => undefined)

        expect(access.assertAccess).toHaveBeenCalledWith(user, 'co-1')
    })

    it('never writes journals, document numbers or events', async () => {
        const { service, prisma } = setup()

        const result = await service.simulate(
            {
                mode: 'SINGLE_KEY',
                companyId: 'co-1',
                postingDate: '2026-11-25',
                sourceModule: 'MM',
                transactionKey: 'GI_COGS',
            },
            user,
        )

        expect(result.safeDryRun).toBe(true)
        expect(prisma.ficoJournalEntry.create).not.toHaveBeenCalled()
        expect(prisma.ficoJournalEntry.update).not.toHaveBeenCalled()
        expect(prisma.ficoDocumentSequence.update).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects a transaction key that is not in the catalogue', async () => {
        const { service } = setup()

        await expect(
            service.simulate(
                {
                    mode: 'SINGLE_KEY',
                    companyId: 'co-1',
                    postingDate: '2026-11-25',
                    sourceModule: 'MM',
                    transactionKey: 'NOT_A_KEY',
                },
                user,
            ),
        ).rejects.toMatchObject({
            message: expect.stringContaining('Unknown transaction key'),
        })
    })

    it('reports each key separately in a multi-key simulation', async () => {
        const { service } = setup()

        const result = await service.simulate(
            {
                mode: 'MULTI_KEY',
                companyId: 'co-1',
                postingDate: '2026-11-25',
                sourceModule: 'SD',
                transactionKeys: ['SALES_REVENUE', 'OUTPUT_TAX'],
            },
            user,
        )

        expect(result.mode).toBe('MULTI_KEY')
        expect(result.batchItems?.map((row) => row.transactionKey)).toEqual([
            'SALES_REVENUE',
            'OUTPUT_TAX',
        ])
    })

    it('marks draft-rule simulation as separate from production resolution', async () => {
        const { service } = setup()

        const result = await service.simulate(
            {
                mode: 'DRAFT_RULE',
                companyId: 'co-1',
                postingDate: '2026-11-25',
                sourceModule: 'MM',
                transactionKey: 'GI_COGS',
            },
            user,
        )

        expect(result.draftRuleNote).toContain('ACTIVE production rules only')
    })

    it('loads dimensions from the stored accounting event for document simulation', async () => {
        const { service, prisma, resolution } = setup()
        prisma.mmAccountingEvent.findFirst.mockResolvedValue({
            payload: { lines: [{ valuationClassId: 'vc-9' }] },
        })

        await service.simulate(
            {
                mode: 'SOURCE_DOCUMENT',
                companyId: 'co-1',
                postingDate: '2026-11-25',
                sourceModule: 'MM',
                transactionKey: 'GI_COGS',
                sourceDocumentType: 'GOODS_ISSUE',
                sourceDocumentId: 'gi-1',
            },
            user,
        )

        expect(resolution.traceCandidates).toHaveBeenCalledWith(
            expect.objectContaining({ valuationClassId: 'vc-9' }),
        )
    })

    it('fails document simulation without a document reference', async () => {
        const { service } = setup()

        await expect(
            service.simulate(
                {
                    mode: 'SOURCE_DOCUMENT',
                    companyId: 'co-1',
                    postingDate: '2026-11-25',
                    sourceModule: 'MM',
                    transactionKey: 'GI_COGS',
                },
                user,
            ),
        ).rejects.toMatchObject({
            message: expect.stringContaining('sourceDocumentId'),
        })
    })

    describe('conflict analysis', () => {
        const base = {
            sourceModule: 'MM',
            transactionType: 'GOODS_RECEIPT',
            transactionKeyCode: 'GR_IR',
            valuationClassId: 'vc-1',
            materialTypeCode: null,
            movementType: null,
            customerAccountGroup: null,
            salesOrganization: null,
            distributionChannel: null,
            paymentMethodCode: null,
            bankAccountId: null,
            currencyCode: null,
            branchId: null,
            assetClassCode: null,
            effectiveFrom: null as Date | null,
            effectiveTo: null as Date | null,
        }

        it('flags ambiguous rules that tie on priority with different accounts', async () => {
            const { service } = setup({
                rules: [
                    {
                        ...base,
                        id: 'r1',
                        determinationCode: 'MM-001',
                        priority: 100,
                        lines: [line('DEBIT', 'acc-a', 1), line('CREDIT', 'acc-b', 2)],
                    },
                    {
                        ...base,
                        id: 'r2',
                        determinationCode: 'MM-002',
                        priority: 100,
                        lines: [line('DEBIT', 'acc-c', 1), line('CREDIT', 'acc-d', 2)],
                    },
                ],
            })

            const result = await service.analyseConflicts({ companyId: 'co-1' }, user)

            expect(result.safeDryRun).toBe(true)
            expect(result.conflicts).toHaveLength(1)
            expect(result.conflicts[0].sameTarget).toBe(false)
            expect(result.ambiguous).toBe(1)
        })

        it('does not flag rules in non-overlapping validity windows', async () => {
            const { service } = setup({
                rules: [
                    {
                        ...base,
                        id: 'r1',
                        determinationCode: 'MM-001',
                        priority: 100,
                        effectiveTo: new Date('2026-11-30T00:00:00Z'),
                        lines: [line('DEBIT', 'acc-a', 1), line('CREDIT', 'acc-b', 2)],
                    },
                    {
                        ...base,
                        id: 'r2',
                        determinationCode: 'MM-001-V2',
                        priority: 100,
                        effectiveFrom: new Date('2026-12-01T00:00:00Z'),
                        lines: [line('DEBIT', 'acc-c', 1), line('CREDIT', 'acc-d', 2)],
                    },
                ],
            })

            const result = await service.analyseConflicts({ companyId: 'co-1' }, user)

            expect(result.conflicts).toEqual([])
        })

        it('does not flag rules with different dimensions', async () => {
            const { service } = setup({
                rules: [
                    {
                        ...base,
                        id: 'r1',
                        determinationCode: 'MM-001',
                        priority: 100,
                        lines: [line('DEBIT', 'acc-a', 1), line('CREDIT', 'acc-b', 2)],
                    },
                    {
                        ...base,
                        id: 'r2',
                        determinationCode: 'MM-002',
                        priority: 100,
                        valuationClassId: 'vc-2',
                        lines: [line('DEBIT', 'acc-c', 1), line('CREDIT', 'acc-d', 2)],
                    },
                ],
            })

            const result = await service.analyseConflicts({ companyId: 'co-1' }, user)

            expect(result.conflicts).toEqual([])
        })
    })
})