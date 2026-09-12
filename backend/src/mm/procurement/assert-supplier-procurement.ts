import { BadRequestException, NotFoundException } from '@nestjs/common'

export type SupplierProcurementContext = {
    companyId: string
    purpose?: 'PO' | 'RFQ_INVITE' | 'CONTRACT' | 'QUOTATION'
}

export type SupplierProcurementRecord = {
    id: string
    status: string
    deletedAt?: Date | null
    supplierCode?: string | null
    companyId?: string
    sourcingType?: string | null
    documents?: Array<{
        id: string
        expiresAt?: Date | null
        isRequiredForPurchasing?: boolean
        docType?: string | null
    }>
}

/**
 * Extended supplier gate for procurement documents.
 * Builds on ACTIVE status check and adds sourcing, documents, and company scope.
 */
export function assertSupplierProcurement(
    supplier: SupplierProcurementRecord | null | undefined,
    ctx: SupplierProcurementContext,
) {
    if (!supplier || supplier.deletedAt) {
        throw new NotFoundException('Supplier not found')
    }

    const code = supplier.supplierCode ? ` (${supplier.supplierCode})` : ''

    if (supplier.status === 'BLOCKED') {
        throw new BadRequestException(`Supplier is BLOCKED and cannot be used${code}`)
    }
    if (supplier.status === 'INACTIVE') {
        throw new BadRequestException(`Inactive suppliers cannot be used for procurement${code}`)
    }
    if (supplier.status === 'DRAFT') {
        throw new BadRequestException(`Draft suppliers cannot be used for procurement${code}`)
    }
    if (supplier.status === 'PENDING_REVIEW') {
        throw new BadRequestException(`Supplier pending review cannot be used${code}`)
    }
    if (supplier.status === 'APPROVED') {
        throw new BadRequestException(`Approved suppliers must be activated before use${code}`)
    }
    if (supplier.status !== 'ACTIVE') {
        throw new BadRequestException(`Supplier is not ACTIVE${code}`)
    }

    if (supplier.sourcingType === 'BLOCKED') {
        throw new BadRequestException(`Supplier sourcing type is BLOCKED${code}`)
    }

    if (supplier.companyId && supplier.companyId !== ctx.companyId) {
        throw new BadRequestException(
            `Supplier is not in purchasing scope for company ${ctx.companyId}${code}`,
        )
    }

    const now = new Date()
    const requiredDocs = (supplier.documents ?? []).filter((d) => d.isRequiredForPurchasing)
    for (const doc of requiredDocs) {
        if (doc.expiresAt && new Date(doc.expiresAt) < now) {
            const label = doc.docType ? ` (${doc.docType})` : ''
            throw new BadRequestException(
                `Supplier required document expired${label}${code}`,
            )
        }
    }

    return supplier
}

export async function assertSupplierProcurementById(
    prisma: { mmSupplier: { findFirst: Function } },
    supplierId: string,
    ctx: SupplierProcurementContext,
) {
    const supplier = await prisma.mmSupplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: {
            id: true,
            status: true,
            deletedAt: true,
            supplierCode: true,
            companyId: true,
            sourcingType: true,
            documents: {
                where: { isRequiredForPurchasing: true },
                select: {
                    id: true,
                    expiresAt: true,
                    isRequiredForPurchasing: true,
                    docType: true,
                },
            },
        },
    })
    return assertSupplierProcurement(supplier, ctx)
}

/** Competitive sourcing: require multiple submitted quotes unless single-source. */
export function assertCompetitiveSourcing(params: {
    submittedQuotationCount: number
    awardedSupplierSourcingType?: string | null
    invitedSupplierSourcingTypes?: Array<string | null | undefined>
    reason?: string
}) {
    const requiresCompetitive =
        params.awardedSupplierSourcingType === 'COMPETITIVE_REQUIRED' ||
        (params.invitedSupplierSourcingTypes ?? []).some((t) => t === 'COMPETITIVE_REQUIRED')

    if (!requiresCompetitive) return

    const isSingleSource =
        params.awardedSupplierSourcingType === 'SINGLE_SOURCE' ||
        (params.reason?.toLowerCase().includes('single source') ?? false)

    if (isSingleSource) return

    if (params.submittedQuotationCount < 2) {
        throw new BadRequestException(
            'Competitive sourcing required: at least two submitted quotations before award',
        )
    }
}
