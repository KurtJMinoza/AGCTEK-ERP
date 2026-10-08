import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import {
    BadRequestException,
    ConflictException,
    ExecutionContext,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionsService } from './permissions.service'
import { RoleTemplatesService } from './role-templates.service'
import { PermissionGuard, PERMISSION_KEY } from './permission.guard'
import {
    mergeFlags,
    normalizeFlags,
    NO_ACCESS,
    FULL_ACCESS,
    RESOURCES_BY_CODE,
    RESOURCE_CATALOG,
    MM_FEATURES,
    MODULE_CATALOG,
} from './permissions.constants'
import { AUTH_USER_KEY } from '../auth/auth.decorator'
import { USER_ROLES } from '../auth/auth.constants'
import type { PrismaService } from '../prisma/prisma.service'
import { settingsStub } from '../system-settings/system-settings.testing'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'

const flags = (r: boolean, c: boolean, u: boolean, d: boolean) => ({
    canRead: r,
    canCreate: c,
    canUpdate: u,
    canDelete: d,
})

type ResourceFixture = {
    id: string
    code: string
    parentId?: string
    isActive?: boolean
    perms?: Record<string, ReturnType<typeof flags>>
}
type ModuleFixture = { id: string; code: string; isActive?: boolean; resources: ResourceFixture[] }
type RoleFixture = { id: string; code: string; isActive?: boolean; isSystem?: boolean; name?: string }

const ROLES: RoleFixture[] = [
    { id: 'r-super', code: USER_ROLES.SUPER_ADMIN, isSystem: true },
    { id: 'r-admin', code: USER_ROLES.ADMIN, isSystem: true },
    { id: 'r-emp', code: USER_ROLES.EMPLOYEE, isSystem: true, name: 'Employee' },
    { id: 'r-off', code: 'retired', isActive: false },
    { id: 'r-wh', code: 'warehouse_operator', name: 'Warehouse Operator' },
]

const MODULES: ModuleFixture[] = [
    {
        id: 'm-sd',
        code: 'sd',
        resources: [
            { id: 'res-so', code: 'sd.sales-orders', perms: { 'r-emp': flags(true, true, false, false), 'r-admin': FULL_ACCESS, 'r-off': FULL_ACCESS } },
            { id: 'res-bill', code: 'sd.billing', perms: { 'r-emp': flags(false, false, false, false) } },
            { id: 'res-old', code: 'sd.legacy', isActive: false, perms: { 'r-emp': FULL_ACCESS } },
        ],
    },
    {
        id: 'm-fico',
        code: 'fico',
        resources: [{ id: 'res-je', code: 'fico.journal-entries', perms: { 'r-emp': flags(false, false, false, false) } }],
    },
    {
        id: 'm-crm',
        code: 'crm',
        resources: [{ id: 'res-leads', code: 'crm.leads', perms: { 'r-emp': FULL_ACCESS } }],
    },
    {
        id: 'm-inactive',
        code: 'scm',
        isActive: false,
        resources: [{ id: 'res-trips', code: 'scm.trips', perms: { 'r-emp': FULL_ACCESS } }],
    },
    {
        id: 'm-mm',
        code: 'mm',
        resources: [
            // Stale grant on a submodule with features: must be ignored.
            { id: 'res-proc', code: 'mm.procurement', perms: { 'r-wh': FULL_ACCESS } },
            { id: 'res-po', code: 'mm.procurement.purchase-orders', parentId: 'res-proc', perms: { 'r-wh': flags(true, true, false, false) } },
            { id: 'res-rfq', code: 'mm.procurement.rfqs', parentId: 'res-proc' },
            { id: 'res-mmdash', code: 'mm.dashboard', perms: { 'r-wh': flags(true, false, false, false) } },
        ],
    },
    { id: 'm-admin', code: 'admin', resources: [] },
]

type FindManyArgs = {
    where?: { code?: { notIn?: string[]; in?: string[] }; roleId?: string }
    select?: { resources?: { select?: { permissions?: { where: { roleId: string } } } } }
}

