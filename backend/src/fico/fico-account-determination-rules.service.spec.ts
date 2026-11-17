import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoAccountDeterminationRulesService } from './fico-account-determination-rules.service'

const user = { id: 'user-1' } as never

function existingRule(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rule-1',
        determinationCode: 'MM-001',
        name: 'Goods receipt',
        description: '',
        companyId: 'co-1',
        sourceModule: 'MM',
        transactionType: 'GOODS_RECEIPT',
        transactionKeyCode: 'GR_IR',
        priority: 100,
        effectiveFrom: null,
        effectiveTo: null,
        status: 'DRAFT',
        valuationClassId: null,
        materialTypeCode: null,
        movementType: null,
        customerAccountGroup: null,
        salesOrganization: null,
        distributionChannel: null,
        changeReason: null,
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        activatedBy: null,
        activatedAt: null,
        deactivatedBy: null,
        deactivatedAt: null,
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        lines: [
            { id: 'l1', lineNumber: 1, side: 'DEBIT', glAccountId: 'acc-inv', description: null },
            { id: 'l2', lineNumber: 2, side: 'CREDIT', glAccountId: 'acc-grir', description: null },
        ],
        ...overrides,
    }
}

function setup(options: {
    rule?: Record<string, unknown> | null
    duplicateCode?: boolean
    activeClones?: Array<Record<string, unknown>>
} = {}) {
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue({
                chartOfAccountsId: 'coa-1',
                baseCurrency: 'PHP',
                status: 'ACTIVE',
            }),
        },
        ficoAccountDeterminationRule: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.determinationCode) return options.duplicateCode ? { id: 'other' } : null
                return options.rule === null ? null : (options.rule ?? existingRule())
            }),
            findMany: jest.fn().mockResolvedValue(options.activeClones ?? []),
            create: jest.fn().mockImplementation(({ data }) => ({
                ...existingRule(),
                ...data,
                id: 'rule-new',
                lines: data.lines?.create ?? [],
            })),
            update: jest.fn().mockImplementation(({ data }) => ({
                ...(options.rule ?? existingRule()),
                ...data,
                lines: data.lines?.create ?? (options.rule ?? existingRule()).lines,
            })),
            delete: jest.fn(),
            count: jest.fn().mockResolvedValue(1),
        },
        ficoAccountDeterminationLine: { deleteMany: jest.fn() },
        $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => {
            return callback(prisma)
        }),
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const audit = { log: jest.fn().mockResolvedValue(undefined), listForEntity: jest.fn() }
    const validation = { assertAccountPostable: jest.fn().mockResolvedValue({}) }
    const service = new FicoAccountDeterminationRulesService(
        prisma as never,
        access as never,
        audit as never,
        validation as never,
    )
    return { service, prisma, access, audit, validation }
}

const createInput = {
    determinationCode: 'MM-006',
    name: 'New rule',
    companyId: 'co-1',
    sourceModule: 'MM',
    transactionType: 'GOODS_RECEIPT',
    lines: [
        { side: 'DEBIT', glAccountId: 'acc-inv' },
        { side: 'CREDIT', glAccountId: 'acc-grir' },
    ],
}

