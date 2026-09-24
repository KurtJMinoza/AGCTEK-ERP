import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { ProductionOrderGuardPort } from './production-order-guard.port'

@Injectable()
export class ProductionOrderGuardAdapter implements ProductionOrderGuardPort {
    constructor(private prisma: PrismaService) {}

    async isOrderActive(productionOrderId: string): Promise<boolean> {
        const order = await this.prisma.ppProductionOrder.findUnique({
            where: { id: productionOrderId },
            select: { status: true },
        })
        if (!order) return false
        return order.status !== 'CANCELLED'
    }
}
