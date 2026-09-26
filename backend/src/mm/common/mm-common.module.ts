import { Global, Module } from '@nestjs/common'
import { MmScopeService } from './mm-scope.service'
import { MmDomainEventsService } from './mm-domain-events.service'
import { MmOutboxService } from './mm-outbox.service'
import { MmEventConsumerService } from './mm-event-consumer.service'
import { MmAuthGuard } from './mm-auth.guard'
import { MmAccountingContextBuilder } from './mm-accounting-context.builder'
import { MmAccountingEventService } from './mm-accounting-event.service'

@Global()
@Module({
    providers: [
        MmScopeService,
        MmOutboxService,
        MmEventConsumerService,
        MmDomainEventsService,
        MmAccountingContextBuilder,
        MmAccountingEventService,
        MmAuthGuard,
    ],
    exports: [
        MmScopeService,
        MmOutboxService,
        MmEventConsumerService,
        MmDomainEventsService,
        MmAccountingContextBuilder,
        MmAccountingEventService,
        MmAuthGuard,
    ],
})
export class MmCommonModule {}
