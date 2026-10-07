import {
    CanActivate,
    ExecutionContext,
    Injectable,
    SetMetadata,
    ServiceUnavailableException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { USER_ROLES } from '../auth/auth.constants'
import { SystemSettingsService } from './system-settings.service'

export const MAINTENANCE_ERROR_CODE = 'SYSTEM_MAINTENANCE'

export const ALLOW_DURING_MAINTENANCE_KEY = 'allowDuringMaintenance'

/** Exempts a route from maintenance blocking (sign-in, sign-up, public settings). */
export const AllowDuringMaintenance = () => SetMetadata(ALLOW_DURING_MAINTENANCE_KEY, true)

export function maintenanceException() {
    return new ServiceUnavailableException({
        statusCode: 503,
        code: MAINTENANCE_ERROR_CODE,
        message: 'The system is currently undergoing maintenance.',
    })
}

/**
 * Global guard (APP_GUARD). While `maintenance_mode` is on, every HTTP request is rejected with
 * 503 SYSTEM_MAINTENANCE unless the route is @AllowDuringMaintenance() or the caller
 * (X-User-Id) is an active super_admin. Runs before route-level guards, so it identifies the
 * caller itself rather than relying on UserAuthGuard / MmAuthGuard.
 */
@Injectable()
export class MaintenanceModeGuard implements CanActivate {
    constructor(
        private readonly settings: SystemSettingsService,
        private readonly prisma: PrismaService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') return true

        const exempt = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_MAINTENANCE_KEY, [
            context.getHandler(),
            context.getClass(),
        ])
        if (exempt) return true

        if (!(await this.settings.isMaintenanceModeEnabled())) return true

        const request = context.switchToHttp().getRequest()
        const userId = (request.headers['x-user-id'] as string | undefined)?.trim()
        if (userId) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { role: true, isActive: true },
            })
            if (user?.isActive && user.role === USER_ROLES.SUPER_ADMIN) return true
        }

        throw maintenanceException()
    }
}
