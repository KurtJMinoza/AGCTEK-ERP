import { Controller, Get, Param, Query } from '@nestjs/common'
import { RequirePermission } from '../permissions/permission.guard'
import { ListDeliveriesQueryDto } from './dto/delivery.dto'
import { DeliveryMonitorService } from './delivery-monitor.service'

/**
 * Outbound delivery monitor (read-only). Picking, packing and goods issue are
 * executed in MM; this surface reports their progress per sales order.
 */
@Controller('sd/deliveries')
export class DeliveryController {
    constructor(private readonly deliveries: DeliveryMonitorService) {}

    @Get()
    @RequirePermission('sd.deliveries', 'read')
    list(@Query() query: ListDeliveriesQueryDto) {
        return this.deliveries.list(query)
    }

    @Get(':salesOrderId')
    @RequirePermission('sd.deliveries', 'read')
    findOne(@Param('salesOrderId') salesOrderId: string) {
        return this.deliveries.findOne(salesOrderId)
    }
}
