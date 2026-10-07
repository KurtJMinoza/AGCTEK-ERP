import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { AdjustmentService } from './adjustment.service'
import { CreateAdjustmentDto } from './dto/create-adjustment.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { MmMutation } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/adjustments')
export class AdjustmentController {
    constructor(private service: AdjustmentService) {}

    @MmMutation(mmFeatures('inventory-management', 'inventory-adjustments'))
    @Post()
    create(@Body() dto: CreateAdjustmentDto) {
        return this.service.create(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'inventory-adjustments'))
    @Post(':id/submit')
    submit(@Param('id') id: string) {
        return this.service.submit(id)
    }

    @MmMutation([...mmFeatures('inventory-management', 'inventory-adjustments'), ...mmFeatures('inventory-control', 'adjustment-approval')])
    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() body: { approvedBy?: string }) {
        return this.service.approve(id, body?.approvedBy)
    }

    @MmMutation([...mmFeatures('inventory-management', 'inventory-adjustments'), ...mmFeatures('inventory-control', 'adjustment-approval')])
    @Post(':id/reject')
    reject(@Param('id') id: string, @Body() body: { reason?: string }) {
        return this.service.reject(id, body?.reason)
    }

    @MmMutation(mmFeatures('inventory-management', 'inventory-adjustments'))
    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    @MmMutation(mmFeatures('inventory-management', 'inventory-adjustments'))
    @Post(':id/reverse')
    reverse(@Param('id') id: string, @Body() body: { createdBy?: string }) {
        return this.service.reverse(id, body?.createdBy)
    }

    @Get()
    findAll(@Query() query: StockOpsQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }
}
