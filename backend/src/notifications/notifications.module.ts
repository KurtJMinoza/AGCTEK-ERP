import { Module, OnModuleInit } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { NotificationsGateway } from './notifications.gateway'

@Module({
    controllers: [NotificationsController],
    providers: [NotificationsService, NotificationsGateway],
    exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
    constructor(private readonly notificationsService: NotificationsService) {}

    async onModuleInit() {
        await this.notificationsService.seedIfEmpty()
    }
}
