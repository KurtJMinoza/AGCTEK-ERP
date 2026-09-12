import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    CreateQualityHoldDto,
    ReleaseQualityHoldDto,
    ReceivingQueryDto,
} from './dto/receiving.dto'

@Injectable()
export class QualityHoldService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateQualityHoldDto) {
        const holdNumber = await this.nextNumber()
        return this.prisma.mmQualityHold.create({
            data: {
                holdNumber,
                companyId: dto.companyId,
                inspectionLotId: dto.inspectionLotId ?? null,
                goodsReceiptLineId: dto.goodsReceiptLineId ?? null,
                materialId: dto.materialId ?? null,
                warehouseId: dto.warehouseId ?? null,
                status: 'ACTIVE',
                reason: dto.reason,
                heldBy: dto.heldBy ?? null,
            },
        })
    }

    async findAll(query: ReceivingQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmQualityHold.findMany({
                where,
                include: {
                    inspectionLot: {
                        select: { id: true, lotNumber: true, status: true },
                    },
                },
                orderBy: { heldAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmQualityHold.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async release(id: string, dto: ReleaseQualityHoldDto) {
        const hold = await this.prisma.mmQualityHold.findUnique({ where: { id } })
        if (!hold) throw new NotFoundException('Quality hold not found')
        if (hold.status !== 'ACTIVE') {
            throw new BadRequestException(`Hold is already ${hold.status}`)
        }
        return this.prisma.mmQualityHold.update({
            where: { id },
            data: {
                status: 'RELEASED',
                releasedBy: dto.releasedBy ?? null,
                releasedAt: new Date(),
                releaseNotes: dto.releaseNotes ?? null,
            },
        })
    }

    private async nextNumber() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `QH-${today}-`
        const count = await this.prisma.mmQualityHold.count({
            where: { holdNumber: { startsWith: pfx } },
        })
        return `${pfx}${String(count + 1).padStart(5, '0')}`
    }
}
