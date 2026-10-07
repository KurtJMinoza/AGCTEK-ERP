import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
    SETTINGS_BY_KEY,
    SETTINGS_CATALOG,
    SETTING_KEYS,
    parseStoredValue,
    serializeValue,
    validateValue,
    type SettingKey,
    type SettingValue,
} from './system-settings.catalog'

export type SettingUpdate = { key: string; value: unknown }

type RoleOption = { code: string; name: string }

const CACHE_TTL_MS = 15_000

const SETTING_SELECT = {
    key: true,
    value: true,
    updatedAt: true,
    updatedBy: { select: { id: true, userName: true } },
} as const

@Injectable()
export class SystemSettingsService {
    private readonly logger = new Logger(SystemSettingsService.name)
    private cache: { at: number; values: Map<string, string> } | null = null

    constructor(private readonly prisma: PrismaService) {}

    /** Idempotent: inserts missing keys with defaults and refreshes metadata; stored values are never overwritten. */
    async seed() {
        let created = 0
        for (const def of SETTINGS_CATALOG) {
            const meta = {
                valueType: def.valueType,
                label: def.label,
                description: def.description,
                group: def.group,
                sortOrder: def.sortOrder,
            }
            const existing = await this.prisma.systemSetting.findUnique({
                where: { key: def.key },
                select: { valueType: true, label: true, description: true, group: true, sortOrder: true },
            })
            if (existing) {
                const stale = (Object.keys(meta) as (keyof typeof meta)[]).some(
                    (k) => existing[k] !== meta[k],
                )
                if (stale) {
                    await this.prisma.systemSetting.update({ where: { key: def.key }, data: meta })
                }
            } else {
                await this.prisma.systemSetting.create({
                    data: { key: def.key, value: serializeValue(def.defaultValue), ...meta },
                })
                created++
            }
        }
        if (created) this.logger.log(`Seeded ${created} default system settings`)
        this.cache = null
    }

    /** Full list for Super Admin Settings, ordered by group then sortOrder. Unknown stored keys are ignored. */
    async list() {
        const [rows, roles] = await Promise.all([
            this.prisma.systemSetting.findMany({ select: SETTING_SELECT }),
            this.assignableRoles(),
        ])
        const byKey = new Map(rows.map((r) => [r.key, r]))
        return SETTINGS_CATALOG.map((def) => this.toDto(def.key, byKey.get(def.key), roles))
    }

    async get(key: string) {
        if (!SETTINGS_BY_KEY.has(key)) {
            throw new NotFoundException(`Unknown setting "${key}".`)
        }
        const [row, roles] = await Promise.all([
            this.prisma.systemSetting.findUnique({ where: { key }, select: SETTING_SELECT }),
            this.assignableRoles(),
        ])
        return this.toDto(key, row ?? undefined, roles)
    }

    /** Settings safe to expose without authentication (flags the sign-in/sign-up and layout need). */
    async getPublic(): Promise<Record<string, SettingValue>> {
        const values = await this.loadValues()
        return Object.fromEntries(
            SETTINGS_CATALOG.filter((d) => d.public).map((d) => [
                d.key,
                parseStoredValue(d, values.get(d.key)),
            ]),
        )
    }

    /** Validates every entry first, then writes all of them in one transaction. */
    async update(entries: SettingUpdate[], actorId: string) {
        if (!entries.length) {
            throw new BadRequestException('Provide at least one setting to update.')
        }
        const keys = entries.map((e) => e.key)
        if (new Set(keys).size !== keys.length) {
            throw new BadRequestException('Each setting may appear only once.')
        }

        const errors: string[] = []
        let roles: RoleOption[] | null = null
        for (const e of entries) {
            const def = SETTINGS_BY_KEY.get(e.key)
            if (!def) {
                errors.push(`Unknown setting "${e.key}".`)
                continue
            }
            const error = validateValue(def, e.value)
            if (error) {
                errors.push(error)
                continue
            }
            if (def.optionSource === 'assignable_roles') {
                roles ??= await this.assignableRoles()
                const allowed = roles.filter((r) => !def.excludedValues?.includes(r.code))
                if (!allowed.some((r) => r.code === e.value)) {
                    errors.push(`"${def.key}" must be an active role: ${allowed.map((r) => r.code).join(', ')}.`)
                }
            }
        }
        if (errors.length) throw new BadRequestException(errors)

        await this.prisma.$transaction(
            entries.map((e) => {
                const def = SETTINGS_BY_KEY.get(e.key)!
                const value = serializeValue(e.value as SettingValue)
                return this.prisma.systemSetting.upsert({
                    where: { key: e.key },
                    create: {
                        key: def.key,
                        value,
                        valueType: def.valueType,
                        label: def.label,
                        description: def.description,
                        group: def.group,
                        sortOrder: def.sortOrder,
                        updatedById: actorId,
                    },
                    update: { value, updatedById: actorId },
                })
            }),
        )

        this.cache = null
        return this.list()
    }

    async getValue(key: SettingKey): Promise<SettingValue> {
        const def = SETTINGS_BY_KEY.get(key)!
        return parseStoredValue(def, (await this.loadValues()).get(key))
    }

    async getBoolean(key: SettingKey): Promise<boolean> {
        return (await this.getValue(key)) === true
    }

    /** Single authority for maintenance state; read live (15s cache, cleared on update). */
    isMaintenanceModeEnabled(): Promise<boolean> {
        return this.getBoolean(SETTING_KEYS.MAINTENANCE_MODE)
    }

    async getString(key: SettingKey): Promise<string> {
        return String(await this.getValue(key))
    }

    private async loadValues() {
        if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.values
        const rows = await this.prisma.systemSetting.findMany({ select: { key: true, value: true } })
        const values = new Map(rows.map((r) => [r.key, r.value]))
        this.cache = { at: Date.now(), values }
        return values
    }

    private assignableRoles(): Promise<RoleOption[]> {
        return this.prisma.role.findMany({
            where: { isActive: true },
            select: { code: true, name: true },
            orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
        })
    }

    private toDto(
        key: string,
        row:
            | { value: string; updatedAt: Date; updatedBy: { id: string; userName: string } | null }
            | undefined,
        roles: RoleOption[],
    ) {
        const def = SETTINGS_BY_KEY.get(key)!
        const dynamic =
            def.optionSource === 'assignable_roles'
                ? roles.filter((r) => !def.excludedValues?.includes(r.code))
                : null
        return {
            key: def.key,
            value: parseStoredValue(def, row?.value),
            defaultValue: def.defaultValue,
            valueType: def.valueType,
            label: def.label,
            description: def.description,
            group: def.group,
            sortOrder: def.sortOrder,
            options: dynamic ? dynamic.map((r) => r.code) : (def.options ?? null),
            optionLabels: dynamic ? Object.fromEntries(dynamic.map((r) => [r.code, r.name])) : null,
            updatedAt: row?.updatedAt ?? null,
            updatedBy: row?.updatedBy ?? null,
        }
    }
}
