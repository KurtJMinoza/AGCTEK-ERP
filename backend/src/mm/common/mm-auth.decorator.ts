import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import { USER_ROLES, type UserRole } from '../../auth/auth.constants'

export const MM_USER_KEY = 'mmUser'
export const MM_ROLES_KEY = 'mmRoles'

export type MmRequestUser = {
    id: string
    userName: string
    role: UserRole
}

export const MmUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): MmRequestUser | undefined => {
        const request = ctx.switchToHttp().getRequest()
        return request[MM_USER_KEY]
    },
)

export const RequireMmRole = (...roles: UserRole[]) =>
    SetMetadata(MM_ROLES_KEY, roles)

export const MM_MUTATION_ROLES: UserRole[] = [
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.ADMIN,
]