function mockPrisma(modules: ModuleFixture[] = MODULES, roles: RoleFixture[] = ROLES) {
    const allResources = modules.flatMap((m) => m.resources)
    const resourceRows = (m: ModuleFixture, roleId?: string) =>
        m.resources.map((r) => ({
            id: r.id,
            parentId: r.parentId ?? null,
            code: r.code,
            name: r.code,
            description: '',
            isActive: r.isActive ?? true,
            permissions: roleId && r.perms?.[roleId] ? [r.perms[roleId]] : [],
        }))

    const roleRow = (role: RoleFixture) => ({
        ...role,
        isActive: role.isActive ?? true,
        name: role.name ?? role.code,
        description: '',
        isSystem: role.isSystem ?? false,
    })

    const prisma = {
        role: {
            findUnique: jest.fn(({ where }: { where: { code: string } }) => {
                const role = roles.find((r) => r.code === where.code)
                return Promise.resolve(role ? roleRow(role) : null)
            }),
            findFirst: jest.fn(
                ({ where }: { where: { name: { equals: string }; id?: { not: string } } }) => {
                    const role = roles.find(
                        (r) =>
                            roleRow(r).name.toLowerCase() === where.name.equals.toLowerCase() &&
                            r.id !== where.id?.not,
                    )
                    return Promise.resolve(role ? { id: role.id } : null)
                },
            ),
            findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id })),
            create: jest.fn(({ data }: { data: { code: string } }) => Promise.resolve({ id: 'r-new', code: data.code })),
            update: jest.fn((args: unknown) => Promise.resolve(args)),
            delete: jest.fn().mockResolvedValue({}),
            upsert: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
        },
        module: {
            findMany: jest.fn((args: FindManyArgs) => {
                const roleId = args.select?.resources?.select?.permissions?.where.roleId
                let rows = modules
                if (args.where?.code?.notIn) rows = rows.filter((m) => !args.where!.code!.notIn!.includes(m.code))
                return Promise.resolve(
                    rows.map((m) => ({
                        id: m.id,
                        code: m.code,
                        name: m.code.toUpperCase(),
                        description: '',
                        isActive: m.isActive ?? true,
                        resources: resourceRows(m, roleId),
                    })),
                )
            }),
            upsert: jest.fn(),
        },
        permissionResource: {
            findMany: jest.fn((args: FindManyArgs) =>
                Promise.resolve(
                    allResources
                        .filter((r) => !args.where?.code?.in || args.where.code.in.includes(r.code))
                        .map((r) => ({
                            id: r.id,
                            code: r.code,
                            _count: { children: allResources.filter((c) => c.parentId === r.id).length },
                        })),
                ),
            ),
            upsert: jest.fn(),
        },
        rolePermission: {
            findMany: jest.fn((args: FindManyArgs) =>
                Promise.resolve(
                    allResources
                        .filter((r) => args.where?.roleId && r.perms?.[args.where.roleId])
                        .map((r) => ({ resourceId: r.id, ...r.perms![args.where!.roleId!] })),
                ),
            ),
            upsert: jest.fn((args: unknown) => args),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        user: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
        roleTemplate: {
            findUnique: jest.fn(({ where }: { where: { code: string } }) =>
                Promise.resolve(
                    where.code === 'wh_template'
                        ? { id: 't-wh', code: 'wh_template', name: 'Warehouse Template', description: '' }
                        : null,
                ),
            ),
            findFirst: jest.fn(({ where }: { where: { name: { equals: string } } }) =>
                Promise.resolve(where.name.equals.toLowerCase() === 'warehouse template' ? { id: 't-wh' } : null),
            ),
            findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id })),
            create: jest.fn().mockResolvedValue({ id: 't-new' }),
            update: jest.fn((args: unknown) => Promise.resolve(args)),
            delete: jest.fn().mockResolvedValue({}),
        },
        roleTemplatePermission: {
            findMany: jest.fn(({ where }: { where: { templateId: string } }) =>
                Promise.resolve(
                    where.templateId === 't-wh'
                        ? [{ resourceId: 'res-so', ...flags(true, true, true, false) }]
                        : [],
                ),
            ),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
            upsert: jest.fn((args: unknown) => args),
        },
        $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation((arg: unknown) =>
        typeof arg === 'function'
            ? (arg as (tx: typeof prisma) => unknown)(prisma)
            : Promise.all(arg as unknown[]),
    )
    return prisma
}

