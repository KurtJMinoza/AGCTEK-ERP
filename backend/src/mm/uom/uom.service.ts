import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { nextSequentialCode } from '../shared/next-code'

@Injectable()
export class UomService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.mmUom.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
        })
    }

    async findOne(id: string) {
        const uom = await this.prisma.mmUom.findFirst({ where: { id, deletedAt: null } })
        if (!uom) throw new NotFoundException('UOM not found')
        return uom
    }

    async create(data: { code?: string; name: string; symbol?: string; sortOrder?: number }) {
        const code = data.code?.trim() || (await this.generateNextCode())
        const exists = await this.prisma.mmUom.findFirst({
            where: { code, deletedAt: null },
        })
        if (exists) throw new ConflictException('UOM code already exists')

        return this.prisma.mmUom.create({
            data: {
                code,
                name: data.name,
                symbol: data.symbol,
                sortOrder: data.sortOrder,
            },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmUom.findFirst({
            where: { code: { startsWith: 'UOM-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'UOM-')
    }

    async update(id: string, data: Partial<{ code: string; name: string; symbol: string; isActive: boolean; sortOrder: number }>) {
        await this.findOne(id)
        delete (data as any).code
        return this.prisma.mmUom.update({ where: { id }, data })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmUom.update({ where: { id }, data: { deletedAt: new Date() } })
    }
}
