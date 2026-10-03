import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { isUserRole, USER_ROLES, type UserRole } from '../auth/auth.constants'
import {
    ACTION_FIELD,
    DEFAULT_ROLE_PERMISSIONS,
    FULL_ACCESS,
    MODULE_CATALOG,
    NO_ACCESS,
    SUPER_ADMIN_ONLY_MODULES,
    mergeFlags,
    normalizeFlags,
    type CrudFlags,
    type PermissionAction,
} from './permissions.constants'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { FEATURE_MODULE_FLAGS } from '../system-settings/system-settings.catalog'

export type PermissionSubject = UserRole | { role: string } | { userId: string }

export type EffectivePermissions = Record<string, CrudFlags>

export type RolePermissionInput = { moduleCode: string } & CrudFlags

const CACHE_TTL_MS = 30_000

@Injectable()
export class PermissionsService {
    private readonly logger = new Logger(PermissionsService.name)
    private readonly roleCache = new Map<string, { at: number; value: EffectivePermissions }>()

    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SystemSettingsService,
    ) {}

    /** Idempotent: upserts the module catalog and inserts missing default grants without overwriting edits. */
    async seed() {
        for (const m of MODULE_CATALOG) {
            await this.prisma.module.upsert({
                where: { code: m.code },
                create: m,
                update: { name: m.name, description: m.description, sortOrder: m.sortOrder },
            })
        }

        const modules = await this.prisma.module.findMany({ select: { id: true, code: true } })
        const idByCode = new Map(modules.map((m) => [m.code, m.id]))

        const rows = Object.entries(DEFAULT_ROLE_PERMISSIONS).flatMap(([role, grants]) =>
            Object.entries(grants)
                .filter(([code]) => idByCode.has(code))
                .map(([code, flags]) => ({ role, moduleId: idByCode.get(code)!, ...flags })),
        )

        const { count } = await this.prisma.rolePermission.createMany({
            data: rows,
            skipDuplicates: true,
        })
        if (count) this.logger.log(`Seeded ${count} default role permissions`)
        this.roleCache.clear()
    }

    listModules() {
        return this.prisma.module.findMany({
            select: { id: true, code: true, name: true, description: true, isActive: true, sortOrder: true },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        })
    }

    /** Matrix for one role: every module with its stored (or implied) CRUD flags. */
    async getRolePermissions(role: string) {
        this.assertKnownRole(role)
        const isSuper = role === USER_ROLES.SUPER_ADMIN

        const modules = await this.prisma.module.findMany({
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            include: { permissions: { where: { role } } },
        })

        return {
            role,
            editable: !isSuper,
            permissions: modules.map((m) => {
                const stored = m.permissions[0]
                const flags = isSuper ? FULL_ACCESS : stored ? pickFlags(stored) : NO_ACCESS
                return {
                    moduleCode: m.code,
                    moduleName: m.name,
                    description: m.description,
                    isActive: m.isActive,
                    locked: isSuper || SUPER_ADMIN_ONLY_MODULES.has(m.code),
                    ...flags,
                }
            }),
        }
    }

    async updateRolePermissions(role: string, entries: RolePermissionInput[]) {
        this.assertKnownRole(role)
        if (role === USER_ROLES.SUPER_ADMIN) {
            throw new BadRequestException('Super Admin always has full access and cannot be edited.')
        }

        const codes = entries.map((e) => e.moduleCode)
        if (new Set(codes).size !== codes.length) {
            throw new BadRequestException('Each module may appear only once.')
        }

        const modules = await this.prisma.module.findMany({
            where: { code: { in: codes } },
            select: { id: true, code: true },
        })
        const idByCode = new Map(modules.map((m) => [m.code, m.id]))
        const unknown = codes.filter((c) => !idByCode.has(c))
        if (unknown.length) {
            throw new BadRequestException(`Unknown module code(s): ${unknown.join(', ')}`)
        }

        for (const e of entries) {
            const granted = e.canView || e.canCreate || e.canRead || e.canUpdate || e.canDelete
            if (granted && SUPER_ADMIN_ONLY_MODULES.has(e.moduleCode)) {
                throw new BadRequestException(`Module "${e.moduleCode}" is restricted to Super Admin.`)
            }
        }

        await this.prisma.$transaction(
            entries.map((e) => {
                const flags = normalizeFlags(pickFlags(e))
                const moduleId = idByCode.get(e.moduleCode)!
                return this.prisma.rolePermission.upsert({
                    where: { role_moduleId: { role, moduleId } },
                    create: { role, moduleId, ...flags },
                    update: flags,
                })
            }),
        )

        this.roleCache.delete(role)
        return this.getRolePermissions(role)
    }

    /**
     * Effective permissions keyed by module code. Inactive modules grant nothing except to super_admin;
     * modules switched off by a feature toggle grant nothing to anyone.
     */
    async resolveForRole(role: string): Promise<EffectivePermissions> {
        const stored = await this.resolveStoredForRole(role)
        const disabled = await this.disabledFeatureModules()
        if (!disabled.length) return stored
        const value = { ...stored }
        for (const code of disabled) {
            if (code in value) value[code] = NO_ACCESS
        }
        return value
    }

    private async disabledFeatureModules() {
        const entries = await Promise.all(
            Object.entries(FEATURE_MODULE_FLAGS).map(
                async ([code, key]) => [code, await this.settings.getBoolean(key)] as const,
            ),
        )
        return entries.filter(([, enabled]) => !enabled).map(([code]) => code)
    }

    private async resolveStoredForRole(role: string): Promise<EffectivePermissions> {
        const cached = this.roleCache.get(role)
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

        const modules = await this.prisma.module.findMany({
            select: { code: true, isActive: true, permissions: { where: { role } } },
        })

        const value: EffectivePermissions = {}
        for (const m of modules) {
            if (role === USER_ROLES.SUPER_ADMIN) {
                value[m.code] = FULL_ACCESS
                continue
            }
            const stored = m.permissions[0]
            value[m.code] =
                m.isActive && stored && !SUPER_ADMIN_ONLY_MODULES.has(m.code)
                    ? mergeFlags(normalizeFlags(pickFlags(stored)))
                    : NO_ACCESS
        }

        this.roleCache.set(role, { at: Date.now(), value })
        return value
    }

    /** Resolves a user's effective permissions. Deactivated or unknown users get nothing. */
    async resolveForUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, isActive: true },
        })
        if (!user || !user.isActive) {
            return { role: null, permissions: {} as EffectivePermissions }
        }
        const role = isUserRole(user.role) ? user.role : USER_ROLES.EMPLOYEE
        return { role, permissions: await this.resolveForRole(role) }
    }

    async checkPermission(
        subject: PermissionSubject,
        moduleCode: string,
        action: PermissionAction,
    ): Promise<boolean> {
        const permissions =
            typeof subject === 'object' && 'userId' in subject
                ? (await this.resolveForUser(subject.userId)).permissions
                : await this.resolveForRole(typeof subject === 'string' ? subject : subject.role)

        return Boolean(permissions[moduleCode]?.[ACTION_FIELD[action]])
    }

    async assertPermission(
        subject: PermissionSubject,
        moduleCode: string,
        action: PermissionAction,
    ) {
        if (!(await this.checkPermission(subject, moduleCode, action))) {
            throw new ForbiddenException(`Missing ${action} permission for module "${moduleCode}"`)
        }
    }

    private assertKnownRole(role: string): asserts role is UserRole {
        if (!isUserRole(role)) {
            throw new BadRequestException(`Unknown role "${role}".`)
        }
    }
}

function pickFlags(source: CrudFlags): CrudFlags {
    return {
        canView: Boolean(source.canView),
        canCreate: Boolean(source.canCreate),
        canRead: Boolean(source.canRead),
        canUpdate: Boolean(source.canUpdate),
        canDelete: Boolean(source.canDelete),
    }
}
