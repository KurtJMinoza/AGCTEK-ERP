import { Injectable } from '@nestjs/common'
import { ProductionIntegrationService } from '../mm/integration/production/production-integration.service'
import { ProductionOrderService } from './production-order.service'

@Injectable()
export class PpMmOrchestrationService {
    constructor(
        private ppIntegration: ProductionIntegrationService,
        private productionOrders: ProductionOrderService,
    ) {}

    async issueComponents(args: {
        productionOrderId: string
        storageBinId: string
        createdBy?: string
    }) {
        return this.ppIntegration.issueComponents({
            productionOrderId: args.productionOrderId,
            storageBinId: args.storageBinId ?? 'bin-default',
            createdBy: args.createdBy,
        })
    }

    async reportOutput(args: {
        productionOrderId: string
        materialId: string
        quantity: number
        storageBinId?: string
        createdBy?: string
    }) {
        const order = await this.productionOrders.findOne(args.productionOrderId)
        return this.ppIntegration.receiveOutput({
            productionOrderId: order.id,
            companyId: order.companyId,
            warehouseId: order.warehouseId,
            materialId: args.materialId,
            quantity: args.quantity,
            storageBinId: args.storageBinId,
            createdBy: args.createdBy,
        })
    }
}
