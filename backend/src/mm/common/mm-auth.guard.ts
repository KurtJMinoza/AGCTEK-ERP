import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../../prisma/prisma.service'
import { PermissionsService } from '../../permissions/permissions.service'
import type { PermissionAction } from '../../permissions/permissions.constants'
import {
    MM_PERMISSION_KEY,
    MM_USER_KEY,
    type MmRequestUser,
    type MmRequiredPermission,
} from './mm-auth.decorator'

@Injectable()
export class MmAuthGuard implements CanActivate {
    constructor(
        private prisma: PrismaService,
        private reflector: Reflector,
        private permissions: PermissionsService,
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

        const mmUser: MmRequestUser = {
            id: user.id,
            userName: user.userName,
            role: user.role,
        }
        request[MM_USER_KEY] = mmUser

        const required = this.reflector.getAllAndOverride<MmRequiredPermission | undefined>(
            MM_PERMISSION_KEY,
            [context.getHandler(), context.getClass()],
        )
        if (required) {
            await this.permissions.assertPermission(
                user.role,
                required.resource,
                required.action ?? inferAction(request),
            )
        }

        return true
    }
}

function inferAction(request: {
    method?: string
    url?: string
    routeOptions?: { url?: string }
    routerPath?: string
}): PermissionAction {
    const method = request.method?.toUpperCase()
    if (method === 'DELETE') return 'delete'
    const route = request.routeOptions?.url ?? request.routerPath ?? ''
    if (method === 'POST' && route && !route.includes(':')) return 'create'
    return 'update'
}
