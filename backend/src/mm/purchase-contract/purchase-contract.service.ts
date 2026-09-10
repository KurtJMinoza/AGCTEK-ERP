import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    CreatePurchaseContractDto,
    UpdatePurchaseContractDto,
    PurchaseContractQueryDto,
} from './dto/purchase-contract.dto'

const CONTRACT_INCLUDES = {
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    company: { select: { id: true, name: true, code: true } },
    currency: { select: { id: true, code: true, name: true } },
    paymentTerms: { select: { id: true, code: true, name: true } },
    materialCategory: { select: { id: true, code: true, name: true } },
    purchaseOrder: { select: { id: true, poNumber: true, status: true } },
    lines: {
        include: {
            material: {
                select: { id: true, materialCode: true, materialName: true },
            },
            uom: { select: { id: true, code: true, name: true } },
        },
        orderBy: { lineNumber: 'asc' as const },
    },
}

/**
 * Purchase contracts hold commercial terms only.
 * Never posts inventory or mutates stock balances.
 */
@Injectable()
export class PurchaseContractService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreatePurchaseContractDto) {
        const { assertSupplierUsableById } = await import(
            '../supplier/assert-supplier-usable'
        )
        await assertSupplierUsableById(this.prisma, dto.supplierId)

        if (dto.lines?.length) {
            const { assertPurchasableMaterials } = await import(
                '../materials/assert-purchasable-materials'
            )
            await assertPurchasableMaterials(
                this.prisma,
                dto.lines.map((l) => l.materialId),
            )
        }

        if (dto.purchaseOrderId) {
            const po = await this.prisma.mmPurchaseOrder.findUnique({
                where: { id: dto.purchaseOrderId },
            })
            if (!po) throw new BadRequestException('Purchase order not found')
            if (po.supplierId !== dto.supplierId) {
                throw new BadRequestException(
                    'Contract supplier must match linked PO supplier',
                )
            }
        }

        const contractNumber = await this.generateNumber()
        const lines = (dto.lines ?? []).map((l, i) => ({
            lineNumber: i + 1,
            materialId: l.materialId,
            uomId: l.uomId,
            negotiatedPrice: new Decimal(l.negotiatedPrice),
            moq: l.moq != null ? new Decimal(l.moq) : null,
            leadTimeDays: l.leadTimeDays ?? null,
            remarks: l.remarks ?? null,
        }))

        return this.prisma.mmPurchaseContract.create({
            data: {
                contractNumber,
                companyId: dto.companyId,
                supplierId: dto.supplierId,
                buyerId: dto.buyerId,
                status: 'DRAFT',
                validFrom: new Date(dto.validFrom),
                validTo: dto.validTo ? new Date(dto.validTo) : null,
                currencyId: dto.currencyId ?? null,
                paymentTermsId: dto.paymentTermsId ?? null,
                deliveryTerms: dto.deliveryTerms ?? null,
                materialCategoryId: dto.materialCategoryId ?? null,
                purchaseOrderId: dto.purchaseOrderId ?? null,
                notes: dto.notes ?? null,
                createdBy: dto.createdBy ?? null,
                lines: lines.length ? { create: lines } : undefined,
            },
            include: CONTRACT_INCLUDES,
        })
    }

    async findAll(query: PurchaseContractQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.status) where.status = query.status
        if (query.search) {
            where.OR = [
                {
                    contractNumber: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
                { notes: { contains: query.search, mode: 'insensitive' } },
                { buyerId: { contains: query.search, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.mmPurchaseContract.findMany({
                where,
                include: CONTRACT_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmPurchaseContract.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const row = await this.prisma.mmPurchaseContract.findUnique({
            where: { id },
            include: CONTRACT_INCLUDES,
        })
        if (!row) throw new NotFoundException('Purchase contract not found')
        return row
    }

    async update(id: string, dto: UpdatePurchaseContractDto) {
        const existing = await this.findOne(id)
        if (existing.status !== 'DRAFT') {
            throw new BadRequestException(
                `Cannot update contract in status ${existing.status}`,
            )
        }

        if (dto.purchaseOrderId) {
            const po = await this.prisma.mmPurchaseOrder.findUnique({
                where: { id: dto.purchaseOrderId },
            })
            if (!po) throw new BadRequestException('Purchase order not found')
            if (po.supplierId !== existing.supplierId) {
                throw new BadRequestException(
                    'Contract supplier must match linked PO supplier',
                )
            }
        }

        const data: any = {}
        for (const key of [
            'buyerId',
            'currencyId',
            'paymentTermsId',
            'deliveryTerms',
            'materialCategoryId',
            'purchaseOrderId',
            'notes',
        ] as const) {
            if (dto[key] !== undefined) data[key] = dto[key]
        }
        if (dto.validFrom) data.validFrom = new Date(dto.validFrom)
        if (dto.validTo !== undefined) {
            data.validTo = dto.validTo ? new Date(dto.validTo) : null
        }

        if (dto.lines) {
            await this.prisma.mmPurchaseContractLine.deleteMany({
                where: { contractId: id },
            })
            data.lines = {
                create: dto.lines.map((l, i) => ({
                    lineNumber: i + 1,
                    materialId: l.materialId,
                    uomId: l.uomId,
                    negotiatedPrice: new Decimal(l.negotiatedPrice),
                    moq: l.moq != null ? new Decimal(l.moq) : null,
                    leadTimeDays: l.leadTimeDays ?? null,
                    remarks: l.remarks ?? null,
                })),
            }
        }

        return this.prisma.mmPurchaseContract.update({
            where: { id },
            data,
            include: CONTRACT_INCLUDES,
        })
    }

    async activate(id: string) {
        const row = await this.findOne(id)
        if (row.status !== 'DRAFT' && row.status !== 'EXPIRED') {
            throw new BadRequestException(
                `Cannot activate contract in status ${row.status}`,
            )
        }
        return this.prisma.mmPurchaseContract.update({
            where: { id },
            data: { status: 'ACTIVE', activatedAt: new Date() },
            include: CONTRACT_INCLUDES,
        })
    }

    async expire(id: string) {
        const row = await this.findOne(id)
        if (row.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Cannot expire contract in status ${row.status}`,
            )
        }
        return this.prisma.mmPurchaseContract.update({
            where: { id },
            data: { status: 'EXPIRED' },
            include: CONTRACT_INCLUDES,
        })
    }

    async cancel(id: string, reason?: string) {
        const row = await this.findOne(id)
        if (!['DRAFT', 'ACTIVE'].includes(row.status)) {
            throw new BadRequestException(
                `Cannot cancel contract in status ${row.status}`,
            )
        }
        return this.prisma.mmPurchaseContract.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelReason: reason ?? null,
            },
            include: CONTRACT_INCLUDES,
        })
    }

    async linkPurchaseOrder(id: string, purchaseOrderId: string) {
        const row = await this.findOne(id)
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: purchaseOrderId },
        })
        if (!po) throw new NotFoundException('Purchase order not found')
        if (po.supplierId !== row.supplierId) {
            throw new BadRequestException(
                'Contract supplier must match linked PO supplier',
            )
        }
        return this.prisma.mmPurchaseContract.update({
            where: { id },
            data: { purchaseOrderId },
            include: CONTRACT_INCLUDES,
        })
    }

    private async generateNumber() {
        const prefix = `PC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
        const count = await this.prisma.mmPurchaseContract.count({
            where: { contractNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }
}
