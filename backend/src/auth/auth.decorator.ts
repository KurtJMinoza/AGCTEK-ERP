import {
    createParamDecorator,
    ExecutionContext,
    SetMetadata,
} from '@nestjs/common'
import type { UserRole } from './auth.constants'

export const AUTH_USER_KEY = 'authUser'
export const AUTH_ROLES_KEY = 'authRoles'

export type AuthRequestUser = {
    id: string
    userName: string
    role: UserRole
}

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthRequestUser | undefined => {
        const request = ctx.switchToHttp().getRequest()
        return request[AUTH_USER_KEY]
    },
)

/** Restrict a controller or handler to the listed roles. Requires `UserAuthGuard`. */
export const RequireRoles = (...roles: UserRole[]) =>
    SetMetadata(AUTH_ROLES_KEY, roles)
