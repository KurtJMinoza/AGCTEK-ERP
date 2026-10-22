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
import { ShopAuthController } from './shop-auth/shop-auth.controller'
import { ShopAuthService } from './shop-auth/shop-auth.service'
import { ShopMailService } from './shop-auth/shop-mail.service'
import { ShopGoogleAuthService } from './shop-auth/shop-google-auth.service'

@Module({
    imports: [forwardRef(() => ScmModule), NotificationsModule],
    controllers: [
        RetailClientController,
        RetailNotificationsController,
        ShopAuthController,
    ],
    providers: [
        RetailClientService,
        RetailSessionService,
        RetailClientAuthGuard,
        RetailClientAddressService,
        RetailClientAddressGeocodeService,
        ShopAuthService,
        ShopMailService,
        ShopGoogleAuthService,
    ],
    exports: [RetailClientService, RetailSessionService],
})
export class RetailModule {}
