import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { PermissionsModule } from './permissions/permissions.module'
import { SystemSettingsModule } from './system-settings/system-settings.module'
import { ScmModule } from './scm/scm.module'
import { MmModule } from './mm/mm.module'
import { RetailModule } from './retail/retail.module'
import { SdModule } from './sd/sd.module'
import { PpModule } from './pp/pp.module'
import { FicoModule } from './fico/fico.module'
import { CrmModule } from './crm/crm.module'

@Module({
    imports: [
        EventEmitterModule.forRoot(),
        PrismaModule,
        NotificationsModule,
        AuthModule,
        SystemSettingsModule,
        UsersModule,
        PermissionsModule,
        ScmModule,
        MmModule,
        SdModule,
        PpModule,
        FicoModule,
        CrmModule,
        RetailModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
