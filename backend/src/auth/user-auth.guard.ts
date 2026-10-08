import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import type { UserRole } from './auth.constants'
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
            select: {
                id: true,
                userName: true,
                role: true,
                isActive: true,
                roleRef: { select: { isActive: true } },
            },
        })

        if (!user) {
            throw new UnauthorizedException('User not found')
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User is deactivated')
        }

        if (!user.roleRef.isActive) {
            throw new ForbiddenException('Assigned role is inactive')
        }

        const role = user.role
        const authUser: AuthRequestUser = {
            id: user.id,
            userName: user.userName,
            role,
        }
        request[AUTH_USER_KEY] = authUser

        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
            AUTH_ROLES_KEY,
            [context.getHandler(), context.getClass()],
        )

        if (requiredRoles?.length && !requiredRoles.includes(role as UserRole)) {
            throw new ForbiddenException('Insufficient role for this operation')
        }

        return true
    }
}
