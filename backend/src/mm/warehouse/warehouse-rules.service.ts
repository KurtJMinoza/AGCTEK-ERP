import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    CreatePutawayRuleDto,
    CreatePickingRuleDto,
    UpdatePutawayRuleDto,
    UpdatePickingRuleDto,
} from './dto/warehouse-rules.dto'

@Injectable()
export class WarehouseRulesService {
    constructor(private prisma: PrismaService) {}

    listPutawayRules(warehouseId?: string) {
        return this.prisma.wmPutawayRule.findMany({
            where: warehouseId ? { warehouseId } : undefined,
            include: { warehouse: true, storageType: true },
            orderBy: [{ warehouseId: 'asc' }, { priority: 'asc' }, { code: 'asc' }],
        })
    }

    async createPutawayRule(dto: CreatePutawayRuleDto) {
        return this.prisma.wmPutawayRule.create({
            data: {
                warehouseId: dto.warehouseId,
                code: dto.code.trim().toUpperCase(),
                name: dto.name,
                strategyCode: dto.strategyCode ?? 'CAPACITY_BASED',
                priority: dto.priority ?? 100,
                storageTypeId: dto.storageTypeId ?? null,
                enforceBinCapacity: dto.enforceBinCapacity ?? true,
                isActive: dto.isActive ?? true,
                notes: dto.notes ?? null,
            },
            include: { warehouse: true, storageType: true },
        })
    }

    async updatePutawayRule(id: string, dto: UpdatePutawayRuleDto) {
        await this.ensurePutawayRule(id)
        return this.prisma.wmPutawayRule.update({
            where: { id },
            data: {
                ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
                ...(dto.name ? { name: dto.name } : {}),
                ...(dto.strategyCode ? { strategyCode: dto.strategyCode } : {}),
                ...(dto.priority != null ? { priority: dto.priority } : {}),
                ...(dto.storageTypeId !== undefined
                    ? { storageTypeId: dto.storageTypeId || null }
                    : {}),
                ...(dto.enforceBinCapacity != null
                    ? { enforceBinCapacity: dto.enforceBinCapacity }
                    : {}),
                ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
                ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
            },
            include: { warehouse: true, storageType: true },
        })
    }

    async deletePutawayRule(id: string) {
        await this.ensurePutawayRule(id)
        return this.prisma.wmPutawayRule.delete({ where: { id } })
    }

    listPickingRules(warehouseId?: string) {
        return this.prisma.wmPickingRule.findMany({
            where: warehouseId ? { warehouseId } : undefined,
            include: { warehouse: true },
            orderBy: [{ warehouseId: 'asc' }, { priority: 'asc' }, { code: 'asc' }],
        })
    }

    async createPickingRule(dto: CreatePickingRuleDto) {
        return this.prisma.wmPickingRule.create({
            data: {
                warehouseId: dto.warehouseId,
                code: dto.code.trim().toUpperCase(),
                name: dto.name,
                strategyCode: dto.strategyCode ?? 'FIFO',
                priority: dto.priority ?? 100,
                isActive: dto.isActive ?? true,
                notes: dto.notes ?? null,
            },
            include: { warehouse: true },
        })
    }

    async updatePickingRule(id: string, dto: UpdatePickingRuleDto) {
        await this.ensurePickingRule(id)
        return this.prisma.wmPickingRule.update({
            where: { id },
            data: {
                ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
                ...(dto.name ? { name: dto.name } : {}),
                ...(dto.strategyCode ? { strategyCode: dto.strategyCode } : {}),
                ...(dto.priority != null ? { priority: dto.priority } : {}),
                ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
                ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
            },
            include: { warehouse: true },
        })
    }

    async deletePickingRule(id: string) {
        await this.ensurePickingRule(id)
        return this.prisma.wmPickingRule.delete({ where: { id } })
    }

    async resolvePutawayStrategy(warehouseId: string): Promise<string> {
        const rule = await this.prisma.wmPutawayRule.findFirst({
            where: { warehouseId, isActive: true },
            orderBy: { priority: 'asc' },
        })
        return rule?.strategyCode ?? 'CAPACITY_BASED'
    }

    async resolvePickingStrategy(warehouseId: string): Promise<string> {
        const rule = await this.prisma.wmPickingRule.findFirst({
            where: { warehouseId, isActive: true },
            orderBy: { priority: 'asc' },
        })
        return rule?.strategyCode ?? 'FIFO'
    }

    private async ensurePutawayRule(id: string) {
        const row = await this.prisma.wmPutawayRule.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Putaway rule not found')
        return row
    }

    private async ensurePickingRule(id: string) {
        const row = await this.prisma.wmPickingRule.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Picking rule not found')
        return row
    }
}
