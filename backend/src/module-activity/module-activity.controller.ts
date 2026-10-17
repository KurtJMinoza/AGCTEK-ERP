import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { ModuleActivityService } from './module-activity.service'
import { MarkModuleSeenDto } from './dto/mark-seen.dto'

/** Navigation "new data" badges for the signed-in ERP user (counts limited to readable pages). */
@Controller('module-activity')
@UseGuards(UserAuthGuard)
export class ModuleActivityController {
    constructor(private readonly activity: ModuleActivityService) {}

    @Get('summary')
    summary(@CurrentUser() user: AuthRequestUser) {
        return this.activity.summary(user.id)
    }

    @Post('seen')
    markSeen(
        @CurrentUser() user: AuthRequestUser,
        @Body() dto: MarkModuleSeenDto,
    ) {
        return this.activity.markSeen(user.id, dto.keys)
    }
}
