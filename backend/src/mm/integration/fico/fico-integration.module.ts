import { Module, forwardRef } from '@nestjs/common'
import { FicoModule } from '../../../fico/fico.module'
import { FicoIntegrationController } from './fico-integration.controller'
import { MmAccountingDocumentStatusService } from './mm-accounting-document-status.service'
import { MmAccountingStatusListener } from './mm-accounting-status.listener'
import { MmPostingPeriodGuard } from './mm-posting-period.guard'

@Module({
    imports: [forwardRef(() => FicoModule)],
    controllers: [FicoIntegrationController],
    providers: [
        MmPostingPeriodGuard,
        MmAccountingDocumentStatusService,
        MmAccountingStatusListener,
    ],
    exports: [MmPostingPeriodGuard, MmAccountingDocumentStatusService, FicoModule],
})
export class FicoIntegrationModule {}
