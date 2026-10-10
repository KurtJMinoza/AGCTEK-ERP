import { BadRequestException, NotFoundException } from '@nestjs/common'
import { SystemSettingsService } from './system-settings.service'
import {
    SETTINGS_BY_KEY,
    SETTINGS_CATALOG,
    SETTING_KEYS,
    parseStoredValue,
    validateValue,
} from './system-settings.catalog'
import type { PrismaService } from '../prisma/prisma.service'

function mockPrisma(stored: Record<string, string> = {}) {
    const rows = () => Object.entries(stored).map(([key, value]) => ({ key, value, updatedAt: new Date(0), updatedBy: null }))
    return {
        systemSetting: {
            findMany: jest.fn(async () => rows()),
            findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
                rows().find((r) => r.key === where.key) ?? null,
            ),
            create: jest.fn(),
            update: jest.fn(),
            upsert: jest.fn((args: unknown) => args),
        },
        role: {
            findMany: jest.fn(async () => [
                { code: 'super_admin', name: 'Super Administrator' },
                { code: 'admin', name: 'Administrator' },
                { code: 'employee', name: 'Employee' },
                { code: 'warehouse_operator', name: 'Warehouse Operator' },
            ]),
        },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    }
}

const service = (prisma: ReturnType<typeof mockPrisma>) =>
    new SystemSettingsService(prisma as unknown as PrismaService)

describe('system settings catalog', () => {
    it('has unique keys and defaults that pass their own validation', () => {
        expect(SETTINGS_BY_KEY.size).toBe(SETTINGS_CATALOG.length)
        for (const def of SETTINGS_CATALOG) {
            expect(validateValue(def, def.defaultValue)).toBeNull()
        }
    })

    it('validates types and string options', () => {
        const maintenance = SETTINGS_BY_KEY.get(SETTING_KEYS.MAINTENANCE_MODE)!
        const role = SETTINGS_BY_KEY.get(SETTING_KEYS.DEFAULT_USER_ROLE)!
        expect(validateValue(maintenance, 'true')).not.toBeNull()
        expect(validateValue(role, 'super_admin')).not.toBeNull()
        expect(validateValue(role, 'admin')).toBeNull()
    })

    it('falls back to the default for missing or invalid stored values', () => {
        const role = SETTINGS_BY_KEY.get(SETTING_KEYS.DEFAULT_USER_ROLE)!
        expect(parseStoredValue(role, undefined)).toBe('employee')
        expect(parseStoredValue(role, 'super_admin')).toBe('employee')
    })
})

describe('SystemSettingsService', () => {
    it('seeds only missing keys and never overwrites stored values', async () => {
        const prisma = mockPrisma({ [SETTING_KEYS.MAINTENANCE_MODE]: 'true' })
        await service(prisma).seed()
        expect(prisma.systemSetting.create).toHaveBeenCalledTimes(SETTINGS_CATALOG.length - 1)
        expect(prisma.systemSetting.create).not.toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ key: SETTING_KEYS.MAINTENANCE_MODE }) }),
        )
    })

    it('returns typed values with defaults', async () => {
        const s = service(mockPrisma({ [SETTING_KEYS.ALLOW_USER_SIGNUP]: 'false' }))
        expect(await s.getBoolean(SETTING_KEYS.ALLOW_USER_SIGNUP)).toBe(false)
        expect(await s.getBoolean(SETTING_KEYS.FEATURE_CRM_ENABLED)).toBe(true)
        expect(await s.getString(SETTING_KEYS.DEFAULT_USER_ROLE)).toBe('employee')
    })

    it('exposes only public keys', async () => {
        const pub = await service(mockPrisma()).getPublic()
        expect(pub).toHaveProperty(SETTING_KEYS.MAINTENANCE_MODE, false)
        expect(pub).not.toHaveProperty(SETTING_KEYS.REQUIRE_DEFAULT_COMPANY_ON_USER)
    })

    it('rejects unknown keys, bad types and duplicates without writing', async () => {
        const prisma = mockPrisma()
        const s = service(prisma)
        await expect(s.update([{ key: 'nope', value: true }], 'u1')).rejects.toThrow(BadRequestException)
        await expect(
            s.update([{ key: SETTING_KEYS.MAINTENANCE_MODE, value: 'yes' }], 'u1'),
        ).rejects.toThrow(BadRequestException)
        await expect(
            s.update(
                [
                    { key: SETTING_KEYS.MAINTENANCE_MODE, value: true },
                    { key: SETTING_KEYS.MAINTENANCE_MODE, value: false },
                ],
                'u1',
            ),
        ).rejects.toThrow(BadRequestException)
        expect(prisma.systemSetting.upsert).not.toHaveBeenCalled()
    })

    it('stores serialized values with the actor', async () => {
        const prisma = mockPrisma()
        await service(prisma).update([{ key: SETTING_KEYS.MAINTENANCE_MODE, value: true }], 'u1')
        expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: { value: 'true', updatedById: 'u1' } }),
        )
    })

    it('lists active roles (except Super Admin) as default-role options', async () => {
        const rows = await service(mockPrisma()).list()
        const role = rows.find((r) => r.key === SETTING_KEYS.DEFAULT_USER_ROLE)!
        expect(role.options).toEqual(['admin', 'employee', 'warehouse_operator'])
        expect(role.optionLabels).toMatchObject({ warehouse_operator: 'Warehouse Operator' })
    })

    it('accepts an active custom role as default and rejects unknown roles', async () => {
        const prisma = mockPrisma()
        const s = service(prisma)
        await s.update([{ key: SETTING_KEYS.DEFAULT_USER_ROLE, value: 'warehouse_operator' }], 'u1')
        expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1)
        await expect(
            s.update([{ key: SETTING_KEYS.DEFAULT_USER_ROLE, value: 'ghost_role' }], 'u1'),
        ).rejects.toThrow(BadRequestException)
        await expect(
            s.update([{ key: SETTING_KEYS.DEFAULT_USER_ROLE, value: 'super_admin' }], 'u1'),
        ).rejects.toThrow(BadRequestException)
        expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1)
    })

    it('404s for unknown keys on get', async () => {
        await expect(service(mockPrisma()).get('nope')).rejects.toThrow(NotFoundException)
    })
})
