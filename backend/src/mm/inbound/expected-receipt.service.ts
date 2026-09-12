import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
    CreateAsnDto,
    CreateExpectedReceiptFromAsnDto,
    CreateExpectedReceiptFromPoDto,
    InboundQueryDto,
} from './dto/inbound.dto'
import { Decimal } from '@prisma/client/runtime/library'

const ASN_INCLUDES = {
    lines: {
        include: {
            material: { select: { id: true, materialCode: true, materialName: true } },
            uom: { select: { id: true, code: true, name: true } },
        },
    },
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    purchaseOrder: { select: { id: true, poNumber: true, status: true } },
    warehouse: { select: { id: true, code: true, name: true } },
    company: { select: { id: true, name: true } },
}

const ER_INCLUDES = {
    lines: {
        include: {
            material: {
                select: {
                    id: true,
                    materialCode: true,
                    materialName: true,
                    batchManaged: true,
                    serialManaged: true,
                    qualityInspectionRequired: true,
                },
            },
            uom: { select: { id: true, code: true, name: true } },
        },
    },
    supplier: { select: { id: true, supplierCode: true, supplierName: true } },
    purchaseOrder: { select: { id: true, poNumber: true, status: true } },
    asn: { select: { id: true, asnNumber: true } },
    warehouse: { select: { id: true, code: true, name: true } },
    company: { select: { id: true, name: true } },
    goodsReceipts: { select: { id: true, documentNumber: true, status: true } },
}

@Injectable()
export class ExpectedReceiptService {
    constructor(private prisma: PrismaService) {}

    async createAsn(dto: CreateAsnDto) {
        if (!dto.lines?.length) throw new BadRequestException('ASN requires lines')

        let poLineByMaterial = new Map<string, string>()
        if (dto.purchaseOrderId) {
            const po = await this.prisma.mmPurchaseOrder.findUnique({
                where: { id: dto.purchaseOrderId },
                include: { lines: true },
            })
            if (!po) throw new BadRequestException('Purchase order not found')
            for (const pl of po.lines) {
                if (!poLineByMaterial.has(pl.materialId)) {
                    poLineByMaterial.set(pl.materialId, pl.id)
                }
            }
        }

        const asnNumber = await this.nextNumber('ASN', 'mmAsn', 'asnNumber')
        return this.prisma.mmAsn.create({
            data: {
                asnNumber,
                companyId: dto.companyId,
                supplierId: dto.supplierId,
                purchaseOrderId: dto.purchaseOrderId ?? null,
                warehouseId: dto.warehouseId ?? null,
                shipmentNumber: dto.shipmentNumber ?? null,
                supplierReference: dto.supplierReference ?? null,
                packageCount: dto.packageCount != null ? dto.packageCount : null,
                carrier: dto.carrier ?? null,
                trackingNumber: dto.trackingNumber ?? null,
                expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
                remarks: dto.remarks ?? null,
                createdBy: dto.createdBy ?? null,
                status: 'DRAFT',
                lines: {
                    create: dto.lines.map((l) => ({
                        materialId: l.materialId,
                        quantity: new Decimal(l.quantity),
                        uomId: l.uomId,
                        purchaseOrderLineId:
                            l.purchaseOrderLineId ??
                            poLineByMaterial.get(l.materialId) ??
                            null,
                        batchNumber: l.batchNumber ?? null,
                        serialNumber: l.serialNumber ?? null,
                        packageType: l.packageType ?? null,
                        grossWeight: l.grossWeight != null ? new Decimal(l.grossWeight) : null,
                        remarks: l.remarks ?? null,
                    })),
                },
            },
            include: ASN_INCLUDES,
        })
    }

