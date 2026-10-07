import {
    BadRequestException,
    ConflictException,
    ExecutionContext,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { settingsStub } from '../system-settings/system-settings.testing'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'
import { Reflector } from '@nestjs/core'
import { UsersService } from './users.service'
import { UserCompaniesService } from './user-companies.service'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { AUTH_ROLES_KEY } from '../auth/auth.decorator'
import { USER_ROLES } from '../auth/auth.constants'
import type { PrismaService } from '../prisma/prisma.service'

function mockPrisma() {
    const prisma = {
        user: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        company: { findUnique: jest.fn() },
        userCompany: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation((arg: unknown) =>
        typeof arg === 'function'
            ? (arg as (tx: typeof prisma) => unknown)(prisma)
            : Promise.all(arg as unknown[]),
    )
    return prisma
}

function usersService(
    prisma: ReturnType<typeof mockPrisma>,
    settings = settingsStub(),
) {
    const db = prisma as unknown as PrismaService
    return new UsersService(db, new UserCompaniesService(db, settings), settings)
}

describe('UsersService', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let service: UsersService

    beforeEach(() => {
        prisma = mockPrisma()
        service = usersService(prisma)
    })

    it('requires a company when creating an admin or employee', async () => {
        await expect(
            service.create({
                email: 'e@x.com',
                userName: 'e',
                password: 'secret1',
                role: USER_ROLES.EMPLOYEE,
            }),
        ).rejects.toThrow(BadRequestException)
        expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('allows creating without a company when the setting is off', async () => {
        service = usersService(
            prisma,
            settingsStub({ [SETTING_KEYS.REQUIRE_DEFAULT_COMPANY_ON_USER]: false }),
        )
        prisma.user.findUnique.mockResolvedValue(null)
        prisma.user.create.mockResolvedValue({ id: 'new' })
        await service.create({
            email: 'e@x.com',
            userName: 'e',
            password: 'secret1',
            role: USER_ROLES.EMPLOYEE,
        })
        expect(prisma.user.create).toHaveBeenCalled()
        expect(prisma.userCompany.create).not.toHaveBeenCalled()
    })

    it('creates a user with its first company as default', async () => {
        prisma.user.findUnique.mockResolvedValue(null)
        prisma.company.findUnique.mockResolvedValue({ id: 'c1' })
        prisma.user.create.mockResolvedValue({ id: 'new' })
        await service.create({
            email: 'e@x.com',
            userName: 'e',
            password: 'secret1',
            role: USER_ROLES.EMPLOYEE,
            companyId: 'c1',
        })
        expect(prisma.userCompany.create).toHaveBeenCalledWith({
            data: { userId: 'new', companyId: 'c1', isDefault: true },
        })
    })

    it('blocks demoting a super admin who has no companies', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: USER_ROLES.SUPER_ADMIN })
        prisma.user.count.mockResolvedValue(3)
        prisma.userCompany.count.mockResolvedValue(0)
        await expect(
            service.update('u2', { role: USER_ROLES.ADMIN }, 'me'),
        ).rejects.toThrow(BadRequestException)
    })

    it('blocks changing your own role', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'me', role: USER_ROLES.SUPER_ADMIN })
        await expect(
            service.update('me', { role: USER_ROLES.ADMIN }, 'me'),
        ).rejects.toThrow(BadRequestException)
    })

    it('blocks deactivating yourself', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'me', role: USER_ROLES.SUPER_ADMIN })
        await expect(service.setStatus('me', false, 'me')).rejects.toThrow(
            BadRequestException,
        )
    })

    it('blocks deactivating the last active super admin', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: USER_ROLES.SUPER_ADMIN })
        prisma.user.count.mockResolvedValue(0)
        await expect(service.setStatus('u2', false, 'me')).rejects.toThrow(
            BadRequestException,
        )
        expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('deactivates an employee', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'u3', role: USER_ROLES.EMPLOYEE })
        prisma.user.update.mockResolvedValue({ id: 'u3', isActive: false })
        await service.setStatus('u3', false, 'me')
        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'u3' }, data: { isActive: false } }),
        )
    })
})

