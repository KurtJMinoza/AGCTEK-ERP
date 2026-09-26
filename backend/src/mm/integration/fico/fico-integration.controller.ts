import { Controller, Get, Query } from '@nestjs/common'
import { FicoReconciliationQueryDto } from '../../../fico/dto/fico.dto'
import { FicoReconciliationService } from '../../../fico/fico-reconciliation.service'

@Controller('mm/integration/fico')
export class FicoIntegrationController {
    constructor(private reconciliation: FicoReconciliationService) {}

    @Get('reconciliation')
    reconcile(@Query() query: FicoReconciliationQueryDto) {
        return this.reconciliation.reconcile({
            companyId: query.companyId,
            materialId: query.materialId,
            dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
            dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        })
    }
}
