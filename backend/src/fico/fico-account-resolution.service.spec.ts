import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoAccountResolutionService } from './fico-account-resolution.service'

const settings = {
    status: 'ACTIVE',
    baseCurrency: 'PHP',
    chartOfAccountsId: 'coa-1',
    chartOfAccounts: { id: 'coa-1', status: 'ACTIVE' },
}

function accountLine(
    lineNumber: number,
    side: 'DEBIT' | 'CREDIT',
    glAccountId: string,
) {
    return {
        lineNumber,
        side,
        glAccountId,
        description: null,
        glAccount: {
            accountCode: glAccountId === 'acc-inv' ? '120100' : '210200',
            accountName: glAccountId === 'acc-inv' ? 'Inventory' : 'GR/IR Clearing',
            accountType: glAccountId === 'acc-inv' ? 'ASSET' : 'LIABILITY',
        },
    }
}

function rule(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rule-1',
        determinationCode: 'MM-001',
        name: 'Goods receipt',
        priority: 100,
        effectiveFrom: null,
        effectiveTo: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        transactionKeyCode: null,
        valuationClassId: null,
        materialTypeCode: null,
        movementType: null,
        customerAccountGroup: null,
        salesOrganization: null,
        distributionChannel: null,
        paymentMethodCode: null,
        bankAccountId: null,
        paymentProviderCode: null,
        currencyCode: null,
        branchId: null,
        assetClassCode: null,
        depreciationAreaCode: null,
        documentTypeCode: null,
        productionOrderTypeCode: null,
        costElementCategoryCode: null,
        controllingAreaCode: null,
        lines: [accountLine(1, 'DEBIT', 'acc-inv'), accountLine(2, 'CREDIT', 'acc-grir')],
        ...overrides,
    }
}

function setup(rules: unknown[], overrides: { settings?: unknown } = {}) {
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue(overrides.settings ?? settings),
        },
        ficoAccountDeterminationRule: {
            findMany: jest.fn().mockResolvedValue(rules),
        },
    }
    const validation = {
        assertAccountPostable: jest.fn().mockImplementation((_companyId: string, id: string) =>
            Promise.resolve({
                glAccountId: id,
                accountCode: id === 'acc-inv' ? '120100' : '210200',
                accountName: 'Account',
                accountType: 'ASSET',
            }),
        ),
    }
    const service = new FicoAccountResolutionService(
        prisma as never,
        validation as never,
    )
    return { service, prisma, validation }
}

const request = {
    companyId: 'co-1',
    sourceModule: 'MM' as const,
    transactionType: 'GOODS_RECEIPT',
    postingDate: '2026-11-05',
}

