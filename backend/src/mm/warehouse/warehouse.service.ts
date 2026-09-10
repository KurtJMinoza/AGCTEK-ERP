import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateWarehouseDto } from './dto/create-warehouse.dto'
import { UpdateWarehouseDto } from './dto/update-warehouse.dto'
import { WarehouseQueryDto } from './dto/warehouse-query.dto'

@Injectable()
export class WarehouseService {
    constructor(private prisma: PrismaService) {}

    private readonly includes = {
        company: true,
        plant: true,
        branch: true,
        storageTypes: { where: { deletedAt: null } },
    }

    async findAll(query: WarehouseQueryDto) {
        const {
            page = 1,
            limit = 20,
            search,
            companyId,
            status,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const where: any = { deletedAt: null }

        if (search) {
            where.OR = [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
            ]
        }
        if (companyId) where.companyId = companyId
        if (status) where.status = status

        const [data, total] = await Promise.all([
            this.prisma.warehouse.findMany({
                where,
                include: this.includes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.warehouse.count({ where }),
        ])

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    async findOne(id: string) {
        const warehouse = await this.prisma.warehouse.findFirst({
            where: { id, deletedAt: null },
            include: {
                ...this.includes,
                audits: { orderBy: { performedAt: 'desc' }, take: 50 },
            },
        })
        if (!warehouse) throw new NotFoundException('Warehouse not found')
        return warehouse
    }

    async create(dto: CreateWarehouseDto) {
        const company = await this.prisma.company.findUnique({
            where: { id: dto.companyId },
        })
        if (!company) {
            throw new BadRequestException('Company not found. Select a valid company.')
        }

        const code = dto.code || (await this.generateNextCode())
        await this.assertUniqueCode(code)

        const warehouse = await this.prisma.warehouse.create({
            data: {
                ...dto,
                code,
                warehouseType: dto.warehouseType || 'GENERAL',
                status: dto.status || 'ACTIVE',
            } as any,
            include: this.includes,
        })

        await this.writeAudit(warehouse.id, 'WAREHOUSE', warehouse.id, 'CREATE', warehouse)
        return warehouse
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.warehouse.findFirst({
            where: { code: { startsWith: 'WH-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.code.replace('WH-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `WH-${String(seq).padStart(6, '0')}`
    }

    async update(id: string, dto: UpdateWarehouseDto) {
        const existing = await this.findOne(id)
        delete (dto as any).code

        const updated = await this.prisma.warehouse.update({
            where: { id },
            data: dto as any,
            include: this.includes,
        })

        const changes = this.diffChanges(existing, updated)
        if (Object.keys(changes).length > 0) {
            await this.writeAudit(id, 'WAREHOUSE', id, 'UPDATE', changes)
        }
        return updated
    }

    async activate(id: string) {
        const warehouse = await this.findOne(id)
        if (warehouse.status === 'ACTIVE') {
            throw new BadRequestException('Warehouse is already active')
        }
        const updated = await this.prisma.warehouse.update({
            where: { id },
            data: { status: 'ACTIVE' },
            include: this.includes,
        })
        await this.writeAudit(id, 'WAREHOUSE', id, 'ACTIVATE', {
            status: { old: warehouse.status, new: 'ACTIVE' },
        })
        return updated
    }

    async deactivate(id: string) {
        const warehouse = await this.findOne(id)
        if (warehouse.status === 'INACTIVE') {
            throw new BadRequestException('Warehouse is already inactive')
        }
        const updated = await this.prisma.warehouse.update({
            where: { id },
            data: { status: 'INACTIVE' },
            include: this.includes,
        })
        await this.writeAudit(id, 'WAREHOUSE', id, 'DEACTIVATE', {
            status: { old: warehouse.status, new: 'INACTIVE' },
        })
        return updated
    }

    async softDelete(id: string) {
        await this.findOne(id)
        const activeTypes = await this.prisma.wmStorageType.count({
            where: { warehouseId: id, deletedAt: null, status: 'ACTIVE' },
        })
        if (activeTypes > 0) {
            throw new BadRequestException(
                'Cannot delete warehouse with active storage types',
            )
        }
        return this.prisma.warehouse.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    private async assertUniqueCode(code: string, excludeId?: string) {
        const existing = await this.prisma.warehouse.findFirst({
            where: {
                code: { equals: code, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException('Warehouse code already exists')
        }
    }

    private diffChanges(oldObj: any, newObj: any): Record<string, { old: any; new: any }> {
        const skip = new Set([
            'id', 'createdAt', 'updatedAt', 'deletedAt',
            'company', 'storageTypes', 'audits', 'materials',
        ])
        const changes: Record<string, { old: any; new: any }> = {}
        for (const key of Object.keys(newObj)) {
            if (skip.has(key)) continue
            if (String(oldObj[key]) !== String(newObj[key])) {
                changes[key] = { old: oldObj[key], new: newObj[key] }
            }
        }
        return changes
    }

    async writeAudit(
        warehouseId: string,
        entityType: string,
        entityId: string,
        action: string,
        changes: any,
    ) {
        await this.prisma.wmWarehouseAudit.create({
            data: { warehouseId, entityType, entityId, action, changes },
        })
    }
}
