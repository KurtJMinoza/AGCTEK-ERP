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
    CreateContractReleaseDto,
} from './dto/purchase-contract.dto'
import { assertSupplierProcurementById } from '../procurement/assert-supplier-procurement'

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
        await assertSupplierProcurementById(this.prisma, dto.supplierId, {
            companyId: dto.companyId,
            purpose: 'CONTRACT',
        })

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
            contractQuantity: new Decimal(l.contractQuantity ?? 0),
            releasedQuantity: new Decimal(0),
            negotiatedPrice: new Decimal(l.negotiatedPrice),
            moq: l.moq != null ? new Decimal(l.moq) : null,
            leadTimeDays: l.leadTimeDays ?? null,
            remarks: l.remarks ?? null,
        }))

        const contract = await this.prisma.mmPurchaseContract.create({
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
        await this.audit(contract.id, 'CREATED', null, null, contract.contractNumber, dto.createdBy)
        return contract
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
                    contractQuantity: new Decimal(l.contractQuantity ?? 0),
                    releasedQuantity: new Decimal(0),
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
        const updated = await this.prisma.mmPurchaseContract.update({
            where: { id },
            data: { status: 'ACTIVE', activatedAt: new Date() },
            include: CONTRACT_INCLUDES,
        })
        await this.audit(id, 'ACTIVATED', 'status', row.status, 'ACTIVE')
        return updated
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

    async release(id: string, dto: CreateContractReleaseDto) {
        const contract = await this.findOne(id)
        if (contract.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Cannot release from contract in status ${contract.status}`,
            )
        }

        const now = new Date()
        if (contract.validFrom > now) {
            throw new BadRequestException('Contract is not yet valid')
        }
        if (contract.validTo && contract.validTo < now) {
            throw new BadRequestException('Contract has expired')
        }

        await assertSupplierProcurementById(this.prisma, contract.supplierId, {
            companyId: contract.companyId,
            purpose: 'CONTRACT',
        })

        if (!dto.lines?.length) {
            throw new BadRequestException('At least one release line is required')
        }

        const lineMap = new Map(contract.lines.map((l) => [l.id, l]))
        const releaseNumber = await this.generateReleaseNumber()

        return this.prisma.$transaction(async (tx) => {
            const release = await tx.mmPurchaseContractRelease.create({
                data: {
                    releaseNumber,
                    contractId: id,
                    releasedBy: dto.releasedBy ?? null,
                    notes: dto.notes ?? null,
                    lines: {
                        create: dto.lines.map((rl) => {
                            const cl = lineMap.get(rl.contractLineId)
                            if (!cl) {
                                throw new BadRequestException(
                                    `Contract line ${rl.contractLineId} not found`,
                                )
                            }
                            const qty = new Decimal(rl.quantity)
                            const remaining = new Decimal(cl.contractQuantity).minus(
                                cl.releasedQuantity,
                            )
                            if (qty.lte(0)) {
                                throw new BadRequestException('Release quantity must be positive')
                            }
                            if (qty.gt(remaining)) {
                                throw new BadRequestException(
                                    `Release qty ${qty} exceeds remaining ${remaining} on line ${cl.lineNumber}`,
                                )
                            }
                            if (cl.moq && qty.lt(cl.moq)) {
                                throw new BadRequestException(
                                    `Release qty ${qty} below MOQ ${cl.moq} on line ${cl.lineNumber}`,
                                )
                            }
                            return {
                                contractLineId: rl.contractLineId,
                                quantity: qty,
                            }
                        }),
                    },
                },
                include: { lines: true },
            })

            const poLines: Array<{
                lineNumber: number
                materialId: string
                description: string
                quantity: Decimal
                uomId: string
                unitPrice: Decimal
                lineTotal: Decimal
            }> = []

            let lineNo = 1
            let totalAmount = new Decimal(0)
            for (const rl of dto.lines) {
                const cl = lineMap.get(rl.contractLineId)!
                const qty = new Decimal(rl.quantity)
                const unitPrice = new Decimal(cl.negotiatedPrice)
                const lineTotal = qty.mul(unitPrice)
                totalAmount = totalAmount.plus(lineTotal)

                await tx.mmPurchaseContractLine.update({
                    where: { id: cl.id },
                    data: {
                        releasedQuantity: new Decimal(cl.releasedQuantity).plus(qty),
                    },
                })

                poLines.push({
                    lineNumber: lineNo++,
                    materialId: cl.materialId,
                    description: cl.remarks ?? '',
                    quantity: qty,
                    uomId: cl.uomId,
                    unitPrice,
                    lineTotal,
                })
            }

            const poNumber = await this.generatePoNumber(tx)
            const po = await tx.mmPurchaseOrder.create({
                data: {
                    poNumber,
                    companyId: contract.companyId,
                    supplierId: contract.supplierId,
                    buyerId: dto.buyerId,
                    currencyId: contract.currencyId,
                    paymentTermsId: contract.paymentTermsId,
                    deliveryTerms: contract.deliveryTerms,
                    warehouseId: dto.warehouseId ?? null,
                    status: 'DRAFT',
                    totalAmount,
                    purchaseContractId: id,
                    contractReleaseId: release.id,
                    createdBy: dto.releasedBy ?? null,
                    lines: { create: poLines },
                },
                include: {
                    lines: true,
                    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                },
            })

            await tx.mmPurchaseContractAudit.create({
                data: {
                    contractId: id,
                    action: 'RELEASED',
                    newValue: releaseNumber,
                    performedBy: dto.releasedBy ?? null,
                    details: {
                        releaseId: release.id,
                        purchaseOrderId: po.id,
                        poNumber: po.poNumber,
                        lines: dto.lines.map((l) => ({
                            contractLineId: l.contractLineId,
                            quantity: l.quantity,
                        })),
                    },
                },
            })

            return { release, purchaseOrder: po }
        })
    }

    async getAudit(id: string) {
        await this.findOne(id)
        return this.prisma.mmPurchaseContractAudit.findMany({
            where: { contractId: id },
            orderBy: { performedAt: 'desc' },
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

    private async generateReleaseNumber() {
        const prefix = `PCR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
        const count = await this.prisma.mmPurchaseContractRelease.count({
            where: { releaseNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }

    private async generatePoNumber(tx: { mmPurchaseOrder: { findFirst: Function } }) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `PO-${dateStr}-`
        const last = await tx.mmPurchaseOrder.findFirst({
            where: { poNumber: { startsWith: pfx } },
            orderBy: { poNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.poNumber.replace(pfx, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }

    private async audit(
        contractId: string,
        action: string,
        field?: string | null,
        oldValue?: string | null,
        newValue?: string | null,
        performedBy?: string | null,
        details?: any,
    ) {
        await this.prisma.mmPurchaseContractAudit.create({
            data: {
                contractId,
                action,
                field: field ?? null,
                oldValue: oldValue ?? null,
                newValue: newValue ?? null,
                performedBy: performedBy ?? null,
                details: details ?? undefined,
            },
        })
    }
}
