import type { PrismaService } from '../prisma/prisma.service'

/** Shared lookups for Excel import and barcode quick-add (MM names or codes). */

export function resolveMaterialCategory(
    prisma: PrismaService,
    value: string | undefined,
) {
    if (!value) return null
    return prisma.mmMaterialCategory.findFirst({
        where: {
            deletedAt: null,
            isActive: true,
            OR: [
                { code: { equals: value, mode: 'insensitive' } },
                { name: { equals: value, mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    })
}

export function resolveMaterialUom(
    prisma: PrismaService,
    value: string | undefined,
) {
    if (!value) return null
    return prisma.mmUom.findFirst({
        where: {
            deletedAt: null,
            isActive: true,
            OR: [
                { code: { equals: value, mode: 'insensitive' } },
                { name: { equals: value, mode: 'insensitive' } },
            ],
        },
        select: { id: true, code: true },
    })
}

export function resolveImportWarehouse(
    prisma: PrismaService,
    value: string | undefined,
    companyId: string,
) {
    if (!value) return null
    return prisma.warehouse.findFirst({
        where: {
            deletedAt: null,
            companyId,
            OR: [
                { code: { equals: value, mode: 'insensitive' } },
                { name: { equals: value, mode: 'insensitive' } },
            ],
        },
        select: { id: true, code: true },
    })
}

export function resolveImportBin(
    prisma: PrismaService,
    value: string | undefined,
    warehouseId: string,
) {
    if (!value) return null
    return prisma.wmStorageBin.findFirst({
        where: {
            deletedAt: null,
            OR: [
                { code: { equals: value, mode: 'insensitive' } },
                { barcode: { equals: value, mode: 'insensitive' } },
            ],
            storageSection: { storageType: { warehouseId } },
        },
        select: { id: true, code: true },
    })
}

export async function defaultMaterialTypeId(prisma: PrismaService) {
    const type = await prisma.mmMaterialType.findFirst({
        where: { deletedAt: null, isActive: true },
        orderBy: [{ code: 'asc' }],
        select: { id: true },
    })
    return type?.id ?? null
}
