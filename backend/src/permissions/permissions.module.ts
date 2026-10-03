import { Global, Module, OnModuleInit } from '@nestjs/common'
import { PermissionsController } from './permissions.controller'
import { PermissionsService } from './permissions.service'
import { PermissionGuard } from './permission.guard'
import { UserAuthGuard } from '../auth/user-auth.guard'

/** Global so any module can inject `PermissionsService` or use `@RequirePermission(...)`. */
@Global()
@Module({
    controllers: [PermissionsController],
    providers: [PermissionsService, PermissionGuard, UserAuthGuard],
    exports: [PermissionsService, PermissionGuard, UserAuthGuard],
})
export class PermissionsModule implements OnModuleInit {
    constructor(private readonly permissions: PermissionsService) {}

    async onModuleInit() {
        await this.permissions.seed()
    }
}
