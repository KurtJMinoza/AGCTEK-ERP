import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto'
import { nextSequentialCode } from '../shared/next-code'

@Injectable()
export class SupplierCategoryService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateSupplierCategoryDto) {
        const code = dto.code?.trim() || (await this.generateNextCode())
        const exists = await this.prisma.mmSupplierCategory.findFirst({
            where: { code, deletedAt: null },
        })
        if (exists) throw new ConflictException('Supplier category code already exists')

        const softDeleted = await this.prisma.mmSupplierCategory.findFirst({
            where: { code, deletedAt: { not: null } },
        })
        if (softDeleted) {
            return this.prisma.mmSupplierCategory.update({
                where: { id: softDeleted.id },
                data: {
                    name: dto.name,
                    description: dto.description ?? null,
                    sortOrder: dto.sortOrder ?? 0,
                    isActive: true,
                    deletedAt: null,
                },
            })
        }

        return this.prisma.mmSupplierCategory.create({
            data: {
                code,
                name: dto.name,
                description: dto.description ?? null,
                sortOrder: dto.sortOrder ?? 0,
            },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmSupplierCategory.findFirst({
            where: { code: { startsWith: 'SCAT-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'SCAT-')
    }

    async update(id: string, dto: Partial<CreateSupplierCategoryDto>) {
        const existing = await this.prisma.mmSupplierCategory.findFirst({
            where: { id, deletedAt: null },
        })
        if (!existing) throw new NotFoundException('Supplier category not found')

        const data: any = {}
        if (dto.name !== undefined) data.name = dto.name
        if (dto.description !== undefined) data.description = dto.description
        if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder
        // code is immutable

        return this.prisma.mmSupplierCategory.update({ where: { id }, data })
    }

    async findAll() {
        return this.prisma.mmSupplierCategory.findMany({
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
        })
    }

    async findOne(id: string) {
        const rec = await this.prisma.mmSupplierCategory.findFirst({ where: { id, deletedAt: null } })
        if (!rec) throw new NotFoundException('Supplier category not found')
        return rec
    }

    async softDelete(id: string) {
        const rec = await this.prisma.mmSupplierCategory.findFirst({ where: { id, deletedAt: null } })
        if (!rec) throw new NotFoundException('Supplier category not found')
        return this.prisma.mmSupplierCategory.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }
}
