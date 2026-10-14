import { Module, forwardRef } from '@nestjs/common'
import { RetailClientController } from './retail-client.controller'
import { RetailClientAuthGuard } from './retail-client.guard'
import { RetailClientService } from './retail-client.service'
import { RetailSessionService } from './retail-session.service'
import { ScmModule } from '../scm/scm.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RetailClientAddressService } from './retail-client-address.service'
import { RetailClientAddressGeocodeService } from './retail-client-address-geocode.service'
import { RetailNotificationsController } from './retail-notifications.controller'

@Module({
    imports: [forwardRef(() => ScmModule), NotificationsModule],
    controllers: [RetailClientController, RetailNotificationsController],
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