    async confirmAsn(id: string) {
        const asn = await this.getAsn(id)
        if (asn.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot confirm ASN in status ${asn.status}`)
        }
        if (!asn.lines?.length) {
            throw new BadRequestException('ASN has no lines')
        }
        return this.prisma.mmAsn.update({
            where: { id },
            data: { status: 'CONFIRMED' },
            include: ASN_INCLUDES,
        })
    }

    async cancelAsn(id: string) {
        const asn = await this.getAsn(id)
        if (!['DRAFT', 'CONFIRMED'].includes(asn.status)) {
            throw new BadRequestException(`Cannot cancel ASN in status ${asn.status}`)
        }
        const openEr = await this.prisma.mmExpectedReceipt.count({
            where: {
                asnId: id,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
            },
        })
        if (openEr > 0) {
            throw new BadRequestException(
                'Cannot cancel ASN with open expected receipts',
            )
        }
        return this.prisma.mmAsn.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: ASN_INCLUDES,
        })
    }

    async listAsns(query: InboundQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.search) {
            where.OR = [
                { asnNumber: { contains: query.search, mode: 'insensitive' } },
                { shipmentNumber: { contains: query.search, mode: 'insensitive' } },
                { trackingNumber: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmAsn.findMany({
                where,
                include: ASN_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmAsn.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async getAsn(id: string) {
        const asn = await this.prisma.mmAsn.findUnique({ where: { id }, include: ASN_INCLUDES })
        if (!asn) throw new NotFoundException('ASN not found')
        return asn
    }

    async createFromPo(dto: CreateExpectedReceiptFromPoDto) {
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: dto.purchaseOrderId },
            include: { lines: true, supplier: true },
        })
        if (!po) throw new NotFoundException('Purchase order not found')
        const ok = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED']
        if (!ok.includes(po.status)) {
            throw new BadRequestException(`Cannot create expected receipt from PO in status ${po.status}`)
        }
        const warehouseId = dto.warehouseId ?? po.warehouseId
        if (!warehouseId) throw new BadRequestException('Warehouse is required')

        const openLines = po.lines.filter((l) =>
            new Decimal(l.quantity).minus(l.receivedQuantity).gt(0),
        )
        if (openLines.length === 0) {
            throw new BadRequestException('PO has no open quantity to receive')
        }

        const documentNumber = await this.nextNumber('ER', 'mmExpectedReceipt', 'documentNumber')
        return this.prisma.mmExpectedReceipt.create({
            data: {
                documentNumber,
                companyId: po.companyId,
                supplierId: po.supplierId,
                purchaseOrderId: po.id,
                warehouseId,
                expectedDate: dto.expectedDate
                    ? new Date(dto.expectedDate)
                    : po.expectedDeliveryDate,
                status: 'OPEN',
                sourceType: 'PO',
                createdBy: dto.createdBy ?? null,
                lines: {
                    create: openLines.map((l) => ({
                        materialId: l.materialId,
                        expectedQuantity: new Decimal(l.quantity).minus(l.receivedQuantity),
                        uomId: l.uomId,
                        purchaseOrderLineId: l.id,
                        status: 'OPEN',
                    })),
                },
            },
            include: ER_INCLUDES,
        })
    }

    async createFromAsn(dto: CreateExpectedReceiptFromAsnDto) {
        const asn = await this.prisma.mmAsn.findUnique({
            where: { id: dto.asnId },
            include: { lines: true },
        })
        if (!asn) throw new NotFoundException('ASN not found')
        if (asn.status !== 'CONFIRMED') {
            throw new BadRequestException(
                `ASN must be CONFIRMED to create expected receipt (status ${asn.status})`,
            )
        }
        const warehouseId = dto.warehouseId ?? asn.warehouseId
        if (!warehouseId) throw new BadRequestException('Warehouse is required')

        const documentNumber = await this.nextNumber('ER', 'mmExpectedReceipt', 'documentNumber')
        return this.prisma.mmExpectedReceipt.create({
            data: {
                documentNumber,
                companyId: asn.companyId,
                supplierId: asn.supplierId,
                purchaseOrderId: asn.purchaseOrderId,
                asnId: asn.id,
                warehouseId,
                expectedDate: asn.expectedDate,
                status: 'OPEN',
                sourceType: 'ASN',
                createdBy: dto.createdBy ?? null,
                lines: {
                    create: asn.lines.map((l) => ({
                        materialId: l.materialId,
                        expectedQuantity: l.quantity,
                        uomId: l.uomId,
                        purchaseOrderLineId: l.purchaseOrderLineId,
                        asnLineId: l.id,
                        status: 'OPEN',
                    })),
                },
            },
            include: ER_INCLUDES,
        })
    }

    async list(query: InboundQueryDto) {
        const where: any = {}
        if (query.status) where.status = query.status
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.search) {
            where.OR = [
                { documentNumber: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        const [data, total] = await Promise.all([
            this.prisma.mmExpectedReceipt.findMany({
                where,
                include: ER_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmExpectedReceipt.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const er = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id },
            include: ER_INCLUDES,
        })
        if (!er) throw new NotFoundException('Expected receipt not found')
        return er
    }

    private async nextNumber(
        prefix: string,
        model: 'mmAsn' | 'mmExpectedReceipt',
        field: 'asnNumber' | 'documentNumber',
    ) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const pfx = `${prefix}-${today}-`
        const last = await (this.prisma as any)[model].findFirst({
            where: { [field]: { startsWith: pfx } },
            orderBy: { [field]: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(String(last[field]).replace(pfx, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${pfx}${String(seq).padStart(5, '0')}`
    }
}
