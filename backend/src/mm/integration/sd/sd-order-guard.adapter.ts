import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { SdOrderGuardPort } from './sd-order-guard.port'

@Injectable()
export class SdOrderGuardAdapter implements SdOrderGuardPort {
    constructor(private prisma: PrismaService) {}

    async isOrderActive(salesOrderId: string): Promise<boolean> {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: { status: true },
        })
        if (!order) return false
        return order.status !== 'CANCELLED'
    }
}
