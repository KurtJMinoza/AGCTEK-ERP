import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common'
import {
    FicoPeriodQueryDto,
    FicoReconciliationQueryDto,
    SetFicoPeriodStatusDto,
    UpsertFicoPeriodDto,
} from './dto/fico.dto'
import { FicoFinancialPeriodService } from './financial-period.service'
import { FicoReconciliationService } from './fico-reconciliation.service'

@Controller('fico')
export class FicoController {
    constructor(
        private periods: FicoFinancialPeriodService,
        private reconciliation: FicoReconciliationService,
    ) {}

    @Get('periods')
    listPeriods(@Query() query: FicoPeriodQueryDto) {
        return this.periods.listPeriods(query.companyId)
    }

    @Post('periods')
    upsertPeriod(@Body() dto: UpsertFicoPeriodDto) {
        return this.periods.upsertPeriod({
            companyId: dto.companyId,
            fiscalYear: dto.fiscalYear,
            periodNumber: dto.periodNumber,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            status: dto.status,
        })
    }

    @Patch('periods/status')
    setPeriodStatus(@Body() dto: SetFicoPeriodStatusDto) {
        return this.periods.setPeriodStatus(
            dto.companyId,
            dto.fiscalYear,
            dto.periodNumber,
            dto.status,
        )
    }

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
