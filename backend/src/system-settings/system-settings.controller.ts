import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common'
import { USER_ROLES } from '../auth/auth.constants'
import {
    CurrentUser,
    RequireRoles,
    type AuthRequestUser,
} from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { SystemSettingsService } from './system-settings.service'
import { UpdateSystemSettingsDto } from './dto/system-settings.dto'

@Controller('system-settings')
export class SystemSettingsController {
    constructor(private readonly settings: SystemSettingsService) {}

    /** Unauthenticated: only keys marked `public` in the catalog (no secrets). */
    @Get('public')
    getPublic() {
        return this.settings.getPublic()
    }

    @Get()
    @UseGuards(UserAuthGuard)
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    list() {
        return this.settings.list()
    }

    @Get(':key')
    @UseGuards(UserAuthGuard)
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    get(@Param('key') key: string) {
        return this.settings.get(key)
    }

    @Patch()
    @UseGuards(UserAuthGuard)
    @RequireRoles(USER_ROLES.SUPER_ADMIN)
    update(@Body() dto: UpdateSystemSettingsDto, @CurrentUser() user: AuthRequestUser) {
        return this.settings.update(dto.settings, user.id)
    }
}
