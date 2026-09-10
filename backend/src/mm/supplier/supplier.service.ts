import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSupplierDto } from './dto/create-supplier.dto'
import { UpdateSupplierDto } from './dto/update-supplier.dto'
import { SupplierQueryDto } from './dto/supplier-query.dto'

const SUPPLIER_INCLUDES = {
    category: true,
    currency: true,
    paymentTerms: true,
    defaultWarehouse: true,
    company: true,
}

@Injectable()
export class SupplierService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreateSupplierDto) {
        const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } })
        if (!company) {
            throw new BadRequestException('Invalid company. Select a valid company.')
        }

        const code = await this.generateCode()
        const empty = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : null)

        try {
            return await this.prisma.mmSupplier.create({
                data: {
                    supplierCode: code,
                    supplierName: dto.supplierName.trim(),
                    legalName: empty(dto.legalName),
                    supplierType: empty(dto.supplierType),
                    taxId: empty(dto.taxId),
                    primaryContact: empty(dto.primaryContact),
                    email: empty(dto.email),
                    phone: empty(dto.phone),
                    website: empty(dto.website),
                    billingAddress: empty(dto.billingAddress),
                    shippingAddress: empty(dto.shippingAddress),
                    country: empty(dto.country),
                    region: empty(dto.region),
                    currencyId: empty(dto.currencyId),
                    paymentTermsId: empty(dto.paymentTermsId),
                    deliveryTerms: empty(dto.deliveryTerms),
                    defaultWarehouseId: empty(dto.defaultWarehouseId),
                    leadTimeDays: dto.leadTimeDays ?? null,
                    taxCode: empty(dto.taxCode),
                    taxStatus: empty(dto.taxStatus),
                    companyId: dto.companyId,
                    categoryId: empty(dto.categoryId),
                    status: 'DRAFT',
                    createdBy: empty(dto.createdBy),
                },
                include: SUPPLIER_INCLUDES,
            })
        } catch (err: any) {
            if (err?.code === 'P2003') {
                throw new BadRequestException(
                    'One or more related records are invalid (company, category, payment terms, warehouse, or currency).',
                )
            }
            if (err?.code === 'P2002') {
                throw new ConflictException('Supplier code already exists. Please retry.')
            }
            throw err
        }
    }

    async update(id: string, dto: UpdateSupplierDto, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)

        const data: any = {}
        for (const [key, value] of Object.entries(dto)) {
            if (value !== undefined) data[key] = value
        }

        const updated = await this.prisma.mmSupplier.update({
            where: { id },
            data,
            include: SUPPLIER_INCLUDES,
        })

        const changedFields = Object.keys(data)
        if (changedFields.length > 0) {
            await this.prisma.mmSupplierAudit.create({
                data: {
                    supplierId: id,
                    action: 'UPDATED',
                    field: changedFields.join(', '),
                    oldValue: JSON.stringify(
                        changedFields.reduce((acc, k) => ({ ...acc, [k]: (supplier as any)[k] }), {}),
                    ),
                    newValue: JSON.stringify(data),
                    performedBy,
                },
            })
        }

        return updated
    }

    async findAll(query: SupplierQueryDto) {
        const where: any = { deletedAt: null }
        if (query.status) where.status = query.status
        if (query.categoryId) where.categoryId = query.categoryId
        if (query.search) {
            where.OR = [
                { supplierCode: { contains: query.search, mode: 'insensitive' } },
                { supplierName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
            ]
        }

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmSupplier.findMany({
                where,
                include: SUPPLIER_INCLUDES,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmSupplier.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return this.findOneOrFail(id)
    }

    async submitForReview(id: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status !== 'DRAFT') {
            throw new BadRequestException(`Cannot submit: supplier is ${supplier.status}`)
        }
        await this.audit(id, 'STATUS_CHANGE', 'status', supplier.status, 'PENDING_REVIEW', performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { status: 'PENDING_REVIEW' },
            include: SUPPLIER_INCLUDES,
        })
    }

    async approve(id: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status !== 'PENDING_REVIEW') {
            throw new BadRequestException(`Cannot approve: supplier is ${supplier.status}`)
        }
        await this.audit(id, 'STATUS_CHANGE', 'status', supplier.status, 'APPROVED', performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { status: 'APPROVED' },
            include: SUPPLIER_INCLUDES,
        })
    }

    async activate(id: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status !== 'APPROVED' && supplier.status !== 'INACTIVE') {
            throw new BadRequestException(`Cannot activate: supplier is ${supplier.status}`)
        }
        await this.audit(id, 'STATUS_CHANGE', 'status', supplier.status, 'ACTIVE', performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { status: 'ACTIVE' },
            include: SUPPLIER_INCLUDES,
        })
    }

    async deactivate(id: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status !== 'ACTIVE') {
            throw new BadRequestException(`Cannot deactivate: supplier is ${supplier.status}`)
        }
        await this.audit(id, 'STATUS_CHANGE', 'status', supplier.status, 'INACTIVE', performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { status: 'INACTIVE' },
            include: SUPPLIER_INCLUDES,
        })
    }

    async block(id: string, reason?: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status === 'BLOCKED') {
            throw new BadRequestException('Supplier is already blocked')
        }
        await this.audit(id, 'BLOCKED', 'status', supplier.status, 'BLOCKED', performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { status: 'BLOCKED', blockReason: reason ?? null },
            include: SUPPLIER_INCLUDES,
        })
    }

    async unblock(id: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status !== 'BLOCKED') {
            throw new BadRequestException(`Cannot unblock: supplier is ${supplier.status}`)
        }
        await this.audit(id, 'UNBLOCKED', 'status', supplier.status, 'ACTIVE', performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { status: 'ACTIVE', blockReason: null },
            include: SUPPLIER_INCLUDES,
        })
    }

    async softDelete(id: string, performedBy?: string) {
        const supplier = await this.findOneOrFail(id)
        if (supplier.status !== 'DRAFT' && supplier.status !== 'INACTIVE') {
            throw new BadRequestException(`Cannot delete: supplier is ${supplier.status}`)
        }
        await this.audit(id, 'DELETED', null, null, null, performedBy)
        return this.prisma.mmSupplier.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    async getAuditTrail(supplierId: string) {
        return this.prisma.mmSupplierAudit.findMany({
            where: { supplierId },
            orderBy: { performedAt: 'desc' },
        })
    }

    async listDocuments(supplierId: string) {
        await this.findOneOrFail(supplierId)
        return this.prisma.mmSupplierDocument.findMany({
            where: { supplierId },
            orderBy: { uploadedAt: 'desc' },
        })
    }

    async addDocument(
        supplierId: string,
        data: {
            fileName: string
            fileUrl?: string
            storageKey?: string
            mimeType?: string
            docType?: string
            uploadedBy?: string
        },
    ) {
        await this.findOneOrFail(supplierId)
        if (!data.fileName?.trim()) {
            throw new BadRequestException('fileName is required')
        }
        return this.prisma.mmSupplierDocument.create({
            data: {
                supplierId,
                fileName: data.fileName.trim(),
                fileUrl: data.fileUrl ?? null,
                storageKey: data.storageKey ?? null,
                mimeType: data.mimeType ?? null,
                docType: data.docType ?? null,
                uploadedBy: data.uploadedBy ?? null,
            },
        })
    }

    async removeDocument(supplierId: string, documentId: string) {
        await this.findOneOrFail(supplierId)
        const doc = await this.prisma.mmSupplierDocument.findFirst({
            where: { id: documentId, supplierId },
        })
        if (!doc) throw new NotFoundException('Document not found')
        return this.prisma.mmSupplierDocument.delete({ where: { id: documentId } })
    }

    private async findOneOrFail(id: string) {
        const supplier = await this.prisma.mmSupplier.findFirst({
            where: { id, deletedAt: null },
            include: SUPPLIER_INCLUDES,
        })
        if (!supplier) throw new NotFoundException('Supplier not found')
        return supplier
    }

    private async audit(
        supplierId: string,
        action: string,
        field: string | null,
        oldValue: string | null,
        newValue: string | null,
        performedBy?: string,
    ) {
        await this.prisma.mmSupplierAudit.create({
            data: {
                supplierId,
                action,
                field,
                oldValue,
                newValue,
                performedBy: performedBy ?? null,
            },
        })
    }

    private async generateCode(): Promise<string> {
        const prefix = 'SUP-'
        const last = await this.prisma.mmSupplier.findFirst({
            where: { supplierCode: { startsWith: prefix } },
            orderBy: { supplierCode: 'desc' },
        })

        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.supplierCode.replace(prefix, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }

        return `${prefix}${String(seq).padStart(5, '0')}`
    }
}
