import {
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common'
import { NotificationsService } from '../notifications/notifications.service'
import { CurrentRetailClientId, RetailClientAuthGuard } from './retail-client.guard'

/** Signed-in shopper's own notification inbox (session-scoped; never staff data). */
@Controller('retail/notifications')
@UseGuards(RetailClientAuthGuard)
export class RetailNotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    @Get()
    list(
        @CurrentRetailClientId() clientId: string,
        @Query('limit') limit?: string,
    ) {
        return this.notifications.findForShopper(clientId, Number(limit) || 20)
    }

    @Get('count')
    async count(@CurrentRetailClientId() clientId: string) {
        return { count: await this.notifications.unreadCountForShopper(clientId) }
    }

    @Patch('read-all')
    @HttpCode(204)
    markAllRead(@CurrentRetailClientId() clientId: string) {
        return this.notifications.markAllReadForShopper(clientId)
    }

    @Patch(':id/read')
    @HttpCode(204)
    markRead(@CurrentRetailClientId() clientId: string, @Param('id') id: string) {
        return this.notifications.markReadForShopper(clientId, id)
    }
}
