import {
    applyDecorators,
    CanActivate,
    ExecutionContext,
    Injectable,
    SetMetadata,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_USER_KEY, type AuthRequestUser } from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { PermissionsService } from './permissions.service'
import type { PermissionAction } from './permissions.constants'

export const PERMISSION_KEY = 'requiredPermission'

/** Allowed when any listed resource allows the action. */
export type RequiredPermission = { resource: string | readonly string[]; action: PermissionAction }

/** Runs after `UserAuthGuard`, which attaches the authenticated user to the request. */
@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissions: PermissionsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
            PERMISSION_KEY,
            [context.getHandler(), context.getClass()],
        )
        if (!required) return true

        const request = context.switchToHttp().getRequest()
        const user: AuthRequestUser | undefined = request[AUTH_USER_KEY]
        if (!user) {
            throw new UnauthorizedException('Authenticated user is required')
        }

        await this.permissions.assertPermission(
            { role: user.role },
            required.resource,
            required.action,
        )
        return true
    }
}

/**
 * Require a resource permission on a controller or handler, e.g.
 * `@RequirePermission('crm.leads', 'update')`. A group code (`crm`) passes when any of its
 * resources allows the action; several codes pass when any of them does.
 * Applies `UserAuthGuard` + `PermissionGuard`.
 */
export const RequirePermission = (resource: string | readonly string[], action: PermissionAction) =>
    applyDecorators(
        SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission),
        UseGuards(UserAuthGuard, PermissionGuard),
    )
