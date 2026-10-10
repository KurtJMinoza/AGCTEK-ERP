import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SYSTEM_ROLE_CATALOG, USER_ROLES } from '../auth/auth.constants'
import {
    ACTION_FIELD,
    DEFAULT_ROLE_PERMISSIONS,
    FULL_ACCESS,
    MODULE_CATALOG,
    NO_ACCESS,
    RESOURCE_CATALOG,
    RESOURCES_BY_CODE,
    SUPER_ADMIN_ONLY_MODULES,
    mergeFlags,
    moduleOfResource,
    normalizeFlags,
    type CrudFlags,
    type ModuleCode,
    type PermissionAction,
} from './permissions.constants'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { FEATURE_MODULE_FLAGS, SETTING_KEYS } from '../system-settings/system-settings.catalog'

export type PermissionSubject = string | { role: string } | { userId: string }

const MODULES_BY_CODE = new Map(MODULE_CATALOG.map((m) => [m.code as string, m]))

/** Effective grants keyed by resource code, plus each group's union (group visible if any resource is). */
export type EffectivePermissions = {
    resources: Record<string, CrudFlags>
    modules: Record<string, CrudFlags>
}

export type RolePermissionInput = { resourceCode: string } & CrudFlags

export type CreateRoleInput = {
    code: string
    name: string
    description?: string
    copyFrom?: string
    copyFromTemplate?: string
}
export type UpdateRoleInput = { name?: string; description?: string }

const ROLE_SUMMARY_SELECT = {
    id: true,
    code: true,
    name: true,
    description: true,
    isSystem: true,
    isActive: true,
    _count: { select: { users: true } },
} as const

const CACHE_TTL_MS = 30_000
const EMPTY: EffectivePermissions = { resources: {}, modules: {} }

