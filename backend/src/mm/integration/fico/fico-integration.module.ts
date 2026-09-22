import { Module, forwardRef } from '@nestjs/common'
import { FicoModule } from '../../../fico/fico.module'
import { FicoIntegrationController } from './fico-integration.controller'
import { MmPostingPeriodGuard } from './mm-posting-period.guard'

@Module({
    imports: [forwardRef(() => FicoModule)],
    controllers: [FicoIntegrationController],
    providers: [MmPostingPeriodGuard],
    exports: [MmPostingPeriodGuard, FicoModule],
})
export class FicoIntegrationModule {}