describe('permission flag helpers', () => {
    it('write grants imply read', () => {
        expect(normalizeFlags(flags(false, false, true, false))).toEqual(flags(true, false, true, false))
        expect(normalizeFlags(flags(false, false, false, false))).toEqual(NO_ACCESS)
    })

    it('merges sources additively', () => {
        expect(mergeFlags(flags(false, true, false, false), flags(true, false, false, true))).toEqual(
            flags(true, true, false, true),
        )
        expect(mergeFlags()).toEqual(NO_ACCESS)
    })
})

describe('resource catalog', () => {
    it('has unique codes prefixed by their group', () => {
        expect(RESOURCES_BY_CODE.size).toBe(RESOURCE_CATALOG.length)
        for (const r of RESOURCE_CATALOG) expect(r.code.startsWith(`${r.module}.`)).toBe(true)
    })

    it('lists every feature after its parent submodule, within the same group', () => {
        const seen = new Set<string>()
        for (const r of RESOURCE_CATALOG) {
            if (r.parent) {
                expect(seen.has(r.parent)).toBe(true)
                expect(RESOURCES_BY_CODE.get(r.parent)!.module).toBe(r.module)
                expect(r.code.startsWith(`${r.parent}.`)).toBe(true)
            }
            seen.add(r.code)
        }
        expect(Object.keys(MM_FEATURES).every((s) => RESOURCES_BY_CODE.has(`mm.${s}`))).toBe(true)
    })

    it('covers every resource code used by guards and services', () => {
        const root = join(__dirname, '..')
        const files: string[] = []
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const path = join(dir, name)
                if (statSync(path).isDirectory()) walk(path)
                else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) files.push(path)
            }
        }
        walk(root)
        const pattern = /(?:RequirePermission|MmMutation|RequireMmPermission|assertPermission\([^,]+,)\(?\s*'([a-z-]+\.[a-z-]+)'/g
        const used = new Set<string>()
        for (const file of files) {
            for (const match of readFileSync(file, 'utf8').matchAll(pattern)) used.add(match[1])
        }
        expect(used.size).toBeGreaterThan(5)
        expect([...used].filter((code) => !RESOURCES_BY_CODE.has(code))).toEqual([])
    })
})

