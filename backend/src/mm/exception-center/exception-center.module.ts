import { Module } from '@nestjs/common'
import { ExceptionCenterController } from './exception-center.controller'
import { ExceptionCenterService } from './exception-center.service'

@Module({
    controllers: [ExceptionCenterController],
    providers: [ExceptionCenterService],
    exports: [ExceptionCenterService],
})
export class ExceptionCenterModule {}
