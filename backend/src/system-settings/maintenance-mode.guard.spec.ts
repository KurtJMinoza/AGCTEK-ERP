import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
    ALLOW_DURING_MAINTENANCE_KEY,
    MAINTENANCE_ERROR_CODE,
    MaintenanceModeGuard,
} from './maintenance-mode.guard'
import { settingsStub } from './system-settings.testing'
import { SETTING_KEYS } from './system-settings.catalog'
import { USER_ROLES } from '../auth/auth.constants'
import type { PrismaService } from '../prisma/prisma.service'

function ctx(headers: Record<string, string> = {}, type = 'http'): ExecutionContext {
    return {
        getType: () => type,
        switchToHttp: () => ({ getRequest: () => ({ headers }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as unknown as ExecutionContext
}

function guard({
    maintenance,
    user,
    exempt = false,
}: {
    maintenance: boolean
    user?: { role: string; isActive: boolean } | null
    exempt?: boolean
}) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user ?? null) } }
    const reflector = new Reflector()
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
        key === ALLOW_DURING_MAINTENANCE_KEY ? exempt : undefined,
    )
    return new MaintenanceModeGuard(
        settingsStub({ [SETTING_KEYS.MAINTENANCE_MODE]: maintenance }),
        prisma as unknown as PrismaService,
        reflector,
    )
}

const withUser = { 'x-user-id': 'u1' }

describe('MaintenanceModeGuard', () => {
    it('allows everything when maintenance is off', async () => {
        await expect(guard({ maintenance: false }).canActivate(ctx())).resolves.toBe(true)
    })

    it('allows an active super_admin during maintenance', async () => {
        const g = guard({ maintenance: true, user: { role: USER_ROLES.SUPER_ADMIN, isActive: true } })
        await expect(g.canActivate(ctx(withUser))).resolves.toBe(true)
    })

    it.each([USER_ROLES.ADMIN, USER_ROLES.EMPLOYEE])(
        'rejects %s with 503 SYSTEM_MAINTENANCE',
        async (role) => {
            const g = guard({ maintenance: true, user: { role, isActive: true } })
            const error = await g.canActivate(ctx(withUser)).catch((e: unknown) => e)
            expect(error).toBeInstanceOf(ServiceUnavailableException)
            expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
                statusCode: 503,
                code: MAINTENANCE_ERROR_CODE,
            })
        },
    )

    it('rejects anonymous requests and deactivated super admins', async () => {
        await expect(guard({ maintenance: true }).canActivate(ctx())).rejects.toThrow(
            ServiceUnavailableException,
        )
        const inactive = guard({ maintenance: true, user: { role: USER_ROLES.SUPER_ADMIN, isActive: false } })
        await expect(inactive.canActivate(ctx(withUser))).rejects.toThrow(ServiceUnavailableException)
    })

    it('allows @AllowDuringMaintenance routes and non-HTTP contexts', async () => {
        await expect(guard({ maintenance: true, exempt: true }).canActivate(ctx())).resolves.toBe(true)
        await expect(guard({ maintenance: true }).canActivate(ctx({}, 'ws'))).resolves.toBe(true)
    })
})
