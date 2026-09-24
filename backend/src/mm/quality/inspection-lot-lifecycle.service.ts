import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { assertLotTransition, normalizeLotStatus } from './quality.constants'
import { CompleteInspectionLotDto, StartInspectionLotDto } from './dto/quality.dto'

@Injectable()
export class InspectionLotLifecycleService {
    constructor(private prisma: PrismaService) {}

    async start(id: string, dto: StartInspectionLotDto) {
        const lot = await this.prisma.mmInspectionLot.findUnique({ where: { id } })
        if (!lot) throw new NotFoundException('Inspection lot not found')
        const from = normalizeLotStatus(lot.status)
        try {
            assertLotTransition(from, 'IN_PROGRESS')
        } catch {
            if (!['CREATED', 'READY', 'PENDING'].includes(lot.status)) {
                throw new BadRequestException(`Cannot start lot in status ${lot.status}`)
            }
        }
        return this.prisma.mmInspectionLot.update({
            where: { id },
            data: {
                status: 'IN_PROGRESS',
                assignedInspector: dto.inspector ?? lot.assignedInspector,
            },
        })
    }

    async complete(id: string, dto: CompleteInspectionLotDto) {
        const lot = await this.prisma.mmInspectionLot.findUnique({ where: { id } })
        if (!lot) throw new NotFoundException('Inspection lot not found')
        if (!['IN_PROGRESS', 'READY'].includes(normalizeLotStatus(lot.status)) && lot.status !== 'IN_PROGRESS') {
            throw new BadRequestException(`Cannot complete lot in status ${lot.status}`)
        }
        return this.prisma.mmInspectionLot.update({
            where: { id },
            data: {
                status: 'PENDING_DECISION',
                inspectedBy: dto.completedBy ?? lot.inspectedBy,
                inspectedAt: new Date(),
                remarks: dto.remarks ?? lot.remarks,
            },
        })
    }

    async cancel(id: string, reason?: string) {
        const lot = await this.prisma.mmInspectionLot.findUnique({ where: { id } })
        if (!lot) throw new NotFoundException('Inspection lot not found')
        if (['CLOSED', 'CANCELLED', 'DECIDED'].includes(normalizeLotStatus(lot.status))) {
            throw new BadRequestException(`Cannot cancel lot in status ${lot.status}`)
        }
        return this.prisma.mmInspectionLot.update({
            where: { id },
            data: { status: 'CANCELLED', remarks: reason ?? lot.remarks },
        })
    }

    async cancelOpenLotsForGr(goodsReceiptId: string, reason?: string) {
        const open = await this.prisma.mmInspectionLot.findMany({
            where: {
                goodsReceiptId,
                status: { notIn: ['CLOSED', 'CANCELLED', 'DECIDED'] },
            },
        })
        for (const lot of open) {
            await this.cancel(lot.id, reason ?? 'Goods receipt reversed')
        }
    }
}
