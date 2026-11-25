import { FicoAccountDeterminationExceptionService } from './fico-account-determination-exception.service'

type EventRow = {
    id: string
    eventType: string
    sourceModule: string
    documentType: string
    documentId: string
    companyId: string
    status: string
    payload: Record<string, unknown>
    lastError: string | null
    lastErrorCode: string | null
    attemptCount: number
    createdAt: Date
    lastAttemptAt: Date | null
}

function event(overrides: Partial<EventRow> = {}): EventRow {
    return {
        id: 'evt-1',
        eventType: 'GoodsIssuePosted',
        sourceModule: 'STOCK_OPS',
        documentType: 'GOODS_ISSUE',
        documentId: 'gi-1',
        companyId: 'co-1',
        status: 'PENDING',
        payload: { lines: [{ valuationClassId: 'vc-1' }], issuePurpose: 'SALES' },
        lastError:
            'Automatic accounting is blocked because no active account determination profile is assigned.',
        lastErrorCode: 'DETERMINATION',
        attemptCount: 2,
        createdAt: new Date('2026-11-25T00:00:00Z'),
        lastAttemptAt: new Date('2026-11-25T01:00:00Z'),
        ...overrides,
    }
}

function setup(options: {
    events?: EventRow[]
    settings?: Record<string, unknown> | null
    rules?: unknown[]
    legacyMappings?: number
} = {}) {
    const prisma = {
        mmAccountingEvent: {
            findMany: jest.fn().mockResolvedValue(options.events ?? []),
        },
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue(
                options.settings === undefined
                    ? {
                          status: 'ACTIVE',
                          chartOfAccountsId: 'coa-1',
                          accountDeterminationProfileId: 'profile-1',
                      }
                    : options.settings,
            ),
        },
        ficoAccountDeterminationRule: {
            findMany: jest.fn().mockResolvedValue(options.rules ?? []),
        },
        ficoMmAccountMapping: {
            count: jest.fn().mockResolvedValue(options.legacyMappings ?? 0),
        },
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    return {
        service: new FicoAccountDeterminationExceptionService(
            prisma as never,
            access as never,
        ),
        prisma,
        access,
    }
}

const user = { id: 'user-1', role: 'admin' } as never

