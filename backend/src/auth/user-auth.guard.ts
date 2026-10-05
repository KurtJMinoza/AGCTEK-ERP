import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'
import { isUserRole, USER_ROLES, type UserRole } from './auth.constants'
import {
    AUTH_ROLES_KEY,
    AUTH_USER_KEY,
    type AuthRequestUser,
} from './auth.decorator'

@Injectable()
export class UserAuthGuard implements CanActivate {
    constructor(
        private readonly prisma: PrismaService,
        private readonly reflector: Reflector,
        private readonly settings: SystemSettingsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const userId = (
            request.headers['x-user-id'] as string | undefined
        )?.trim()

        if (!userId) {
            throw new UnauthorizedException('X-User-Id header is required')
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, userName: true, role: true, isActive: true },
        })

        if (!user) {
            throw new UnauthorizedException('User not found')
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User is deactivated')
        }

        const role: UserRole = isUserRole(user.role)
            ? user.role
            : USER_ROLES.EMPLOYEE
        const authUser: AuthRequestUser = {
            id: user.id,
            userName: user.userName,
            role,
        }
        request[AUTH_USER_KEY] = authUser

        if (
            role !== USER_ROLES.SUPER_ADMIN &&
            (await this.settings.getBoolean(SETTING_KEYS.MAINTENANCE_MODE))
        ) {
            throw new ServiceUnavailableException('The system is under maintenance.')
        }

        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
            AUTH_ROLES_KEY,
            [context.getHandler(), context.getClass()],
        )

        if (requiredRoles?.length && !requiredRoles.includes(role)) {
            throw new ForbiddenException('Insufficient role for this operation')
        }

        return true
    }
}
