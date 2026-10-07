import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { USER_ROLES } from '../auth/auth.constants'
import {
    CurrentUser,
    RequireRoles,
    type AuthRequestUser,
} from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { PermissionsService } from './permissions.service'
import { RoleTemplatesService } from './role-templates.service'
import {
    CreateRoleDto,
    CreateRoleTemplateDto,
    UpdateRoleDto,
    UpdateRolePermissionsDto,
} from './dto/permissions.dto'

@Controller('permissions')
@UseGuards(UserAuthGuard)
export class PermissionsController {
    constructor(
        private readonly permissions: PermissionsService,
        private readonly templates: RoleTemplatesService,
    ) {}

    /** Effective permissions for the signed-in user (any active role). */
    @Get('me')
    async me(@CurrentUser() user: AuthRequestUser) {
        return {
            role: user.role,
            ...(await this.permissions.resolveForRole(user.role)),
        }
    }

    /** Permission groups with their grantable resources. */
    @Get('catalog')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    getCatalog() {
        return this.permissions.getCatalog()
    }

    @Get('roles')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    listRoles() {
        return this.permissions.listRoles()
    }

    @Post('roles')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    createRole(@Body() body: CreateRoleDto) {
        return this.permissions.createRole(body)
    }

    @Get('roles/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    getRolePermissions(@Param('code') code: string) {
        return this.permissions.getRolePermissions(code)
    }

    @Patch('roles/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    updateRole(@Param('code') code: string, @Body() body: UpdateRoleDto) {
        return this.permissions.updateRole(code, body)
    }

    @Delete('roles/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    deleteRole(@Param('code') code: string) {
        return this.permissions.deleteRole(code)
    }

    @Put('roles/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    updateRolePermissions(
        @Param('code') code: string,
        @Body() body: UpdateRolePermissionsDto,
    ) {
        return this.permissions.updateRolePermissions(code, body.permissions)
    }

    @Get('templates')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    listTemplates() {
        return this.templates.list()
    }

    @Post('templates')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    createTemplate(@Body() body: CreateRoleTemplateDto) {
        return this.templates.create(body)
    }

    @Get('templates/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    getTemplate(@Param('code') code: string) {
        return this.templates.get(code)
    }

    @Patch('templates/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    updateTemplate(@Param('code') code: string, @Body() body: UpdateRoleDto) {
        return this.templates.update(code, body)
    }

    @Put('templates/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    updateTemplatePermissions(@Param('code') code: string, @Body() body: UpdateRolePermissionsDto) {
        return this.templates.updatePermissions(code, body.permissions)
    }

    @Delete('templates/:code')
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    deleteTemplate(@Param('code') code: string) {
        return this.templates.remove(code)
    }
}
