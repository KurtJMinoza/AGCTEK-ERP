import { Module } from '@nestjs/common'
import { RetailClientController } from './retail-client.controller'
import { RetailClientAuthGuard } from './retail-client.guard'
import { RetailClientService } from './retail-client.service'
import { RetailSessionService } from './retail-session.service'
import { ScmModule } from '../scm/scm.module'
import { RetailClientAddressService } from './retail-client-address.service'
import { RetailClientAddressGeocodeService } from './retail-client-address-geocode.service'

@Module({
    imports: [ScmModule],
    controllers: [RetailClientController],
    providers: [
        RetailClientService,
        RetailSessionService,
        RetailClientAuthGuard,
        RetailClientAddressService,
        RetailClientAddressGeocodeService,
    ],
    exports: [RetailClientService, RetailSessionService],
})
export class RetailModule {}
