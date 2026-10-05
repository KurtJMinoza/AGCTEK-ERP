import { Global, Module, OnModuleInit } from '@nestjs/common'
import { SystemSettingsService } from './system-settings.service'
import { SystemSettingsController } from './system-settings.controller'

@Global()
@Module({
    controllers: [SystemSettingsController],
    providers: [SystemSettingsService],
    exports: [SystemSettingsService],
})
export class SystemSettingsModule implements OnModuleInit {
    constructor(private readonly settings: SystemSettingsService) {}

    async onModuleInit() {
        await this.settings.seed()
    }
}