describe('PermissionsService', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let service: PermissionsService

    beforeEach(() => {
        prisma = mockPrisma()
        service = new PermissionsService(prisma as unknown as PrismaService, settingsStub())
    })

    it('resolves stored grants per resource', async () => {
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd.sales-orders', 'create')).toBe(true)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd.sales-orders', 'delete')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd.billing', 'read')).toBe(false)
    })

    it('treats a group as readable when any of its resources is readable', async () => {
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd', 'read')).toBe(true)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd', 'delete')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'fico', 'read')).toBe(false)
    })

    it('denies inactive resources, inactive groups, super-admin-only groups and unknown codes', async () => {
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd.legacy', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'scm.trips', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'scm', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'admin', 'read')).toBe(false)
        expect(await service.checkPermission(USER_ROLES.EMPLOYEE, 'sd.nope', 'read')).toBe(false)
    })

    it('grants nothing to inactive or unknown roles', async () => {
        expect(await service.checkPermission('retired', 'sd.sales-orders', 'read')).toBe(false)
        expect(await service.checkPermission('ghost', 'sd.sales-orders', 'read')).toBe(false)
    })

    it('gives super_admin full access to every resource and group regardless of stored rows', async () => {
        const p = await service.resolveForRole(USER_ROLES.SUPER_ADMIN)
        expect(p.resources['sd.billing']).toEqual(FULL_ACCESS)
        expect(p.resources['sd.legacy']).toEqual(FULL_ACCESS)
        expect(p.modules.admin).toEqual(FULL_ACCESS)
    })

    it('masks every resource of a feature-disabled group for every role, including super_admin', async () => {
        const off = settingsStub({ [SETTING_KEYS.FEATURE_CRM_ENABLED]: false })
        const svc = new PermissionsService(mockPrisma() as unknown as PrismaService, off)
        expect(await svc.checkPermission(USER_ROLES.EMPLOYEE, 'crm.leads', 'read')).toBe(false)
        expect(await svc.checkPermission(USER_ROLES.EMPLOYEE, 'crm', 'read')).toBe(false)
        expect(await svc.checkPermission(USER_ROLES.SUPER_ADMIN, 'crm.leads', 'read')).toBe(false)
        expect(await svc.checkPermission(USER_ROLES.EMPLOYEE, 'sd.sales-orders', 'read')).toBe(true)
    })

    it('denies deactivated users', async () => {
        prisma.user.findUnique.mockResolvedValue({ role: 'admin', isActive: false })
        expect(await service.checkPermission({ userId: 'u1' }, 'sd.sales-orders', 'read')).toBe(false)
    })

    it('throws Forbidden from assertPermission', async () => {
        await expect(service.assertPermission(USER_ROLES.EMPLOYEE, 'sd.sales-orders', 'delete')).rejects.toThrow(
            ForbiddenException,
        )
    })

    it('returns a grouped matrix without super-admin-only groups', async () => {
        const matrix = await service.getRolePermissions(USER_ROLES.EMPLOYEE)
        expect(matrix.editable).toBe(true)
        expect(matrix.groups.map((g) => g.code)).not.toContain('admin')
        const so = matrix.groups.find((g) => g.code === 'sd')!.resources.find((r) => r.code === 'sd.sales-orders')!
        expect(so).toMatchObject(flags(true, true, false, false))
    })

    it('normalizes write-without-read on save', async () => {
        await service.updateRolePermissions(USER_ROLES.EMPLOYEE, [
            { resourceCode: 'sd.billing', ...flags(false, false, true, false) },
        ])
        expect(prisma.rolePermission.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { roleId_resourceId: { roleId: 'r-emp', resourceId: 'res-bill' } },
                update: flags(true, false, true, false),
            }),
        )
    })

    it('rejects editing super_admin, unknown resources, duplicates and unknown roles', async () => {
        await expect(service.updateRolePermissions(USER_ROLES.SUPER_ADMIN, [])).rejects.toThrow(BadRequestException)
        await expect(
            service.updateRolePermissions(USER_ROLES.ADMIN, [{ resourceCode: 'zzz.x', ...FULL_ACCESS }]),
        ).rejects.toThrow(BadRequestException)
        await expect(
            service.updateRolePermissions(USER_ROLES.ADMIN, [
                { resourceCode: 'sd.billing', ...FULL_ACCESS },
                { resourceCode: 'sd.billing', ...NO_ACCESS },
            ]),
        ).rejects.toThrow(BadRequestException)
        await expect(service.getRolePermissions('owner')).rejects.toThrow(NotFoundException)
    })
})