describe('UserCompaniesService', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let service: UserCompaniesService

    beforeEach(() => {
        prisma = mockPrisma()
        service = new UserCompaniesService(prisma as unknown as PrismaService, settingsStub())
        prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: USER_ROLES.EMPLOYEE })
        prisma.company.findUnique.mockResolvedValue({ id: 'c2' })
    })

    it('makes the first assigned company the default', async () => {
        prisma.userCompany.findUnique.mockResolvedValue(null)
        prisma.userCompany.count.mockResolvedValue(0)
        await service.assign('u1', 'c2')
        expect(prisma.userCompany.create).toHaveBeenCalledWith({
            data: { userId: 'u1', companyId: 'c2', isDefault: true },
        })
    })

    it('adds further companies as non-default', async () => {
        prisma.userCompany.findUnique.mockResolvedValue(null)
        prisma.userCompany.count.mockResolvedValue(1)
        await service.assign('u1', 'c2')
        expect(prisma.userCompany.create).toHaveBeenCalledWith({
            data: { userId: 'u1', companyId: 'c2', isDefault: false },
        })
    })

    it('rejects duplicate membership', async () => {
        prisma.userCompany.findUnique.mockResolvedValue({ id: 'm1' })
        await expect(service.assign('u1', 'c2')).rejects.toThrow(ConflictException)
    })

    it('rejects unknown companies', async () => {
        prisma.company.findUnique.mockResolvedValue(null)
        await expect(service.assign('u1', 'missing')).rejects.toThrow(NotFoundException)
    })

    it('blocks removing the last company of an employee', async () => {
        prisma.userCompany.findUnique.mockResolvedValue({ id: 'm1', isDefault: true })
        prisma.userCompany.count.mockResolvedValue(1)
        await expect(service.remove('u1', 'c1')).rejects.toThrow(BadRequestException)
        expect(prisma.userCompany.delete).not.toHaveBeenCalled()
    })

    it('allows a super admin to have no companies', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: USER_ROLES.SUPER_ADMIN })
        prisma.userCompany.findUnique.mockResolvedValue({ id: 'm1', isDefault: true })
        prisma.userCompany.count.mockResolvedValue(1)
        prisma.userCompany.findFirst.mockResolvedValue(null)
        await service.remove('u1', 'c1')
        expect(prisma.userCompany.delete).toHaveBeenCalledWith({ where: { id: 'm1' } })
    })

    it('promotes the oldest remaining membership when the default is removed', async () => {
        prisma.userCompany.findUnique.mockResolvedValue({ id: 'm1', isDefault: true })
        prisma.userCompany.count.mockResolvedValue(2)
        prisma.userCompany.findFirst.mockResolvedValue({ id: 'm2' })
        await service.remove('u1', 'c1')
        expect(prisma.userCompany.update).toHaveBeenCalledWith({
            where: { id: 'm2' },
            data: { isDefault: true },
        })
    })

    it('clears other defaults when setting a new default', async () => {
        prisma.userCompany.findUnique.mockResolvedValue({ id: 'm2', isDefault: false })
        await service.setDefault('u1', 'c2')
        expect(prisma.userCompany.updateMany).toHaveBeenCalledWith({
            where: { userId: 'u1', isDefault: true, NOT: { id: 'm2' } },
            data: { isDefault: false },
        })
        expect(prisma.userCompany.update).toHaveBeenCalledWith({
            where: { id: 'm2' },
            data: { isDefault: true },
        })
    })
})

describe('UserAuthGuard', () => {
    function ctx(headers: Record<string, string>): ExecutionContext {
        return {
            switchToHttp: () => ({ getRequest: () => ({ headers }) }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext
    }

    function guardFor(role: string) {
        const prisma = mockPrisma()
        prisma.user.findUnique.mockResolvedValue({
            id: 'u1',
            userName: 'u1',
            role,
            isActive: true,
        })
        const reflector = new Reflector()
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
            key === AUTH_ROLES_KEY ? [USER_ROLES.SUPER_ADMIN] : undefined,
        )
        return new UserAuthGuard(prisma as unknown as PrismaService, reflector)
    }

    it('allows super_admin', async () => {
        await expect(
            guardFor(USER_ROLES.SUPER_ADMIN).canActivate(ctx({ 'x-user-id': 'u1' })),
        ).resolves.toBe(true)
    })

    it.each([USER_ROLES.ADMIN, USER_ROLES.EMPLOYEE])('forbids %s', async (role) => {
        await expect(
            guardFor(role).canActivate(ctx({ 'x-user-id': 'u1' })),
        ).rejects.toThrow(ForbiddenException)
    })
})
