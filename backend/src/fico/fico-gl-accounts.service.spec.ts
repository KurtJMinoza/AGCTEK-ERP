import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoGlAccountsService } from './fico-gl-accounts.service'

const user = { id: 'user-1' } as never

const chart = { id: 'coa-1', status: 'ACTIVE', accountCodeLength: 4 }

const groups = [
    { id: 'g-asset', code: 'ASSET', category: 'ASSET', status: 'ACTIVE', rangeFrom: '1000', rangeTo: '1999' },
    { id: 'g-rev', code: 'REV', category: 'REVENUE', status: 'ACTIVE', rangeFrom: '4000', rangeTo: '4999' },
]

function setup(existingCodes: string[] = []) {
    const tx = {
        ficoGlAccount: {
            create: jest.fn().mockImplementation(({ data }) => ({ id: `acc-${data.accountCode}`, ...data })),
        },
    }
    const prisma = {
        ficoChartOfAccounts: { findUnique: jest.fn().mockResolvedValue(chart) },
        ficoGlAccountGroup: {
            findFirst: jest.fn().mockImplementation(({ where }) =>
                groups.find((group) => group.id === where.id) ?? null,
            ),
            findMany: jest.fn().mockResolvedValue(groups),
        },
        ficoGlAccount: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest
                .fn()
                .mockResolvedValue(existingCodes.map((accountCode) => ({ accountCode }))),
            create: jest.fn().mockImplementation(({ data }) => ({ id: 'acc-new', ...data })),
        },
        $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const service = new FicoGlAccountsService(prisma as never, {} as never, audit as never)
    return { service, prisma, tx, audit }
}

const base = {
    chartOfAccountsId: 'coa-1',
    accountGroupId: 'g-asset',
    accountName: 'Cash in Bank',
    accountType: 'ASSET',
}

describe('FicoGlAccountsService create', () => {
    it('creates an account inside its group range with the default normal balance', async () => {
        const { service, prisma } = setup()
        await service.create({ ...base, accountCode: '1010' }, user)
        expect(prisma.ficoGlAccount.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ accountCode: '1010', normalBalance: 'DEBIT' }),
        })
    })

    it('keeps an explicit contra normal balance (accumulated depreciation)', async () => {
        const { service, prisma } = setup()
        await service.create(
            { ...base, accountCode: '1510', accountName: 'Accumulated Depreciation', normalBalance: 'CREDIT' },
            user,
        )
        expect(prisma.ficoGlAccount.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ accountType: 'ASSET', normalBalance: 'CREDIT' }),
        })
    })

    it('rejects a code outside the group range', async () => {
        const { service } = setup()
        await expect(
            service.create({ ...base, accountCode: '2000' }, user),
        ).rejects.toThrow(/outside group ASSET range \(1000–1999\)/)
    })

    it('rejects a code that does not match the chart code length', async () => {
        const { service } = setup()
        await expect(
            service.create({ ...base, accountCode: '101' }, user),
        ).rejects.toThrow(/exactly 4 characters/)
    })

    it('rejects an account type that differs from the group category', async () => {
        const { service } = setup()
        await expect(
            service.create({ ...base, accountCode: '1010', accountType: 'REVENUE' }, user),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a duplicate code in the same chart', async () => {
        const { service, prisma } = setup()
        prisma.ficoGlAccount.findUnique.mockResolvedValue({ id: 'dup' })
        await expect(
            service.create({ ...base, accountCode: '1010' }, user),
        ).rejects.toBeInstanceOf(ConflictException)
    })
})

describe('FicoGlAccountsService import', () => {
    const rows = [
        { accountCode: '1000', accountName: 'Cash on Hand', accountGroupCode: 'ASSET' },
        { accountCode: '1010', accountName: 'Cash in Bank', accountGroupCode: 'asset' },
        { accountCode: '4000', accountName: 'Sales Revenue', accountGroupCode: 'REV' },
        { accountCode: '4020', accountName: 'Sales Returns', accountGroupCode: 'REV', normalBalance: 'DEBIT' },
    ]

    it('reports creates and existing duplicates on a dry run without writing', async () => {
        const { service, prisma } = setup(['1000'])
        const report = await service.importAccounts(
            { chartOfAccountsId: 'coa-1', rows, dryRun: true },
            user,
        )
        expect(report.summary).toMatchObject({
            total: 4,
            CREATE: 3,
            DUPLICATE_EXISTING: 1,
            ERROR: 0,
        })
        expect(report.committed).toBe(false)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('flags in-file duplicates, unknown groups and out-of-range codes', async () => {
        const { service } = setup()
        const report = await service.importAccounts(
            {
                chartOfAccountsId: 'coa-1',
                dryRun: true,
                rows: [
                    ...rows,
                    { accountCode: '1010', accountName: 'Again', accountGroupCode: 'ASSET' },
                    { accountCode: '9000', accountName: 'Mystery', accountGroupCode: 'NOPE' },
                    { accountCode: '5000', accountName: 'Wrong group', accountGroupCode: 'ASSET' },
                ],
            },
            user,
        )
        expect(report.summary).toMatchObject({ CREATE: 4, DUPLICATE_IN_FILE: 1, ERROR: 2 })
        expect(report.rows[4]).toMatchObject({ rowNumber: 5, status: 'DUPLICATE_IN_FILE' })
        expect(report.rows[5].message).toMatch(/NOPE does not exist/)
        expect(report.rows[6].message).toMatch(/outside group ASSET range/)
    })

    it('refuses to commit when any row is invalid', async () => {
        const { service, prisma } = setup()
        await expect(
            service.importAccounts(
                {
                    chartOfAccountsId: 'coa-1',
                    dryRun: false,
                    rows: [...rows, { accountCode: '9000', accountName: 'X', accountGroupCode: 'NOPE' }],
                },
                user,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('creates new accounts in one audited transaction and skips existing ones', async () => {
        const { service, tx, audit } = setup(['1000'])
        const report = await service.importAccounts(
            { chartOfAccountsId: 'coa-1', rows, dryRun: false },
            user,
        )
        expect(report.committed).toBe(true)
        expect(tx.ficoGlAccount.create).toHaveBeenCalledTimes(3)
        expect(tx.ficoGlAccount.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ accountCode: '4020', normalBalance: 'DEBIT' }),
        })
        const actions = audit.log.mock.calls.map(([entry, client]) => [entry.action, client])
        expect(actions).toEqual([
            ['GL_ACCOUNT_CREATE', tx],
            ['GL_ACCOUNT_CREATE', tx],
            ['GL_ACCOUNT_CREATE', tx],
            ['GL_ACCOUNT_IMPORT', tx],
        ])
    })
})
