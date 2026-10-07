import { Global, Module, OnModuleInit } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { SystemSettingsService } from './system-settings.service'
import { SystemSettingsController } from './system-settings.controller'
import { MaintenanceModeGuard } from './maintenance-mode.guard'

@Global()
@Module({
    controllers: [SystemSettingsController],
    providers: [SystemSettingsService, { provide: APP_GUARD, useClass: MaintenanceModeGuard }],
    exports: [SystemSettingsService],
})
export class SystemSettingsModule implements OnModuleInit {
    constructor(private readonly settings: SystemSettingsService) {}

    async onModuleInit() {
        await this.settings.seed()
    }
}
