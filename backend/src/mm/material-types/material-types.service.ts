import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { nextSequentialCode } from '../shared/next-code'

@Injectable()
export class MaterialTypesService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.mmMaterialType.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
        })
    }

    async findOne(id: string) {
        const type = await this.prisma.mmMaterialType.findFirst({
            where: { id, deletedAt: null },
        })
        if (!type) throw new NotFoundException('Material type not found')
        return type
    }

    async create(data: { code?: string; name: string; description?: string; sortOrder?: number }) {
        const code = data.code?.trim() || (await this.generateNextCode())
        await this.assertUniqueCode(code)

        const softDeleted = await this.prisma.mmMaterialType.findFirst({
            where: { code, deletedAt: { not: null } },
        })
        if (softDeleted) {
            return this.prisma.mmMaterialType.update({
                where: { id: softDeleted.id },
                data: {
                    name: data.name,
                    description: data.description,
                    sortOrder: data.sortOrder,
                    deletedAt: null,
                    isActive: true,
                },
            })
        }

        return this.prisma.mmMaterialType.create({
            data: {
                code,
                name: data.name,
                description: data.description,
                sortOrder: data.sortOrder,
            },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmMaterialType.findFirst({
            where: { code: { startsWith: 'TYP-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'TYP-')
    }

    private async assertUniqueCode(code: string) {
        const exists = await this.prisma.mmMaterialType.findFirst({
            where: { code, deletedAt: null },
        })
        if (exists) throw new ConflictException('Type code already exists')
    }

    async update(id: string, data: Partial<{ code: string; name: string; description: string; isActive: boolean; sortOrder: number }>) {
        await this.findOne(id)
        delete (data as any).code
        return this.prisma.mmMaterialType.update({ where: { id }, data })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmMaterialType.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }
}
