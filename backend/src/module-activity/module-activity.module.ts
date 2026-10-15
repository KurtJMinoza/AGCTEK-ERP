import { Module } from '@nestjs/common'
import { ModuleActivityController } from './module-activity.controller'
import { ModuleActivityService } from './module-activity.service'

@Module({
    controllers: [ModuleActivityController],
    providers: [ModuleActivityService],
})
export class ModuleActivityModule {}
