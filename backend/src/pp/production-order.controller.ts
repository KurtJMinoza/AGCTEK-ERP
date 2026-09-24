import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
} from '@nestjs/common'
import {
    ChangeProductionMaterialQtyDto,
    CreateBomDto,
    CreateProductionOrderDto,
    IssueProductionComponentsDto,
    ReportProductionOutputDto,
} from './dto/production-order.dto'
import { ProductionOrderService } from './production-order.service'
import { BomService } from './bom.service'
import { PpMmOrchestrationService } from './pp-mm-orchestration.service'

@Controller('pp')
export class ProductionOrderController {
    constructor(
        private productionOrders: ProductionOrderService,
        private bom: BomService,
        private orchestration: PpMmOrchestrationService,
    ) {}

    @Post('boms')
    createBom(@Body() dto: CreateBomDto) {
        return this.bom.create(dto)
    }

    @Post('production-orders')
    create(@Body() dto: CreateProductionOrderDto) {
        return this.productionOrders.create(dto)
    }

    @Get('production-orders/:id')
    findOne(@Param('id') id: string) {
        return this.productionOrders.findOne(id)
    }

    @Post('production-orders/:id/release')
    release(@Param('id') id: string) {
        return this.productionOrders.release(id)
    }

    @Post('production-orders/:id/cancel')
    cancel(@Param('id') id: string) {
        return this.productionOrders.cancel(id)
    }

    @Patch('production-orders/:id/materials/:lineId/quantity')
    changeMaterialQuantity(
        @Param('id') id: string,
        @Param('lineId') lineId: string,
        @Body() dto: ChangeProductionMaterialQtyDto,
    ) {
        return this.productionOrders.changeMaterialQuantity(id, lineId, dto)
    }

    @Post('production-orders/:id/issue')
    issueComponents(
        @Param('id') id: string,
        @Body() dto: IssueProductionComponentsDto,
    ) {
        return this.orchestration.issueComponents({
            productionOrderId: id,
            storageBinId: dto.storageBinId ?? 'bin-default',
            createdBy: dto.createdBy,
        })
    }

    @Post('production-orders/:id/output')
    reportOutput(
        @Param('id') id: string,
        @Body() dto: ReportProductionOutputDto,
    ) {
        return this.orchestration.reportOutput({
            productionOrderId: id,
            materialId: dto.materialId,
            quantity: dto.quantity,
            storageBinId: dto.storageBinId,
            createdBy: dto.createdBy,
        })
    }
}