describe('PermissionsService features inside submodules', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let service: PermissionsService

    beforeEach(() => {
        prisma = mockPrisma()
        service = new PermissionsService(prisma as unknown as PrismaService, settingsStub())
    })

    it('resolves features from their own grants and ignores grants stored on the submodule', async () => {
        const p = await service.resolveForRole('warehouse_operator')
        expect(p.resources['mm.procurement.purchase-orders']).toEqual(flags(true, true, false, false))
        expect(p.resources['mm.procurement.rfqs']).toEqual(NO_ACCESS)
        expect(p.resources['mm.procurement']).toEqual(flags(true, true, false, false))
        expect(p.modules.mm).toEqual(flags(true, true, false, false))
    })

    it('denies every feature of an inactive submodule', async () => {
        const modules = MODULES.map((m) =>
            m.code === 'mm'
                ? { ...m, resources: m.resources.map((r) => (r.id === 'res-proc' ? { ...r, isActive: false } : r)) }
                : m,
        )
        const svc = new PermissionsService(mockPrisma(modules) as unknown as PrismaService, settingsStub())
        expect(await svc.checkPermission('warehouse_operator', 'mm.procurement.purchase-orders', 'read')).toBe(false)
        expect(await svc.checkPermission('warehouse_operator', 'mm.procurement', 'read')).toBe(false)
        expect(await svc.checkPermission('warehouse_operator', 'mm.dashboard', 'read')).toBe(true)
    })

    it('nests features under their submodule in the matrix, with the submodule showing their union', async () => {
        const { groups } = await service.getRolePermissions('warehouse_operator')
        const mm = groups.find((g) => g.code === 'mm')!
        expect(mm.resources.map((r) => r.code)).toEqual(['mm.procurement', 'mm.dashboard'])
        const proc = mm.resources[0] as { children?: { code: string }[] } & ReturnType<typeof flags>
        expect(proc.children!.map((c) => c.code)).toEqual(['mm.procurement.purchase-orders', 'mm.procurement.rfqs'])
        expect(proc).toMatchObject(flags(true, true, false, false))
    })

    it('rejects saving grants on a submodule that has features', async () => {
        await expect(
            service.updateRolePermissions('warehouse_operator', [{ resourceCode: 'mm.procurement', ...FULL_ACCESS }]),
        ).rejects.toThrow(BadRequestException)
        expect(prisma.rolePermission.upsert).not.toHaveBeenCalled()
    })

    it('passes assertPermission when any listed resource allows the action', async () => {
        await expect(
            service.assertPermission(
                'warehouse_operator',
                ['mm.procurement.rfqs', 'mm.procurement.purchase-orders'],
                'create',
            ),
        ).resolves.toBeUndefined()
        await expect(
            service.assertPermission('warehouse_operator', ['mm.procurement.rfqs'], 'create'),
        ).rejects.toThrow(ForbiddenException)
    })
})

describe('PermissionsService.seed with features', () => {
    function seedPrisma(existingCodes: string[]) {
        return {
            role: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            module: {
                upsert: jest.fn(),
                findMany: jest.fn().mockResolvedValue(MODULE_CATALOG.map((m) => ({ id: `m-${m.code}`, code: m.code }))),
            },
            permissionResource: {
                findMany: jest.fn((args?: { where?: unknown }) =>
                    Promise.resolve(args?.where ? [] : existingCodes.map((code) => ({ code }))),
                ),
                upsert: jest.fn(({ where }: { where: { code: string } }) => Promise.resolve({ id: `id:${where.code}` })),
            },
            rolePermission: {
                findMany: jest.fn().mockResolvedValue([
                    { roleId: 'r-wh', resourceId: 'id:mm.procurement', ...flags(true, true, false, false) },
                ]),
                createMany: jest.fn().mockResolvedValue({ count: 0 }),
                deleteMany: jest.fn(),
            },
            roleTemplatePermission: {
                findMany: jest.fn().mockResolvedValue([
                    { templateId: 't-1', resourceId: 'id:mm.procurement', ...flags(true, false, false, false) },
                ]),
                createMany: jest.fn(),
                deleteMany: jest.fn(),
            },
        }
    }

    it('gives new features their submodule grants once, then clears grants on the submodule', async () => {
        const prisma = seedPrisma(RESOURCE_CATALOG.filter((r) => !r.parent).map((r) => r.code))
        await new PermissionsService(prisma as unknown as PrismaService, settingsStub()).seed()

        expect(prisma.permissionResource.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { code: 'mm.procurement.rfqs' },
                create: expect.objectContaining({ parentId: 'id:mm.procurement' }),
            }),
        )
        const copied = (prisma.rolePermission.createMany.mock.calls[0][0] as { data: unknown[] }).data
        expect(copied).toHaveLength(MM_FEATURES.procurement.length)
        expect(copied).toContainEqual({ roleId: 'r-wh', resourceId: 'id:mm.procurement.rfqs', ...flags(true, true, false, false) })
        expect(prisma.roleTemplatePermission.createMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.arrayContaining([
                    { templateId: 't-1', resourceId: 'id:mm.procurement.purchase-orders', ...flags(true, false, false, false) },
                ]),
            }),
        )
        const cleared = { where: { resourceId: { in: expect.arrayContaining(['id:mm.procurement']) } } }
        expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith(cleared)
        expect(prisma.roleTemplatePermission.deleteMany).toHaveBeenCalledWith(cleared)
    })

    it('does not copy again for features that already exist', async () => {
        const prisma = seedPrisma(RESOURCE_CATALOG.map((r) => r.code))
        await new PermissionsService(prisma as unknown as PrismaService, settingsStub()).seed()
        expect(prisma.rolePermission.findMany).not.toHaveBeenCalled()
        expect(prisma.roleTemplatePermission.createMany).not.toHaveBeenCalled()
    })
})

