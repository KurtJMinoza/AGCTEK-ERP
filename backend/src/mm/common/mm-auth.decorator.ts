import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import type { PermissionAction } from '../../permissions/permissions.constants'

export const MM_USER_KEY = 'mmUser'
export const MM_PERMISSION_KEY = 'mmPermission'

export type MmRequestUser = {
    id: string
    userName: string
    /** Role code from the `roles` table. */
    role: string
}

/** Allowed when any listed resource allows the action. */
export type MmRequiredPermission = { resource: string | readonly string[]; action?: PermissionAction }

export const MmUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): MmRequestUser | undefined => {
        const request = ctx.switchToHttp().getRequest()
        return request[MM_USER_KEY]
    },
)

/** MM resource permission (e.g. `mm.procurement.rfqs`, or several) checked by `MmAuthGuard`. */
export const RequireMmPermission = (resource: string | readonly string[], action?: PermissionAction) =>
    SetMetadata(MM_PERMISSION_KEY, { resource, action } satisfies MmRequiredPermission)
