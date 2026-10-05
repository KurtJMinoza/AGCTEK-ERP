import {
    BadRequestException,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionsService } from './permissions.service'
import { PermissionGuard, PERMISSION_KEY } from './permission.guard'
import { mergeFlags, normalizeFlags, NO_ACCESS } from './permissions.constants'
import { AUTH_USER_KEY } from '../auth/auth.decorator'
import { USER_ROLES } from '../auth/auth.constants'
import type { PrismaService } from '../prisma/prisma.service'
import { settingsStub } from '../system-settings/system-settings.testing'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'

const flags = (c: boolean, r: boolean, u: boolean, d: boolean, v = c || r || u || d) => ({
    canView: v,
    canCreate: c,
    canRead: r,
    canUpdate: u,
    canDelete: d,
})

type ModuleFixture = {
    id: string
    code: string
    isActive?: boolean
    perms?: Partial<Record<string, ReturnType<typeof flags>>>
}

function mockPrisma(modules: ModuleFixture[]) {
    const moduleRows = (role: string) =>
        modules.map((m) => ({
            id: m.id,
            code: m.code,
            name: m.code.toUpperCase(),
            description: '',
            isActive: m.isActive ?? true,
            permissions: m.perms?.[role] ? [m.perms[role]] : [],
        }))

    const prisma = {
        module: {
            findMany: jest.fn((args: { where?: { code?: { in: string[] } }; select?: unknown; include?: { permissions: { where: { role: string } } } }) => {
                const role =
                    (args.include?.permissions.where.role as string | undefined) ??
                    ((args.select as { permissions?: { where: { role: string } } })?.permissions?.where.role as string | undefined) ??
                    ''
                let rows = moduleRows(role)
                if (args.where?.code?.in) rows = rows.filter((r) => args.where!.code!.in.includes(r.code))
                return Promise.resolve(rows)
            }),
            upsert: jest.fn(),
        },
        rolePermission: {
            upsert: jest.fn((args: unknown) => args),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        user: { findUnique: jest.fn() },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    }
    return prisma
}

const MODULES: ModuleFixture[] = [
    { id: 'm-sd', code: 'sd', perms: { employee: flags(true, true, false, false), admin: flags(true, true, true, true) } },
    { id: 'm-fico', code: 'fico', perms: { employee: flags(false, false, false, false) } },
    { id: 'm-old', code: 'legacy', isActive: false, perms: { employee: flags(true, true, true, true) } },
    { id: 'm-admin', code: 'admin', perms: { employee: flags(true, true, true, true) } },
]

describe('permission flag helpers', () => {
    it('write grants imply read', () => {
        expect(normalizeFlags(flags(false, false, true, false)).canRead).toBe(true)
    })

    it('any grant implies view; view alone grants nothing else', () => {
        expect(normalizeFlags(flags(false, true, false, false, false))).toEqual(
            flags(false, true, false, false, true),
        )
        expect(normalizeFlags(flags(false, false, false, false, true))).toEqual(
            flags(false, false, false, false, true),
        )
    })

    it('merges sources additively', () => {
        expect(
            mergeFlags(flags(true, false, false, false), flags(false, true, false, true)),
        ).toEqual(flags(true, true, false, true))
        expect(mergeFlags()).toEqual(NO_ACCESS)
    })
})

describe('PermissionsService', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let service: PermissionsService

    beforeEach(() => {
        prisma = mockPrisma(MODULES)
        service = new PermissionsService(prisma as unknown as PrismaService, settingsStub())
    })

    it('denies a feature-disabled module to every role, including super_admin', async () => {
        const fixtures = [...MODULES, { id: 'm-crm', code: 'crm', perms: { employee: flags(true, true, true, true) } }]
        const off = settingsStub({ [SETTING_KEYS.FEATURE_CRM_ENABLED]: false })
        const svc = new PermissionsService(mockPrisma(fixtures) as unknown as PrismaService, off)
        expect(await svc.checkPermission(USER_ROLES.EMPLOYEE, 'crm', 'view')).toBe(false)
        expect(await svc.checkPermission(USER_ROLES.SUPER_ADMIN, 'crm', 'view')).toBe(false)
        expect(await svc.checkPermission(USER_ROLES.EMPLOYEE, 'sd', 'view')).toBe(true)
    })

    it('gives super_admin full access to every module', async () => {
        const p = await service.resolveForRole(USER_ROLES.SUPER_ADMIN)
        expect(p.admin).toEqual(flags(true, true, true, true))
        expect(p.legacy).toEqual(flags(true, true, true, true))
    })

    it('resolves stored grants for employee', async () => {
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd', 'create')).toBe(true)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd', 'delete')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'fico', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd', 'view')).toBe(true)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'fico', 'view')).toBe(false)
    })

    it('saves a view-only grant as module access without record access', async () => {
        await service.updateRolePermissions(USER_ROLES.EMPLOYEE, [
            { moduleCode: 'fico', ...flags(false, false, false, false, true) },
        ])
        expect(prisma.rolePermission.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: flags(false, false, false, false, true) }),
        )
    })

    it('rejects a view-only grant on super-admin-only modules', async () => {
        await expect(
            service.updateRolePermissions(USER_ROLES.ADMIN, [
                { moduleCode: 'admin', ...flags(false, false, false, false, true) },
            ]),
        ).rejects.toThrow(BadRequestException)
    })

    it('denies inactive modules, restricted modules and unknown codes', async () => {
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'legacy', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'admin', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'nope', 'read')).toBe(false)
    })

    it('denies deactivated users', async () => {
        prisma.user.findUnique.mockResolvedValue({ role: 'admin', isActive: false })
        expect(await service.checkPermission({ userId: 'u1' }, 'sd', 'read')).toBe(false)
    })

    it('throws Forbidden from assertPermission', async () => {
        await expect(
            service.assertPermission(USER_ROLES.EMPLOYEE, 'sd', 'delete'),
        ).rejects.toThrow(ForbiddenException)
    })

    it('rejects editing super_admin', async () => {
        await expect(
            service.updateRolePermissions(USER_ROLES.SUPER_ADMIN, []),
        ).rejects.toThrow(BadRequestException)
    })

    it('rejects grants on super-admin-only modules', async () => {
        await expect(
            service.updateRolePermissions(USER_ROLES.ADMIN, [
                { moduleCode: 'admin', ...flags(false, true, false, false) },
            ]),
        ).rejects.toThrow(BadRequestException)
    })

    it('rejects unknown module codes and unknown roles', async () => {
        await expect(
            service.updateRolePermissions(USER_ROLES.ADMIN, [
                { moduleCode: 'zzz', ...flags(false, true, false, false) },
            ]),
        ).rejects.toThrow(BadRequestException)
        await expect(service.getRolePermissions('owner')).rejects.toThrow(BadRequestException)
    })

    it('normalizes write-without-read on save', async () => {
        await service.updateRolePermissions(USER_ROLES.EMPLOYEE, [
            { moduleCode: 'sd', ...flags(false, false, true, false) },
        ])
        expect(prisma.rolePermission.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: flags(false, true, true, false),
            }),
        )
    })
})

describe('PermissionGuard', () => {
    function ctx(user?: { role: string }): ExecutionContext {
        return {
            switchToHttp: () => ({
                getRequest: () => (user ? { [AUTH_USER_KEY]: user } : {}),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        } as unknown as ExecutionContext
    }

    function guard(required: { module: string; action: string } | undefined) {
        const service = new PermissionsService(
            mockPrisma(MODULES) as unknown as PrismaService,
            settingsStub(),
        )
        const reflector = new Reflector()
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
            key === PERMISSION_KEY ? required : undefined,
        )
        return new PermissionGuard(reflector, service)
    }

    it('allows when no permission is required', async () => {
        await expect(guard(undefined).canActivate(ctx())).resolves.toBe(true)
    })

    it('allows a granted action', async () => {
        await expect(
            guard({ module: 'sd', action: 'create' }).canActivate(ctx({ role: 'employee' })),
        ).resolves.toBe(true)
    })

    it('forbids a missing action', async () => {
        await expect(
            guard({ module: 'sd', action: 'delete' }).canActivate(ctx({ role: 'employee' })),
        ).rejects.toThrow(ForbiddenException)
    })
})