describe('PermissionsService role lifecycle', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let service: PermissionsService

    beforeEach(() => {
        prisma = mockPrisma()
        service = new PermissionsService(prisma as unknown as PrismaService, settingsStub())
    })

    it('creates a blank custom role with no grants', async () => {
        await service.createRole({ code: 'sales_rep', name: 'Sales Rep' })
        expect(prisma.role.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: { code: 'sales_rep', name: 'Sales Rep', description: '', isSystem: false } }),
        )
        expect(prisma.rolePermission.createMany).not.toHaveBeenCalled()
    })

    it('clones by copying the source grants onto the new role', async () => {
        await service.createRole({ code: 'emp_copy', name: 'Employee Copy', copyFrom: USER_ROLES.EMPLOYEE })
        const { data } = prisma.rolePermission.createMany.mock.calls[0][0] as {
            data: { roleId: string; resourceId: string }[]
        }
        expect(data.every((row) => row.roleId === 'r-new')).toBe(true)
        expect(data.map((row) => row.resourceId).sort()).toEqual(
            ['res-bill', 'res-je', 'res-leads', 'res-old', 'res-so', 'res-trips'].sort(),
        )
    })

    it('rejects duplicate codes and names, cloning super_admin, and unknown sources', async () => {
        await expect(service.createRole({ code: 'employee', name: 'X' })).rejects.toThrow(ConflictException)
        await expect(service.createRole({ code: 'x_role', name: 'warehouse operator' })).rejects.toThrow(
            ConflictException,
        )
        await expect(
            service.createRole({ code: 'x_role', name: 'X', copyFrom: USER_ROLES.SUPER_ADMIN }),
        ).rejects.toThrow(BadRequestException)
        await expect(service.createRole({ code: 'x_role', name: 'X', copyFrom: 'ghost' })).rejects.toThrow(
            NotFoundException,
        )
        expect(prisma.role.create).not.toHaveBeenCalled()
    })

    it('edits name and description but never super_admin', async () => {
        await service.updateRole('warehouse_operator', { name: 'Warehouse Op', description: 'Floor' })
        expect(prisma.role.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'r-wh' }, data: { name: 'Warehouse Op', description: 'Floor' } }),
        )
        await expect(service.updateRole(USER_ROLES.SUPER_ADMIN, { name: 'Root' })).rejects.toThrow(
            BadRequestException,
        )
        await expect(service.updateRole('warehouse_operator', { name: 'Employee' })).rejects.toThrow(
            ConflictException,
        )
    })

    it('creates a role from a template by copying its grants', async () => {
        await service.createRole({ code: 'wh_op2', name: 'Warehouse Op 2', copyFromTemplate: 'wh_template' })
        expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
            data: [{ resourceId: 'res-so', ...flags(true, true, true, false), roleId: 'r-new' }],
        })
    })

    it('rejects copying from both a role and a template, or from an unknown template', async () => {
        await expect(
            service.createRole({ code: 'x_role', name: 'X', copyFrom: 'employee', copyFromTemplate: 'wh_template' }),
        ).rejects.toThrow(BadRequestException)
        await expect(service.createRole({ code: 'x_role', name: 'X', copyFromTemplate: 'ghost' })).rejects.toThrow(
            NotFoundException,
        )
        expect(prisma.role.create).not.toHaveBeenCalled()
    })

    it('deletes only unassigned custom roles that are not the sign-up default', async () => {
        await expect(service.deleteRole(USER_ROLES.EMPLOYEE)).rejects.toThrow(BadRequestException)

        prisma.user.count.mockResolvedValueOnce(2)
        await expect(service.deleteRole('warehouse_operator')).rejects.toThrow(ConflictException)

        const defaulted = new PermissionsService(
            prisma as unknown as PrismaService,
            settingsStub({ [SETTING_KEYS.DEFAULT_USER_ROLE]: 'warehouse_operator' }),
        )
        await expect(defaulted.deleteRole('warehouse_operator')).rejects.toThrow(ConflictException)
        expect(prisma.role.delete).not.toHaveBeenCalled()

        await service.deleteRole('warehouse_operator')
        expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r-wh' } })
    })
})

