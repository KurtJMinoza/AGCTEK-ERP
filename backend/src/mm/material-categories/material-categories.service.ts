import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { nextSequentialCode } from '../shared/next-code'

@Injectable()
export class MaterialCategoriesService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.mmMaterialCategory.findMany({
            where: { deletedAt: null },
            include: {
                parent: true,
                children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
            },
            orderBy: { sortOrder: 'asc' },
        })
    }

    async findOne(id: string) {
        const cat = await this.prisma.mmMaterialCategory.findFirst({
            where: { id, deletedAt: null },
            include: { children: { where: { deletedAt: null } }, parent: true },
        })
        if (!cat) throw new NotFoundException('Category not found')
        return cat
    }

    async create(data: { code?: string; name: string; description?: string; parentId?: string; sortOrder?: number }) {
        const code = data.code?.trim() || (await this.generateNextCode())
        await this.assertUniqueCode(code)

        const softDeleted = await this.prisma.mmMaterialCategory.findFirst({
            where: { code, deletedAt: { not: null } },
        })
        if (softDeleted) {
            return this.prisma.mmMaterialCategory.update({
                where: { id: softDeleted.id },
                data: {
                    name: data.name,
                    description: data.description,
                    parentId: data.parentId,
                    sortOrder: data.sortOrder,
                    deletedAt: null,
                    isActive: true,
                },
            })
        }

        return this.prisma.mmMaterialCategory.create({
            data: {
                code,
                name: data.name,
                description: data.description,
                parentId: data.parentId,
                sortOrder: data.sortOrder,
            },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmMaterialCategory.findFirst({
            where: { code: { startsWith: 'CAT-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'CAT-')
    }

    private async assertUniqueCode(code: string) {
        const exists = await this.prisma.mmMaterialCategory.findFirst({
            where: { code, deletedAt: null },
        })
        if (exists) throw new ConflictException('Category code already exists')
    }

    async update(id: string, data: Partial<{ code: string; name: string; description: string; parentId: string; isActive: boolean; sortOrder: number }>) {
        await this.findOne(id)
        delete (data as any).code
        return this.prisma.mmMaterialCategory.update({ where: { id }, data })
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.mmMaterialCategory.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }
}
