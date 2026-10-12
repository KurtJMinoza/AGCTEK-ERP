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
    userId?: string
    title?: string
    message?: string
    isRead?: boolean
    target?: string
    description?: string
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
    findAll(
        @Query('limit') limit?: string,
        @Query('userId') userId?: string,
    ) {
        const parsedLimit = limit ? Number(limit) : undefined

        return this.notificationsService.findAll(parsedLimit, userId)
    }

    @Get('count')
    async getCount(@Query('userId') userId?: string) {
        const count = await this.notificationsService.getUnreadCount(userId)

        return { count }
    }

    @Post()
    create(@Body() body: CreateNotificationBody) {
        return this.notificationsService.create(body)
    }

    @Patch('read-all')
    markAllAsRead(@Query('userId') userId?: string) {
        return this.notificationsService.markAllAsRead(userId)
    }

    @Patch(':id/read')
    markAsRead(@Param('id') id: string) {
        return this.notificationsService.markAsRead(id)
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() body: { isRead?: boolean; readed?: boolean },
    ) {
        if (body.isRead || body.readed) {
            return this.notificationsService.markAsRead(id)
        }
        return this.notificationsService.markAsRead(id)
    }
}

