import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoChartOfAccountsService } from './fico-chart-of-accounts.service'

const user = { id: 'user-1' } as never

function setup(overrides: Record<string, unknown> = {}) {
    const prisma = {
        ficoChartOfAccounts: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'coa-1',
                accountCodeLength: 4,
                groups: [],
                _count: { accounts: 0, settings: 0 },
            }),
            create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
            update: jest.fn().mockImplementation(({ data }) => ({ id: 'coa-1', ...data })),
        },
        ficoGlAccountGroup: {
            findUnique: jest.fn().mockResolvedValue(null),
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockImplementation(({ data }) => ({ id: 'grp-new', ...data })),
            update: jest.fn().mockImplementation(({ data }) => ({ id: 'grp-1', ...data })),
        },
        ficoGlAccount: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
        },
        ficoCompanyAccountingSettings: { count: jest.fn().mockResolvedValue(0) },
        ...overrides,
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    return {
        prisma,
        audit,
        service: new FicoChartOfAccountsService(prisma as never, audit as never),
    }
}

describe('FicoChartOfAccountsService', () => {
    it('rejects a duplicate chart code', async () => {
        const { service } = setup({
            ficoChartOfAccounts: {
                findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
            },
        })
        await expect(
            service.create({ code: 'agctek_coa', name: 'AGCTEK' }, user),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('stores the account-code length on a new chart', async () => {
        const { service, prisma } = setup({
            ficoChartOfAccounts: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data })),
            },
        })
        await service.create(
            { code: 'agctek_coa', name: 'AGCTEK', accountCodeLength: 4 },
            user,
        )
        expect(prisma.ficoChartOfAccounts.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ code: 'AGCTEK_COA', accountCodeLength: 4 }),
            }),
        )
    })

    it('refuses a code length that existing accounts do not satisfy', async () => {
        const { service, prisma } = setup()
        prisma.ficoChartOfAccounts.findUnique.mockResolvedValue({
            id: 'coa-1',
            accountCodeLength: null,
            groups: [],
            _count: { accounts: 1, settings: 0 },
        })
        prisma.ficoGlAccount.findMany.mockResolvedValue([{ accountCode: '120100' }])
        await expect(
            service.update('coa-1', { accountCodeLength: 4 }, user),
        ).rejects.toThrow(/Account 120100 does not have 4 characters/)
        expect(prisma.ficoChartOfAccounts.update).not.toHaveBeenCalled()
    })

    it('requires a group range to match the chart code length', async () => {
        const { service } = setup()
        await expect(
            service.createGroup(
                'coa-1',
                { code: 'ASSET', name: 'Assets', category: 'ASSET', rangeFrom: '100', rangeTo: '199' },
                user,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a group range that overlaps a sibling', async () => {
        const { service, prisma } = setup()
        prisma.ficoGlAccountGroup.findMany.mockResolvedValue([
            { code: 'OTHER_INC', rangeFrom: '7000', rangeTo: '7099' },
        ])
        await expect(
            service.createGroup(
                'coa-1',
                { code: 'OTHER_EXP', name: 'Other expenses', category: 'EXPENSE', rangeFrom: '7050', rangeTo: '7199' },
                user,
            ),
        ).rejects.toThrow(/overlaps account group OTHER_INC/)
    })

    it('rejects a subgroup range outside its parent range', async () => {
        const { service, prisma } = setup()
        prisma.ficoGlAccountGroup.findFirst.mockResolvedValue({
            id: 'parent',
            code: 'ASSET',
            category: 'ASSET',
            rangeFrom: '1000',
            rangeTo: '1999',
        })
        await expect(
            service.createGroup(
                'coa-1',
                {
                    code: 'CASH',
                    name: 'Cash',
                    category: 'ASSET',
                    parentGroupId: 'parent',
                    rangeFrom: '1900',
                    rangeTo: '2099',
                },
                user,
            ),
        ).rejects.toThrow(/inside the parent group ASSET/)
    })

    it('creates non-overlapping split groups for other income and expense', async () => {
        const { service, prisma } = setup()
        prisma.ficoGlAccountGroup.findMany.mockResolvedValue([
            { code: 'OTHER_INC', rangeFrom: '7000', rangeTo: '7099' },
        ])
        const created = await service.createGroup(
            'coa-1',
            { code: 'other_exp', name: 'Other expenses', category: 'EXPENSE', rangeFrom: '7100', rangeTo: '7199' },
            user,
        )
        expect(created).toMatchObject({ code: 'OTHER_EXP', rangeFrom: '7100', rangeTo: '7199' })
    })

    it('refuses to narrow a range that would exclude an existing account', async () => {
        const { service, prisma } = setup()
        prisma.ficoGlAccountGroup.findFirst.mockResolvedValue({
            id: 'grp-1',
            code: 'ASSET',
            category: 'ASSET',
            parentGroupId: null,
            rangeFrom: '1000',
            rangeTo: '1999',
        })
        prisma.ficoGlAccount.findMany.mockResolvedValue([{ accountCode: '1510' }])
        await expect(
            service.updateGroup(
                'coa-1',
                'grp-1',
                { rangeFrom: '1000', rangeTo: '1499' },
                user,
            ),
        ).rejects.toThrow(/Account 1510 would fall outside/)
    })

    it('does not delete a chart that still has accounts', async () => {
        const { service } = setup({
            ficoChartOfAccounts: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'coa-1',
                    groups: [{ id: 'g' }],
                    _count: { accounts: 3, settings: 0 },
                }),
            },
        })
        await expect(service.remove('coa-1', user)).rejects.toBeInstanceOf(
            ConflictException,
        )
    })
})
