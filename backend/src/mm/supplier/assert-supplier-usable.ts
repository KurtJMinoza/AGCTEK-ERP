import { BadRequestException, NotFoundException } from '@nestjs/common'

/**
 * Gate for using a supplier on new procurement documents (e.g. PO).
 * Only ACTIVE suppliers may be referenced.
 */
export function assertSupplierUsable(
    supplier: {
        id: string
        status: string
        deletedAt?: Date | null
        supplierCode?: string | null
    } | null | undefined,
) {
    if (!supplier || supplier.deletedAt) {
        throw new NotFoundException('Supplier not found')
    }
    const code = supplier.supplierCode ? ` (${supplier.supplierCode})` : ''
    if (supplier.status === 'BLOCKED') {
        throw new BadRequestException(`Supplier is BLOCKED and cannot be used${code}`)
    }
    if (supplier.status === 'INACTIVE') {
        throw new BadRequestException(`Inactive suppliers cannot be used on new purchase orders${code}`)
    }
    if (supplier.status === 'DRAFT') {
        throw new BadRequestException(`Draft suppliers cannot be used on purchase orders${code}`)
    }
    if (supplier.status === 'PENDING_REVIEW') {
        throw new BadRequestException(`Supplier pending review cannot be used on purchase orders${code}`)
    }
    if (supplier.status === 'APPROVED') {
        throw new BadRequestException(`Approved suppliers must be activated before use on purchase orders${code}`)
    }
    if (supplier.status !== 'ACTIVE') {
        throw new BadRequestException(`Supplier is not ACTIVE${code}`)
    }
    return supplier
}

export async function assertSupplierUsableById(
    prisma: { mmSupplier: { findFirst: Function } },
    supplierId: string,
) {
    const supplier = await prisma.mmSupplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { id: true, status: true, deletedAt: true, supplierCode: true },
    })
    return assertSupplierUsable(supplier)
}
