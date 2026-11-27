import { ForbiddenException } from '@nestjs/common'
import { USER_ROLES } from '../auth/auth.constants'
import { FicoCompanyAccessService } from './fico-company-access.service'

describe('FicoCompanyAccessService', () => {
    const company = {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    }
    const userCompany = {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    }
    const prisma = { company, userCompany }
    const service = new FicoCompanyAccessService(prisma as never)

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('lists every org company for admin (same master as MM Organization)', async () => {
        company.findMany.mockResolvedValue([
            {
                id: 'c1',
                code: 'AWIC',
                name: 'AWIC',
                tin: null,
                logoUrl: '/uploads/companies/awic.png',
            },
        ])

        const rows = await service.listAccessibleCompanies({
            id: 'admin-1',
            role: USER_ROLES.ADMIN,
        } as never)

        expect(userCompany.findMany).not.toHaveBeenCalled()
        expect(company.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {},
                select: expect.objectContaining({ logoUrl: true }),
            }),
        )
        expect(rows).toHaveLength(1)
        expect(rows[0].logoUrl).toBe('/uploads/companies/awic.png')
    })

    it('scopes non-admin users to user_companies memberships', async () => {
        userCompany.findMany.mockResolvedValue([{ companyId: 'c2' }])
        company.findMany.mockResolvedValue([
            { id: 'c2', code: 'AGCTEK', name: 'AGCTEK', tin: null },
        ])

        await service.listAccessibleCompanies({
            id: 'emp-1',
            role: USER_ROLES.EMPLOYEE,
        } as never)

        expect(userCompany.findMany).toHaveBeenCalledWith({
            where: { userId: 'emp-1' },
            select: { companyId: true },
        })
        expect(company.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: { in: ['c2'] } },
            }),
        )
    })

    it('blocks employees without membership', async () => {
        company.findUnique.mockResolvedValue({ id: 'c1' })
        userCompany.findUnique.mockResolvedValue(null)

        await expect(
            service.assertAccess(
                { id: 'emp-1', role: USER_ROLES.EMPLOYEE } as never,
                'c1',
            ),
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('allows admin to configure any org company without membership', async () => {
        await expect(
            service.assertAccess(
                { id: 'admin-1', role: USER_ROLES.ADMIN } as never,
                'c1',
            ),
        ).resolves.toBeUndefined()
        expect(userCompany.findUnique).not.toHaveBeenCalled()
    })
})
