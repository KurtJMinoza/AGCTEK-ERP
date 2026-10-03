import { Module } from '@nestjs/common'
import { RetailClientController } from './retail-client.controller'
import { RetailClientService } from './retail-client.service'

@Module({
    controllers: [RetailClientController],
    providers: [RetailClientService],
    exports: [RetailClientService],
})
export class RetailModule {}
