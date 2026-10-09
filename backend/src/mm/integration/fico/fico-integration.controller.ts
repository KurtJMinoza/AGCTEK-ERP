import { Controller, Get, Query } from '@nestjs/common'
import { FicoReconciliationQueryDto } from '../../../fico/dto/fico.dto'
import { FicoReconciliationService } from '../../../fico/fico-reconciliation.service'
import { MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

@Controller('mm/integration/fico')
export class FicoIntegrationController {
    constructor(private reconciliation: FicoReconciliationService) {}

    @Get('reconciliation')
    @MmRead([...mmFeatures('valuation', 'inventory-valuation'), 'fico'])
    reconcile(@Query() query: FicoReconciliationQueryDto) {
        return this.reconciliation.reconcile({
            companyId: query.companyId,
            materialId: query.materialId,
            dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
            dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        })
    }
}