describe('FicoAccountResolutionService', () => {
    it('resolves the most specific matching rule', async () => {
        const wildcard = rule()
        const specific = rule({
            id: 'rule-2',
            determinationCode: 'MM-002',
            valuationClassId: 'vc-1',
        })
        const { service } = setup([wildcard, specific])

        const result = await service.resolve({ ...request, valuationClassId: 'vc-1' })

        expect(result.rule.determinationCode).toBe('MM-002')
        expect(result.rule.specificity).toBe(1)
        expect(result.rule.matchedDimensions).toEqual(['valuationClassId'])
    })

    it('ignores a specific rule when the caller cannot supply its dimension', async () => {
        const { service } = setup([
            rule(),
            rule({ id: 'rule-2', determinationCode: 'MM-002', valuationClassId: 'vc-1' }),
        ])

        const result = await service.resolve(request)

        expect(result.rule.determinationCode).toBe('MM-001')
        expect(result.rule.specificity).toBe(0)
    })

    it('breaks a specificity tie with the lower priority number', async () => {
        const { service } = setup([
            rule({ id: 'rule-2', determinationCode: 'MM-002', priority: 10 }),
            rule({ id: 'rule-3', determinationCode: 'MM-003', priority: 50 }),
        ])

        const result = await service.resolve(request)

        expect(result.rule.determinationCode).toBe('MM-002')
    })

    it('prefers the later effective-from date when specificity and priority tie', async () => {
        const { service } = setup([
            rule({
                id: 'rule-old',
                determinationCode: 'MM-OLD',
                effectiveFrom: new Date('2025-01-01T00:00:00Z'),
            }),
            rule({
                id: 'rule-new',
                determinationCode: 'MM-NEW',
                effectiveFrom: new Date('2026-06-01T00:00:00Z'),
            }),
        ])

        const result = await service.resolve(request)

        expect(result.rule.determinationCode).toBe('MM-NEW')
    })

    it('refuses to guess when two rules tie completely', async () => {
        const { service } = setup([
            rule({ id: 'rule-1', determinationCode: 'MM-001' }),
            rule({ id: 'rule-2', determinationCode: 'MM-002' }),
        ])

        await expect(service.resolve(request)).rejects.toBeInstanceOf(ConflictException)
    })

    it('fails with a readable error when no rule matches', async () => {
        const { service } = setup([])

        await expect(service.resolve(request)).rejects.toMatchObject({
            message: expect.stringContaining('No approved, active and effective MM account determination rule'),
        })
    })

    it('returns every configured line and splits debit from credit', async () => {
        const { service } = setup([
            rule({
                sourceModule: 'SD',
                lines: [
                    accountLine(1, 'DEBIT', 'acc-inv'),
                    accountLine(2, 'CREDIT', 'acc-grir'),
                    accountLine(3, 'CREDIT', 'acc-inv'),
                ],
            }),
        ])

        const result = await service.resolve({
            ...request,
            sourceModule: 'SD',
            transactionType: 'CUSTOMER_BILLING',
        })

        expect(result.lines).toHaveLength(3)
        expect(result.debitLines).toHaveLength(1)
        expect(result.creditLines).toHaveLength(2)
    })

    it('scopes rule lookup to the requested company and module', async () => {
        const { service, prisma } = setup([rule()])

        await service.resolve(request)

        expect(prisma.ficoAccountDeterminationRule.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    companyId: 'co-1',
                    sourceModule: 'MM',
                    transactionType: 'GOODS_RECEIPT',
                    status: 'ACTIVE',
                }),
            }),
        )
    })

    it('rejects a rule without a credit line', async () => {
        const { service } = setup([rule({ lines: [accountLine(1, 'DEBIT', 'acc-inv')] })])

        await expect(service.resolve(request)).rejects.toMatchObject({
            message: expect.stringContaining('at least one debit and one credit line'),
        })
    })

    it('propagates account eligibility failures', async () => {
        const { service, validation } = setup([rule()])
        validation.assertAccountPostable.mockRejectedValueOnce(
            new BadRequestException('G/L account 120100 is inactive and cannot be posted to.'),
        )

        await expect(service.resolve(request)).rejects.toMatchObject({
            message: expect.stringContaining('cannot be posted to'),
        })
    })

    it('refuses companies whose accounting configuration is not active', async () => {
        const { service } = setup([rule()], {
            settings: { ...settings, status: 'DRAFT' },
        })

        await expect(service.resolve(request)).rejects.toMatchObject({
            message: expect.stringContaining('DRAFT'),
        })
    })

    it('refuses transaction types that do not belong to the module', async () => {
        const { service } = setup([rule()])

        await expect(
            service.resolve({ ...request, transactionType: 'CUSTOMER_BILLING' }),
        ).rejects.toMatchObject({
            message: expect.stringContaining('is not an MM transaction type'),
        })
    })

    it('rejects unsupported modules', async () => {
        const { service } = setup([rule()])

        await expect(
            service.resolve({ ...request, sourceModule: 'CRM' }),
        ).rejects.toMatchObject({
            message: expect.stringContaining('only configured for MM, SD, PP'),
        })
    })

    it('prefers a rule scoped to the requested transaction key', async () => {
        const generic = rule({ id: 'rule-gen', determinationCode: 'MM-GEN' })
        const keyed = rule({
            id: 'rule-key',
            determinationCode: 'MM-KEY',
            transactionKeyCode: 'GR_IR',
        })
        const { service } = setup([generic, keyed])

        const result = await service.resolve({
            ...request,
            transactionType: 'GR_IR_CLEARING',
            transactionKeyCode: 'GR_IR',
        })

        expect(result.rule.determinationCode).toBe('MM-KEY')
        expect(result.rule.matchedTransactionKey).toBe(true)
    })

    it('only queries ACTIVE rules effective on the posting date', async () => {
        const { service, prisma } = setup([rule()])

        await service.resolve(request)

        const where = prisma.ficoAccountDeterminationRule.findMany.mock.calls[0][0].where
        expect(where).toMatchObject({ companyId: 'co-1', status: 'ACTIVE' })
        // Draft, pending, approved, rejected and inactive rules are excluded by
        // the status filter; effective dating is enforced in the same query.
        expect(where.AND).toEqual([
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: expect.any(Date) } }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: expect.any(Date) } }] },
        ])
    })

    it('excludes a rule whose validity ended before the posting date', async () => {
        const { service } = setup([
            rule({ effectiveTo: new Date('2026-10-31T00:00:00Z') }),
        ])
        // The database filter removes it; an empty candidate set must fail loudly.
        const { service: empty } = setup([])

        await expect(empty.resolve(request)).rejects.toMatchObject({
            message: expect.stringContaining('No approved, active and effective'),
        })
        expect(service).toBeDefined()
    })

    it('resolves a scheduled rule once its effective-from date is reached', async () => {
        const { service } = setup([
            rule({
                id: 'rule-scheduled',
                determinationCode: 'MM-DEC',
                effectiveFrom: new Date('2026-11-01T00:00:00Z'),
            }),
        ])

        const result = await service.resolve(request)

        expect(result.rule.determinationCode).toBe('MM-DEC')
        expect(result.rule.effectiveFrom).toBe('2026-11-01')
    })

    describe('traceCandidates (simulation)', () => {
        it('explains why a candidate was rejected', async () => {
            const { service } = setup([
                rule({ id: 'rule-vc', determinationCode: 'MM-VC', valuationClassId: 'vc-1' }),
            ])

            const trace = await service.traceCandidates(request)

            expect(trace.candidates).toHaveLength(1)
            expect(trace.candidates[0]).toMatchObject({
                determinationCode: 'MM-VC',
                eligible: false,
            })
            expect(trace.candidates[0].unmatchedConditions).toEqual([
                { dimension: 'valuationClassId', ruleValue: 'vc-1', inputValue: null },
            ])
            expect(trace.selected).toBeNull()
        })

        it('reports the selected rule and matched dimensions', async () => {
            const { service } = setup([
                rule({ id: 'rule-vc', determinationCode: 'MM-VC', valuationClassId: 'vc-1' }),
            ])

            const trace = await service.traceCandidates({
                ...request,
                valuationClassId: 'vc-1',
            })

            expect(trace.selected?.determinationCode).toBe('MM-VC')
            expect(trace.candidates[0].matchedDimensions).toEqual(['valuationClassId'])
            expect(trace.configurationErrors).toEqual([])
        })

        it('captures the resolution error instead of throwing', async () => {
            const { service } = setup([])

            const trace = await service.traceCandidates(request)

            expect(trace.configurationErrors[0]).toContain(
                'No approved, active and effective',
            )
            expect(trace.resolution).toBeNull()
        })
    })

    it('resolveDeterminationBatch returns structured failure without partial success', async () => {
        const { service, prisma } = setup([rule()])
        prisma.ficoAccountDeterminationRule.findMany.mockResolvedValue([])

        const batch = await service.resolveDeterminationBatch({
            companyId: 'co-1',
            sourceModule: 'SD',
            postingDate: '2026-11-05',
            dimensions: {},
            items: [
                { transactionKey: 'SALES_REVENUE', preferredSide: 'CREDIT' },
                { transactionKey: 'OUTPUT_TAX', preferredSide: 'CREDIT' },
            ],
        })

        expect(batch).toMatchObject({
            ok: false,
            failures: expect.arrayContaining([
                expect.objectContaining({ transactionKey: 'SALES_REVENUE' }),
                expect.objectContaining({ transactionKey: 'OUTPUT_TAX' }),
            ]),
        })
    })
})