describe('FicoAccountDeterminationExceptionService', () => {
    it('enforces company access before returning exceptions', async () => {
        const { service, access } = setup()

        await service.list({ companyId: 'co-1' }, user)

        expect(access.assertAccess).toHaveBeenCalledWith(user, 'co-1')
    })

    it('classifies a missing determination rule from the stored event error', async () => {
        const { service } = setup({ events: [event()] })

        const result = await service.list({ companyId: 'co-1' }, user)
        const row = result.items.find((item) => item.accountingEventId === 'evt-1')

        expect(row?.category).toBe('MISSING_DETERMINATION_RULE')
        expect(row?.expectedHandling).toBe('Create approved rule')
        expect(row?.retryCount).toBe(2)
        expect(row?.resolutionStatus).toBe('RETRYABLE')
    })

    it('marks exhausted events as blocked rather than retryable', async () => {
        const { service } = setup({ events: [event({ status: 'FAILED' })] })

        const result = await service.list({ companyId: 'co-1' }, user)

        expect(result.items[0].resolutionStatus).toBe('BLOCKED')
    })

    it('records the full exception context for an event', async () => {
        const { service } = setup({ events: [event()] })

        const row = (await service.list({ companyId: 'co-1' }, user)).items[0]

        expect(row).toMatchObject({
            companyId: 'co-1',
            sourceModule: 'STOCK_OPS',
            sourceDocumentType: 'GOODS_ISSUE',
            sourceDocumentId: 'gi-1',
            accountingEventId: 'evt-1',
            errorCode: 'DETERMINATION',
        })
        expect(row.firstFailureAt).toBe('2026-11-25T00:00:00.000Z')
        expect(row.lastFailureAt).toBe('2026-11-25T01:00:00.000Z')
        expect(row.resolutionContext).toMatchObject({ valuationClassId: 'vc-1' })
        expect(row.configurationLink).toBe('/modules/fico/account-determination')
    })

    it('classifies an ambiguous rule error', async () => {
        const { service } = setup({
            events: [
                event({
                    lastError:
                        'Ambiguous account determination for GOODS_RECEIPT: rules MM-001 and MM-002 tie on precedence.',
                    lastErrorCode: 'CONFLICT',
                }),
            ],
        })

        const row = (await service.list({ companyId: 'co-1' }, user)).items[0]

        expect(row.category).toBe('AMBIGUOUS_RULE')
        expect(row.expectedHandling).toBe('Resolve conflict')
    })

    it('raises a configuration exception when no determination profile is assigned', async () => {
        const { service } = setup({
            settings: {
                status: 'ACTIVE',
                chartOfAccountsId: 'coa-1',
                accountDeterminationProfileId: null,
            },
        })

        const result = await service.list({ companyId: 'co-1' }, user)

        expect(
            result.items.some(
                (row) =>
                    row.category === 'INVALID_COMPANY_ASSIGNMENT' &&
                    row.configurationLink === '/modules/fico/company-settings',
            ),
        ).toBe(true)
    })

    it('flags rules that target a blocked G/L account', async () => {
        const { service } = setup({
            rules: [
                {
                    id: 'rule-1',
                    determinationCode: 'MM-001',
                    status: 'ACTIVE',
                    sourceModule: 'MM',
                    transactionKeyCode: 'GR_IR',
                    effectiveTo: null,
                    updatedAt: new Date('2026-11-01T00:00:00Z'),
                    lines: [
                        {
                            glAccountId: 'acc-1',
                            glAccount: {
                                accountCode: '120100',
                                accountType: 'ASSET',
                                status: 'INACTIVE',
                                isPostingAccount: true,
                                allowAutomaticPosting: true,
                                chartOfAccountsId: 'coa-1',
                                companyAssignments: [{ id: 'assign-1' }],
                            },
                        },
                    ],
                },
            ],
        })

        const result = await service.list({ companyId: 'co-1' }, user)

        expect(
            result.items.some((row) => row.category === 'BLOCKED_GL_ACCOUNT'),
        ).toBe(true)
    })

    it('flags an account that is not assigned to the company', async () => {
        const { service } = setup({
            rules: [
                {
                    id: 'rule-1',
                    determinationCode: 'MM-001',
                    status: 'ACTIVE',
                    sourceModule: 'MM',
                    transactionKeyCode: 'GR_IR',
                    effectiveTo: null,
                    updatedAt: new Date('2026-11-01T00:00:00Z'),
                    lines: [
                        {
                            glAccountId: 'acc-1',
                            glAccount: {
                                accountCode: '120100',
                                accountType: 'ASSET',
                                status: 'ACTIVE',
                                isPostingAccount: true,
                                allowAutomaticPosting: true,
                                chartOfAccountsId: 'coa-1',
                                companyAssignments: [],
                            },
                        },
                    ],
                },
            ],
        })

        const result = await service.list({ companyId: 'co-1' }, user)

        expect(
            result.items.some(
                (row) =>
                    row.category === 'INVALID_COMPANY_ASSIGNMENT' &&
                    row.errorCode === 'FICO_ACCOUNT_COMPANY_MISMATCH',
            ),
        ).toBe(true)
    })

    it('reports legacy mappings with no centralized coverage', async () => {
        const { service } = setup({ legacyMappings: 12 })

        const result = await service.list({ companyId: 'co-1' }, user)

        expect(
            result.items.some(
                (row) => row.category === 'LEGACY_MIGRATION_DISCREPANCY',
            ),
        ).toBe(true)
    })

    it('filters by category and counts each bucket', async () => {
        const { service } = setup({ events: [event()], legacyMappings: 3 })

        const result = await service.list(
            { companyId: 'co-1', category: 'LEGACY_MIGRATION_DISCREPANCY' },
            user,
        )

        expect(result.items).toHaveLength(1)
        expect(result.items[0].category).toBe('LEGACY_MIGRATION_DISCREPANCY')
        expect(result.byCategory).toEqual({ LEGACY_MIGRATION_DISCREPANCY: 1 })
    })
})