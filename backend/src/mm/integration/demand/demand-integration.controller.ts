import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import {
    CancelDemandBySourceDto,
    MmDemandQueryDto,
    SyncDemandBatchDto,
    SyncDemandLineDto,
} from './dto/demand-integration.dto'
import { DemandIntegrationService } from './demand-integration.service'

@Controller('mm/integration/demand')
export class DemandIntegrationController {
    constructor(private demand: DemandIntegrationService) {}

    @Get('providers')
    listProviders() {
        return { modules: this.demand.listRegisteredModules() }
    }

    @Get('open')
    listOpen(@Query() query: MmDemandQueryDto) {
        return this.demand.listOpenDemand({
            companyId: query.companyId,
            materialIds: query.materialIds?.split(',').filter(Boolean),
            warehouseIds: query.warehouseIds?.split(',').filter(Boolean),
            asOf: new Date(query.asOf),
            horizonEnd: new Date(query.horizonEnd),
        })
    }

    @Post('sync')
    syncLine(@Body() dto: SyncDemandLineDto) {
        return this.demand.syncLine(dto)
    }

    @Post('sync/batch')
    syncBatch(@Body() dto: SyncDemandBatchDto) {
        return this.demand.syncBatch(dto)
    }

    @Post('cancel-by-source')
    cancelBySource(@Body() dto: CancelDemandBySourceDto) {
        return this.demand.cancelBySource(dto)
    }
}
