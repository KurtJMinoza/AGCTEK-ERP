import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FicoAccountMappingService } from './fico-account-mapping.service'

const user = { id: 'user-1' } as never

function account(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        accountCode: id.toUpperCase(),
        chartOfAccountsId: 'coa-1',
        status: 'ACTIVE',
        isPostingAccount: true,
        allowAutomaticPosting: true,
        companyAssignments: [{ postingEnabled: true }],
        ...overrides,
    }
}

function setup(options: { accounts?: unknown[]; createError?: unknown } = {}) {
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue({
                chartOfAccountsId: 'coa-1',
                accountDeterminationProfileId: 'profile-1',
                status: 'ACTIVE',
                chartOfAccounts: { id: 'coa-1', code: 'PH_MM_STARTER', name: 'Starter' },
                accountDeterminationProfile: { id: 'profile-1', code: 'DEFAULT', name: 'Default', status: 'ACTIVE' },
            }),
        },
        ficoTransactionKey: {
            findUnique: jest.fn().mockImplementation(({ where }) => ({
                code: where.code,
                status: 'ACTIVE',
                requiresValuationClass: where.code !== 'SUPPLIER_INVOICE',
            })),
            findMany: jest.fn().mockResolvedValue([
                { code: 'GR_IR', name: 'Goods receipt', requiresValuationClass: true },
                { code: 'SUPPLIER_INVOICE', name: 'Supplier invoice', requiresValuationClass: false },
                { code: 'GI_EXPENSE', name: 'Goods issue', requiresValuationClass: true },
            ]),
        },
        mmValuationClass: {
            findUnique: jest.fn().mockResolvedValue({ id: 'vc-1', code: 'TRADING' }),
            findMany: jest.fn().mockResolvedValue([{ id: 'vc-1', code: 'TRADING', name: 'Trading' }]),
        },
        ficoGlAccount: {
            findMany: jest
                .fn()
                .mockResolvedValue(options.accounts ?? [account('inv'), account('grir')]),
        },
        ficoMmAccountMapping: {
            findMany: jest.fn().mockResolvedValue([
                { id: 'm1', transactionKeyCode: 'GR_IR', valuationScopeKey: '*', valuationClassId: null, status: 'ACTIVE' },
                { id: 'm2', transactionKeyCode: 'SUPPLIER_INVOICE', valuationScopeKey: '*', valuationClassId: null, status: 'ACTIVE' },
            ]),
            findUnique: jest.fn().mockResolvedValue({ id: 'm1', companyId: 'co-1' }),
            create: options.createError
                ? jest.fn().mockRejectedValue(options.createError)
                : jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
            update: jest.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data })),
            delete: jest.fn(),
        },
    }
    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const service = new FicoAccountMappingService(prisma as never, access as never, audit as never)
    return { service, prisma, access, audit }
}

const base = {
    companyId: 'co-1',
    transactionKeyCode: 'GR_IR',
    debitAccountId: 'inv',
    creditAccountId: 'grir',
}

describe('FicoAccountMappingService', () => {
    it('reports which keys post automatically and which lack a default mapping', async () => {
        const { service } = setup()
        const result = await service.overview('co-1', user)
        const byCode = Object.fromEntries(result.transactionKeys.map((key) => [key.code, key]))
        expect(byCode.GR_IR).toMatchObject({ postsAutomatically: true, hasDefaultMapping: true })
        expect(byCode.SUPPLIER_INVOICE).toMatchObject({ postsAutomatically: false })
        expect(byCode.GI_EXPENSE).toMatchObject({ activeMappings: 0, hasDefaultMapping: false })
    })

    it('creates a default mapping for every valuation class and audits it', async () => {
        const { service, prisma, audit } = setup()
        await service.create(base, user)
        expect(prisma.ficoMmAccountMapping.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                profileId: 'profile-1',
                valuationScopeKey: '*',
                valuationClassId: null,
            }),
        })
        expect(audit.log).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'ACCOUNT_MAPPING_CREATE' }),
        )
    })

    it('scopes a mapping to a valuation class by its code', async () => {
        const { service, prisma } = setup()
        await service.create({ ...base, valuationClassId: 'vc-1' }, user)
        expect(prisma.ficoMmAccountMapping.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ valuationScopeKey: 'TRADING', valuationClassId: 'vc-1' }),
        })
    })

    it('rejects a valuation class on a key that does not vary by class', async () => {
        const { service } = setup()
        await expect(
            service.create(
                { ...base, transactionKeyCode: 'SUPPLIER_INVOICE', valuationClassId: 'vc-1' },
                user,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects the same account on both sides', async () => {
        const { service } = setup()
        await expect(
            service.create({ ...base, creditAccountId: 'inv' }, user),
        ).rejects.toThrow(/must be different/)
    })

    it('rejects accounts outside the company chart, not automatic, or not assigned', async () => {
        for (const [overrides, message] of [
            [{ chartOfAccountsId: 'coa-2' }, /not in the company's chart/],
            [{ allowAutomaticPosting: false }, /does not accept automatic postings/],
            [{ companyAssignments: [] }, /not assigned to the company/],
            [{ status: 'INACTIVE' }, /is inactive/],
        ] as const) {
            const { service } = setup({ accounts: [account('inv', overrides), account('grir')] })
            await expect(service.create(base, user)).rejects.toThrow(message)
        }
    })

    it('reports a duplicate scope as a conflict', async () => {
        const duplicate = new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
        })
        const { service } = setup({ createError: duplicate })
        await expect(service.create(base, user)).rejects.toBeInstanceOf(ConflictException)
    })

    it('checks company access before changing an existing mapping', async () => {
        const { service, access, prisma } = setup()
        access.assertAccess.mockRejectedValue(new ForbiddenException())
        await expect(service.update('m1', { status: 'INACTIVE' }, user)).rejects.toBeInstanceOf(
            ForbiddenException,
        )
        await expect(service.remove('m1', user)).rejects.toBeInstanceOf(ForbiddenException)
        expect(prisma.ficoMmAccountMapping.update).not.toHaveBeenCalled()
        expect(prisma.ficoMmAccountMapping.delete).not.toHaveBeenCalled()
    })
})
