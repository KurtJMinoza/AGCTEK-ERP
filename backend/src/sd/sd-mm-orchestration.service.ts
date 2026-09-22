import { Injectable } from '@nestjs/common'
import { SdIntegrationService } from '../mm/integration/sd/sd-integration.service'
import { GoodsIssueService } from '../mm/stock-ops/goods-issue.service'
import { SalesOrderService } from './sales-order.service'

@Injectable()
export class SdMmOrchestrationService {
    constructor(
        private sdIntegration: SdIntegrationService,
        private goodsIssue: GoodsIssueService,
        private salesOrders: SalesOrderService,
    ) {}

    async issueSalesOrder(args: {
        salesOrderId: string
        storageBinId: string
        createdBy?: string
    }) {
        const order = await this.salesOrders.findOne(args.salesOrderId)
        const line = order.lines[0]
        if (!line?.reservationHeaderId) {
            throw new Error('Sales order has no active reservation')
        }

        const material = line.material
        const gi = await this.goodsIssue.create({
            companyId: order.companyId,
            warehouseId: order.warehouseId,
            postingDate: new Date().toISOString(),
            documentDate: new Date().toISOString(),
            issuePurpose: 'SALES',
            sourceDocumentType: 'SALES_ORDER',
            sourceDocumentId: order.id,
            reservationHeaderId: line.reservationHeaderId,
            createdBy: args.createdBy,
            lines: [
                {
                    materialId: line.materialId,
                    quantity: Number(line.reservedQuantity || line.quantity),
                    uomId: material.baseUomId,
                    storageBinId: args.storageBinId,
                },
            ],
        })

        const posted = await this.goodsIssue.post(gi.id)
        return posted
    }
}
