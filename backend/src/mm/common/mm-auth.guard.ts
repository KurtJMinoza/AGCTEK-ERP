import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../../prisma/prisma.service'
import {
    isUserRole,
    USER_ROLES,
    type UserRole,
} from '../../auth/auth.constants'
import {
    MM_ROLES_KEY,
    MM_USER_KEY,
    type MmRequestUser,
} from './mm-auth.decorator'

@Injectable()
export class MmAuthGuard implements CanActivate {
    constructor(
        private prisma: PrismaService,
        private reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const userId =
            (request.headers['x-user-id'] as string | undefined)?.trim() ||
            (request.headers['x-userid'] as string | undefined)?.trim()

        if (!userId) {
            throw new UnauthorizedException('X-User-Id header is required')
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, userName: true, role: true },
        })
        if (!user) {
            throw new UnauthorizedException('User not found')
        }

        const role: UserRole = isUserRole(user.role) ? user.role : USER_ROLES.ADMIN
        const mmUser: MmRequestUser = {
            id: user.id,
            userName: user.userName,
            role,
        }
        request[MM_USER_KEY] = mmUser

        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
            MM_ROLES_KEY,
            [context.getHandler(), context.getClass()],
        )
        if (requiredRoles?.length) {
            const allowed = requiredRoles.includes(role)
            if (!allowed) {
                throw new ForbiddenException('Insufficient role for this operation')
            }
        }

        return true
    }
}
