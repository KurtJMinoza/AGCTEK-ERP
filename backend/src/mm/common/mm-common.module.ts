import { Global, Module } from '@nestjs/common'
import { MmScopeService } from './mm-scope.service'
import { MmDomainEventsService } from './mm-domain-events.service'
import { MmAuthGuard } from './mm-auth.guard'

@Global()
@Module({
    providers: [MmScopeService, MmDomainEventsService, MmAuthGuard],
    exports: [MmScopeService, MmDomainEventsService, MmAuthGuard],
})
export class MmCommonModule {}