describe('FicoAccountDeterminationRulesService', () => {
    it('creates a draft with multiple lines and audits it', async () => {
        const { service, prisma, audit } = setup()

        await service.create(createInput, user)

        expect(prisma.ficoAccountDeterminationRule.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'DRAFT',
                    determinationCode: 'MM-006',
                    lines: { create: expect.arrayContaining([expect.objectContaining({ lineNumber: 1 })]) },
                }),
            }),
        )
        expect(audit.log).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'DETERMINATION_RULE_CREATE', entityId: 'rule-new' }),
        )
    })

    it('rejects a duplicate determination code', async () => {
        const { service } = setup({ duplicateCode: true })

        await expect(service.create(createInput, user)).rejects.toBeInstanceOf(ConflictException)
    })

    it('rejects lines without a debit side', async () => {
        const { service } = setup()

        await expect(
            service.create(
                {
                    ...createInput,
                    lines: [
                        { side: 'CREDIT', glAccountId: 'acc-grir' },
                        { side: 'CREDIT', glAccountId: 'acc-inv' },
                    ],
                },
                user,
            ),
        ).rejects.toMatchObject({
            message: expect.stringContaining('at least one debit and one credit'),
        })
    })

    it('rejects the same account twice on one side', async () => {
        const { service } = setup()

        await expect(
            service.create(
                {
                    ...createInput,
                    lines: [
                        { side: 'DEBIT', glAccountId: 'acc-inv' },
                        { side: 'DEBIT', glAccountId: 'acc-inv' },
                        { side: 'CREDIT', glAccountId: 'acc-grir' },
                    ],
                },
                user,
            ),
        ).rejects.toMatchObject({ message: expect.stringContaining('repeats the same debit account') })
    })

    it('rejects SD dimensions on an MM rule', async () => {
        const { service } = setup()

        await expect(
            service.create({ ...createInput, customerAccountGroup: 'B2B' }, user),
        ).rejects.toMatchObject({ message: expect.stringContaining('SD dimensions') })
    })

    it('blocks edits once a rule has left draft', async () => {
        const { service } = setup({ rule: existingRule({ status: 'ACTIVE' }) })

        await expect(
            service.update('rule-1', { name: 'Changed' }, user),
        ).rejects.toMatchObject({ message: expect.stringContaining('Only draft determinations') })
    })

    it('records the previous and new values on update', async () => {
        const { service, audit } = setup()

        await service.update('rule-1', { name: 'Renamed' }, user)

        expect(audit.log).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DETERMINATION_RULE_UPDATE',
                previousValues: expect.objectContaining({ name: 'Goods receipt' }),
            }),
        )
    })

    it('blocks deleting a rule that is not a draft', async () => {
        const { service } = setup({ rule: existingRule({ status: 'APPROVED' }) })

        await expect(service.remove('rule-1', user)).rejects.toMatchObject({
            message: expect.stringContaining('Only draft determinations can be deleted'),
        })
    })

    it('submits a draft for approval', async () => {
        const { service, prisma, audit } = setup()

        await service.submit('rule-1', user)

        expect(prisma.ficoAccountDeterminationRule.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'PENDING_APPROVAL',
                    submittedBy: 'user-1',
                }),
            }),
        )
        expect(audit.log).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'DETERMINATION_RULE_SUBMIT' }),
        )
    })

    it('blocks approval of a draft', async () => {
        const { service } = setup()

        await expect(service.approve('rule-1', {}, user)).rejects.toMatchObject({
            message: expect.stringContaining('Cannot approve a determination in DRAFT status'),
        })
    })

    it('requires a rejection reason', async () => {
        const { service } = setup({ rule: existingRule({ status: 'PENDING_APPROVAL' }) })

        await expect(service.reject('rule-1', {}, user)).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('rejects with the supplied reason', async () => {
        const { service, prisma } = setup({ rule: existingRule({ status: 'PENDING_APPROVAL' }) })

        await service.reject('rule-1', { reason: 'Wrong account' }, user)

        expect(prisma.ficoAccountDeterminationRule.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'REJECTED',
                    rejectionReason: 'Wrong account',
                }),
            }),
        )
    })

    it('blocks activation without approval evidence', async () => {
        const { service } = setup({
            rule: existingRule({ status: 'APPROVED', approvedBy: null, approvedAt: null }),
        })

        await expect(service.activate('rule-1', user)).rejects.toMatchObject({
            message: expect.stringContaining('must be approved before it can be activated'),
        })
    })

    it('refuses to activate a clone of an already active rule', async () => {
        const { service } = setup({
            rule: existingRule({
                status: 'APPROVED',
                approvedBy: 'approver',
                approvedAt: new Date('2026-02-01T00:00:00Z'),
            }),
            activeClones: [{ determinationCode: 'MM-OLD' }],
        })

        await expect(service.activate('rule-1', user)).rejects.toBeInstanceOf(ConflictException)
    })

    it('activates an approved rule', async () => {
        const { service, prisma } = setup({
            rule: existingRule({
                status: 'APPROVED',
                approvedBy: 'approver',
                approvedAt: new Date('2026-02-01T00:00:00Z'),
            }),
        })

        await service.activate('rule-1', user)

        expect(prisma.ficoAccountDeterminationRule.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'ACTIVE', activatedBy: 'user-1' }),
            }),
        )
    })

    it('deactivates only an active rule', async () => {
        const { service } = setup({ rule: existingRule({ status: 'APPROVED' }) })

        await expect(service.deactivate('rule-1', {}, user)).rejects.toMatchObject({
            message: expect.stringContaining('Cannot deactivate a determination in APPROVED status'),
        })
    })

    it('enforces company access before listing', async () => {
        const { service, access } = setup()

        await service.list({ companyId: 'co-2' }, user)

        expect(access.assertAccess).toHaveBeenCalledWith(user, 'co-2')
    })
})