describe('RoleTemplatesService', () => {
    let prisma: ReturnType<typeof mockPrisma>
    let templates: RoleTemplatesService

    beforeEach(() => {
        prisma = mockPrisma()
        const permissions = new PermissionsService(prisma as unknown as PrismaService, settingsStub())
        templates = new RoleTemplatesService(prisma as unknown as PrismaService, permissions)
    })

    it('saves a role as a template by snapshotting its grants', async () => {
        await templates.create({ code: 'emp_template', name: 'Employee Template', fromRole: USER_ROLES.EMPLOYEE })
        const { data } = prisma.roleTemplatePermission.createMany.mock.calls[0][0] as {
            data: { templateId: string; resourceId: string }[]
        }
        expect(data.every((row) => row.templateId === 't-new')).toBe(true)
        expect(data.find((row) => row.resourceId === 'res-so')).toMatchObject(flags(true, true, false, false))
        expect(prisma.rolePermission.upsert).not.toHaveBeenCalled()
    })

    it('rejects duplicate codes and names, super_admin snapshots and two sources', async () => {
        await expect(templates.create({ code: 'wh_template', name: 'Other' })).rejects.toThrow(ConflictException)
        await expect(templates.create({ code: 'new_t', name: 'warehouse template' })).rejects.toThrow(ConflictException)
        await expect(
            templates.create({ code: 'new_t', name: 'New', fromRole: USER_ROLES.SUPER_ADMIN }),
        ).rejects.toThrow(BadRequestException)
        await expect(
            templates.create({ code: 'new_t', name: 'New', fromRole: 'employee', fromTemplate: 'wh_template' }),
        ).rejects.toThrow(BadRequestException)
        expect(prisma.roleTemplate.create).not.toHaveBeenCalled()
    })

    it('edits template permissions without touching any role', async () => {
        await templates.updatePermissions('wh_template', [
            { resourceCode: 'sd.billing', ...flags(false, true, false, false) },
        ])
        expect(prisma.roleTemplatePermission.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { templateId_resourceId: { templateId: 't-wh', resourceId: 'res-bill' } },
                update: flags(true, true, false, false),
            }),
        )
        expect(prisma.rolePermission.upsert).not.toHaveBeenCalled()
    })

    it('returns the grouped matrix and deletes templates', async () => {
        const view = await templates.get('wh_template')
        const so = view.groups.find((g) => g.code === 'sd')!.resources.find((r) => r.code === 'sd.sales-orders')!
        expect(so).toMatchObject(flags(true, true, true, false))
        await templates.remove('wh_template')
        expect(prisma.roleTemplate.delete).toHaveBeenCalledWith({ where: { id: 't-wh' } })
        await expect(templates.get('ghost')).rejects.toThrow(NotFoundException)
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

    function guard(required: { resource: string; action: string } | undefined) {
        const service = new PermissionsService(mockPrisma() as unknown as PrismaService, settingsStub())
        const reflector = new Reflector()
        jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
            key === PERMISSION_KEY ? required : undefined,
        )
        return new PermissionGuard(reflector, service)
    }

    it('allows when no permission is required', async () => {
        await expect(guard(undefined).canActivate(ctx())).resolves.toBe(true)
    })

    it('allows a granted resource action', async () => {
        await expect(
            guard({ resource: 'sd.sales-orders', action: 'create' }).canActivate(ctx({ role: 'employee' })),
        ).resolves.toBe(true)
    })

    it('forbids a missing resource action', async () => {
        await expect(
            guard({ resource: 'sd.sales-orders', action: 'delete' }).canActivate(ctx({ role: 'employee' })),
        ).rejects.toThrow(ForbiddenException)
    })
})
