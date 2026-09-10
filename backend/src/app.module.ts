import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AuthModule } from './auth/auth.module'
import { ScmModule } from './scm/scm.module'
import { MmModule } from './mm/mm.module'

@Module({
    imports: [
        EventEmitterModule.forRoot(),
        PrismaModule,
        NotificationsModule,
        AuthModule,
        ScmModule,
        MmModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
