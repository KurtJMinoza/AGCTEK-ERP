import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { USER_ROLES } from '../auth/auth.constants'
import {
    CurrentUser,
    RequireRoles,
    type AuthRequestUser,
} from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { PermissionsService } from './permissions.service'
import { UpdateRolePermissionsDto } from './dto/permissions.dto'

@Controller('permissions')
@UseGuards(UserAuthGuard)
export class PermissionsController {
    constructor(private readonly permissions: PermissionsService) {}

    /** Effective permissions for the signed-in user (any active role). */
    @Get('me')
    async me(@CurrentUser() user: AuthRequestUser) {
        return {
            role: user.role,
            permissions: await this.permissions.resolveForRole(user.role),
        }
    }

    @Get('modules')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    listModules() {
        return this.permissions.listModules()
    }

    @Get('roles/:role')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    getRolePermissions(@Param('role') role: string) {
        return this.permissions.getRolePermissions(role)
    }

    @Put('roles/:role')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    updateRolePermissions(
        @Param('role') role: string,
        @Body() body: UpdateRolePermissionsDto,
    ) {
        return this.permissions.updateRolePermissions(role, body.permissions)
    }
}