@Injectable()
export class PermissionsService {
    private readonly logger = new Logger(PermissionsService.name)
    private readonly roleCache = new Map<string, { at: number; value: EffectivePermissions }>()

    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SystemSettingsService,
    ) {}

    /**
     * Idempotent: upserts system roles, groups and resources (metadata only) and inserts default grants
     * for system roles only where no grant row exists yet. Stored grants are never overwritten.
     */
    async seed() {
        for (const r of SYSTEM_ROLE_CATALOG) {
            await this.prisma.role.upsert({
                where: { code: r.code },
                create: { ...r, isSystem: true },
                update: { isSystem: true },
            })
        }

        for (const m of MODULE_CATALOG) {
            await this.prisma.module.upsert({
                where: { code: m.code },
                create: m,
                update: { name: m.name, description: m.description, sortOrder: m.sortOrder },
            })
        }
        const modules = await this.prisma.module.findMany({ select: { id: true, code: true } })
        const moduleIdByCode = new Map(modules.map((m) => [m.code, m.id]))
        const existing = new Set(
            (await this.prisma.permissionResource.findMany({ select: { code: true } })).map((r) => r.code),
        )

        // Parents precede their features in RESOURCE_CATALOG, so parent ids are known when features are saved.
        const idByCode = new Map<string, string>()
        for (const r of RESOURCE_CATALOG) {
            const moduleId = moduleIdByCode.get(r.module)!
            const parentId = r.parent ? idByCode.get(r.parent)! : null
            const data = { moduleId, parentId, name: r.name, description: r.description, sortOrder: r.sortOrder }
            const saved = await this.prisma.permissionResource.upsert({
                where: { code: r.code },
                create: { code: r.code, ...data },
                update: data,
                select: { id: true },
            })
            idByCode.set(r.code, saved.id)
        }

        const features = RESOURCE_CATALOG.filter((r) => r.parent)
        await this.inheritParentGrants(
            features
                .filter((r) => !existing.has(r.code))
                .map((r) => ({ id: idByCode.get(r.code)!, parentId: idByCode.get(r.parent!)! })),
        )
        const parentIds = [...new Set(features.map((r) => idByCode.get(r.parent!)!))]
        await this.prisma.rolePermission.deleteMany({ where: { resourceId: { in: parentIds } } })
        await this.prisma.roleTemplatePermission.deleteMany({ where: { resourceId: { in: parentIds } } })

        const [roles, resources] = await Promise.all([
            this.prisma.role.findMany({ where: { code: { in: Object.keys(DEFAULT_ROLE_PERMISSIONS) } }, select: { id: true, code: true } }),
            this.prisma.permissionResource.findMany({ where: { children: { none: {} } }, select: { id: true, code: true } }),
        ])
        const rows = roles.flatMap((role) =>
            resources.flatMap((res) => {
                const flags = DEFAULT_ROLE_PERMISSIONS[role.code]?.[moduleOfResource(res.code) as ModuleCode]
                return flags ? [{ roleId: role.id, resourceId: res.id, ...flags }] : []
            }),
        )
        const { count } = await this.prisma.rolePermission.createMany({ data: rows, skipDuplicates: true })
        if (count) this.logger.log(`Seeded ${count} default role permissions`)
        this.roleCache.clear()
    }

    /**
     * New features start with their submodule's grants (roles and templates), so splitting a submodule
     * into features changes nobody's access. Runs once per feature, when the feature is first created.
     */
    private async inheritParentGrants(features: { id: string; parentId: string }[]) {
        if (!features.length) return
        const parentIds = [...new Set(features.map((f) => f.parentId))]
        const flagSelect = { canRead: true, canCreate: true, canUpdate: true, canDelete: true } as const
        const [roleRows, templateRows] = await Promise.all([
            this.prisma.rolePermission.findMany({
                where: { resourceId: { in: parentIds } },
                select: { roleId: true, resourceId: true, ...flagSelect },
            }),
            this.prisma.roleTemplatePermission.findMany({
                where: { resourceId: { in: parentIds } },
                select: { templateId: true, resourceId: true, ...flagSelect },
            }),
        ])
        const childrenOf = (parentId: string) => features.filter((f) => f.parentId === parentId)

        const roleData = roleRows.flatMap(({ resourceId, roleId, ...flags }) =>
            childrenOf(resourceId).map((f) => ({ roleId, resourceId: f.id, ...pickFlags(flags) })),
        )
        const templateData = templateRows.flatMap(({ resourceId, templateId, ...flags }) =>
            childrenOf(resourceId).map((f) => ({ templateId, resourceId: f.id, ...pickFlags(flags) })),
        )
        if (roleData.length) await this.prisma.rolePermission.createMany({ data: roleData, skipDuplicates: true })
        if (templateData.length) {
            await this.prisma.roleTemplatePermission.createMany({ data: templateData, skipDuplicates: true })
        }
        if (roleData.length || templateData.length) {
            this.logger.log(`Copied submodule grants to ${features.length} new features`)
        }
    }

    listRoles() {
        return this.prisma.role.findMany({
            select: ROLE_SUMMARY_SELECT,
            orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
        })
    }

    /**
     * Creates a custom role, optionally copying a role's or a template's grants once.
     * No link to the source is kept, so later changes to either side never propagate.
     */
    async createRole(input: CreateRoleInput) {
        if (input.copyFrom && input.copyFromTemplate) {
            throw new BadRequestException('Copy from either a role or a template, not both.')
        }
        if (await this.prisma.role.findUnique({ where: { code: input.code }, select: { id: true } })) {
            throw new ConflictException(`A role with code "${input.code}" already exists.`)
        }
        await this.assertNameAvailable(input.name)

        const grants = await this.sourceGrants({ role: input.copyFrom, template: input.copyFromTemplate })

        const role = await this.prisma.$transaction(async (tx) => {
            const created = await tx.role.create({
                data: {
                    code: input.code,
                    name: input.name,
                    description: input.description ?? '',
                    isSystem: false,
                },
                select: { id: true, code: true },
            })
            if (grants.length) {
                await tx.rolePermission.createMany({
                    data: grants.map((g) => ({ ...g, roleId: created.id })),
                })
            }
            return created
        })

        return this.prisma.role.findUniqueOrThrow({ where: { id: role.id }, select: ROLE_SUMMARY_SELECT })
    }

    /** Snapshot of a role's or template's stored grants, for copying. Super Admin has no stored grants to copy. */
    async sourceGrants(source: { role?: string; template?: string }): Promise<({ resourceId: string } & CrudFlags)[]> {
        const select = { resourceId: true, canRead: true, canCreate: true, canUpdate: true, canDelete: true } as const
        if (source.role) {
            if (source.role === USER_ROLES.SUPER_ADMIN) {
                throw new BadRequestException('Super Admin access is not stored as permissions and cannot be copied.')
            }
            const role = await this.findRole(source.role)
            return this.prisma.rolePermission.findMany({ where: { roleId: role.id }, select })
        }
        if (source.template) {
            const template = await this.prisma.roleTemplate.findUnique({
                where: { code: source.template },
                select: { id: true },
            })
            if (!template) throw new NotFoundException(`Template "${source.template}" not found.`)
            return this.prisma.roleTemplatePermission.findMany({ where: { templateId: template.id }, select })
        }
        return []
    }

    /**
     * Every grantable resource grouped by module, with flags from `byResource` (or full access).
     * Submodules with features list them as `children`; their own flags are the union of the features.
     */
    async buildMatrix(byResource: Map<string, CrudFlags>, full = false) {
        const modules = await this.prisma.module.findMany({
            where: { code: { notIn: [...SUPER_ADMIN_ONLY_MODULES] } },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            include: { resources: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] } },
        })
        type Resource = (typeof modules)[number]['resources'][number]
        const row = (r: Resource) => ({
            code: r.code,
            name: r.name,
            description: r.description,
            isActive: r.isActive,
            ...(full ? FULL_ACCESS : (byResource.get(r.id) ?? NO_ACCESS)),
        })
        return modules.map((m) => ({
            code: m.code,
            name: m.name,
            isActive: m.isActive,
            resources: m.resources
                .filter((r) => !r.parentId)
                .map((r) => {
                    const children = m.resources.filter((c) => c.parentId === r.id).map(row)
                    if (!children.length) return row(r)
                    return { ...row(r), ...mergeFlags(...children.map(pickFlags)), children }
                }),
        }))
    }

    /** Validates resource codes (known, no duplicates) and normalizes flags (any write implies read). */
    async resolveEntries(entries: RolePermissionInput[]) {
        const codes = entries.map((e) => e.resourceCode)
        if (new Set(codes).size !== codes.length) {
            throw new BadRequestException('Each resource may appear only once.')
        }
        const resources = await this.prisma.permissionResource.findMany({
            where: { code: { in: codes } },
            select: { id: true, code: true, _count: { select: { children: true } } },
        })
        const idByCode = new Map(resources.map((r) => [r.code, r.id]))
        const unknown = codes.filter((c) => !idByCode.has(c))
        if (unknown.length) {
            throw new BadRequestException(`Unknown resource code(s): ${unknown.join(', ')}`)
        }
        const parents = resources.filter((r) => r._count.children > 0).map((r) => r.code)
        if (parents.length) {
            throw new BadRequestException(
                `These submodules are granted through their features, not directly: ${parents.join(', ')}`,
            )
        }
        return entries.map((e) => ({ resourceId: idByCode.get(e.resourceCode)!, flags: normalizeFlags(pickFlags(e)) }))
    }

    /** Name and description only; codes are immutable and Super Admin is fully protected. */
    async updateRole(code: string, input: UpdateRoleInput) {
        const role = await this.findRole(code)
        if (role.code === USER_ROLES.SUPER_ADMIN) {
            throw new BadRequestException('Super Admin is a protected role and cannot be edited.')
        }
        if (input.name !== undefined && input.name.toLowerCase() !== role.name.toLowerCase()) {
            await this.assertNameAvailable(input.name, role.id)
        }
        return this.prisma.role.update({
            where: { id: role.id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
            },
            select: ROLE_SUMMARY_SELECT,
        })
    }

    /** Only custom roles with no users can be deleted; their grants are removed with them. */
    async deleteRole(code: string) {
        const role = await this.findRole(code)
        if (role.isSystem) {
            throw new BadRequestException('System roles cannot be deleted.')
        }
        const users = await this.prisma.user.count({ where: { role: role.code } })
        if (users > 0) {
            throw new ConflictException(
                `"${role.name}" is assigned to ${users} user${users === 1 ? '' : 's'}. Move them to another role before deleting it.`,
            )
        }
        if ((await this.settings.getString(SETTING_KEYS.DEFAULT_USER_ROLE)) === role.code) {
            throw new ConflictException(
                `"${role.name}" is the default role for new users. Change that system setting before deleting it.`,
            )
        }
        await this.prisma.role.delete({ where: { id: role.id } })
        this.roleCache.delete(role.code)
        return { code: role.code, deleted: true }
    }

    private async assertNameAvailable(name: string, excludeId?: string) {
        const clash = await this.prisma.role.findFirst({
            where: {
                name: { equals: name, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { id: true },
        })
        if (clash) throw new ConflictException(`A role named "${name}" already exists.`)
    }

    /** Grantable catalog: groups (excluding super-admin-only) with their resources. */
    async getCatalog() {
        const modules = await this.prisma.module.findMany({
            where: { code: { notIn: [...SUPER_ADMIN_ONLY_MODULES] } },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            select: {
                code: true,
                name: true,
                description: true,
                isActive: true,
                resources: {
                    where: { parentId: null },
                    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
                    select: {
                        code: true,
                        name: true,
                        description: true,
                        isActive: true,
                        children: {
                            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
                            select: { code: true, name: true, description: true, isActive: true },
                        },
                    },
                },
            },
        })
        return modules
    }

    /** Grouped matrix for one role: every resource with its stored flags. */
    async getRolePermissions(code: string) {
        const role = await this.findRole(code)
        const isSuper = role.code === USER_ROLES.SUPER_ADMIN
        const stored = await this.prisma.rolePermission.findMany({
            where: { roleId: role.id },
            select: { resourceId: true, canRead: true, canCreate: true, canUpdate: true, canDelete: true },
        })
        const byResource = new Map(stored.map((s) => [s.resourceId, pickFlags(s)]))

        const [groups, userCount] = await Promise.all([
            this.buildMatrix(byResource, isSuper),
            this.prisma.user.count({ where: { role: role.code } }),
        ])

        return {
            role: {
                code: role.code,
                name: role.name,
                description: role.description,
                isSystem: role.isSystem,
                isActive: role.isActive,
                userCount,
            },
            editable: !isSuper,
            groups,
        }
    }

    async updateRolePermissions(code: string, entries: RolePermissionInput[]) {
        const role = await this.findRole(code)
        if (role.code === USER_ROLES.SUPER_ADMIN) {
            throw new BadRequestException('Super Admin always has full access and cannot be edited.')
        }

        const resolved = await this.resolveEntries(entries)
        await this.prisma.$transaction(
            resolved.map(({ resourceId, flags }) => {
                return this.prisma.rolePermission.upsert({
                    where: { roleId_resourceId: { roleId: role.id, resourceId } },
                    create: { roleId: role.id, resourceId, ...flags },
                    update: flags,
                })
            }),
        )

        this.roleCache.delete(role.code)
        return this.getRolePermissions(role.code)
    }

    /**
     * Effective permissions for a role code. Unknown/inactive roles, inactive groups and inactive resources
     * grant nothing; groups switched off by a feature toggle grant nothing to anyone (super_admin included).
     */
    async resolveForRole(code: string): Promise<EffectivePermissions> {
        const stored = await this.resolveStoredForRole(code)
        const disabled = await this.disabledFeatureModules()
        if (!disabled.length) return stored

        const resources = { ...stored.resources }
        for (const resourceCode of Object.keys(resources)) {
            if (disabled.includes(moduleOfResource(resourceCode))) resources[resourceCode] = NO_ACCESS
        }
        const modules = { ...stored.modules }
        for (const moduleCode of disabled) {
            if (moduleCode in modules) modules[moduleCode] = NO_ACCESS
        }
        return { resources, modules }
    }

    private async disabledFeatureModules() {
        const entries = await Promise.all(
            Object.entries(FEATURE_MODULE_FLAGS).map(
                async ([code, key]) => [code, await this.settings.getBoolean(key)] as const,
            ),
        )
        return entries.filter(([, enabled]) => !enabled).map(([code]) => code)
    }

    private async resolveStoredForRole(code: string): Promise<EffectivePermissions> {
        const cached = this.roleCache.get(code)
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

        const role = await this.prisma.role.findUnique({ where: { code }, select: { id: true, isActive: true } })
        if (!role || !role.isActive) {
            this.roleCache.set(code, { at: Date.now(), value: EMPTY })
            return EMPTY
        }
        const isSuper = code === USER_ROLES.SUPER_ADMIN

        const modules = await this.prisma.module.findMany({
            select: {
                code: true,
                isActive: true,
                resources: {
                    select: {
                        id: true,
                        parentId: true,
                        code: true,
                        isActive: true,
                        permissions: {
                            where: { roleId: role.id },
                            select: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
                        },
                    },
                },
            },
        })

        const value: EffectivePermissions = { resources: {}, modules: {} }
        for (const m of modules) {
            if (isSuper) {
                value.modules[m.code] = FULL_ACCESS
                for (const r of m.resources) value.resources[r.code] = FULL_ACCESS
                continue
            }
            const grantable = m.isActive && !SUPER_ADMIN_ONLY_MODULES.has(m.code)
            const byId = new Map(m.resources.map((r) => [r.id, r]))
            const parentIds = new Set(m.resources.map((r) => r.parentId).filter((id): id is string => Boolean(id)))
            const leafFlags = new Map<string, CrudFlags>()
            for (const r of m.resources) {
                if (parentIds.has(r.id)) continue
                const parent = r.parentId ? byId.get(r.parentId) : undefined
                const active = r.isActive && (parent?.isActive ?? true)
                const stored = r.permissions[0]
                const f = grantable && active && stored ? normalizeFlags(pickFlags(stored)) : NO_ACCESS
                value.resources[r.code] = f
                leafFlags.set(r.id, f)
            }
            // A submodule with features is allowed an action when any of its features is.
            for (const parentId of parentIds) {
                const children = m.resources.filter((r) => r.parentId === parentId)
                value.resources[byId.get(parentId)!.code] = mergeFlags(
                    ...children.map((c) => leafFlags.get(c.id) ?? NO_ACCESS),
                )
            }
            value.modules[m.code] = mergeFlags(...leafFlags.values())
        }

        this.roleCache.set(code, { at: Date.now(), value })
        return value
    }

    /** Resolves a user's effective permissions. Deactivated or unknown users get nothing. */
    async resolveForUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, isActive: true },
        })
        if (!user || !user.isActive) {
            return { role: null, permissions: EMPTY }
        }
        return { role: user.role, permissions: await this.resolveForRole(user.role) }
    }

    /** `code` is a resource (`crm.leads`) or a group (`crm`, allowed if any of its resources allows it). */
    async checkPermission(subject: PermissionSubject, code: string, action: PermissionAction): Promise<boolean> {
        const permissions =
            typeof subject === 'object' && 'userId' in subject
                ? (await this.resolveForUser(subject.userId)).permissions
                : await this.resolveForRole(typeof subject === 'string' ? subject : subject.role)

        const flags = code.includes('.') ? permissions.resources[code] : permissions.modules[code]
        return Boolean(flags?.[ACTION_FIELD[action]])
    }

    /** Passes when any of `codes` allows the action (endpoints shared by several features). */
    async assertPermission(subject: PermissionSubject, codes: string | readonly string[], action: PermissionAction) {
        const list = typeof codes === 'string' ? [codes] : codes
        for (const code of list) {
            if (await this.checkPermission(subject, code, action)) return
        }
        const names = list.map((c) => `${RESOURCES_BY_CODE.get(c)?.name ?? MODULES_BY_CODE.get(c)?.name ?? c} (${c})`)
        throw new ForbiddenException(`You do not have ${action} permission for ${names.join(' or ')}.`)
    }

    private async findRole(code: string) {
        const role = await this.prisma.role.findUnique({ where: { code } })
        if (!role) throw new NotFoundException(`Role "${code}" not found.`)
        return role
    }
}

function pickFlags(source: CrudFlags): CrudFlags {
    return {
        canRead: Boolean(source.canRead),
        canCreate: Boolean(source.canCreate),
        canUpdate: Boolean(source.canUpdate),
        canDelete: Boolean(source.canDelete),
    }
}
