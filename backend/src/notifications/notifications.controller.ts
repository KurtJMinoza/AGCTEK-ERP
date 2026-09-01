import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { NotificationsService } from './notifications.service'

type CreateNotificationBody = {
    target: string
    description: string
    type?: number
    image?: string
    location?: string
    locationLabel?: string
    status?: string
}

@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly notificationsService: NotificationsService,
    ) {}

    @Get()
    findAll(@Query('limit') limit?: string) {
        const parsedLimit = limit ? Number(limit) : undefined

        return this.notificationsService.findAll(parsedLimit)
    }

    @Get('count')
    async getCount() {
        const count = await this.notificationsService.getUnreadCount()

        return { count }
    }

    @Post()
    create(@Body() body: CreateNotificationBody) {
        return this.notificationsService.create(body)
    }

    @Patch('read-all')
    markAllAsRead() {
        return this.notificationsService.markAllAsRead()
    }

    @Patch(':id/read')
    markAsRead(@Param('id') id: string) {
        return this.notificationsService.markAsRead(id)
    }
}
