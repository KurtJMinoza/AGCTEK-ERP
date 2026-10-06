import type { PrismaClient } from '@prisma/client'

export const SUPPLIER_PREFIX_SEQ_WIDTH = 4
export const FALLBACK_TRACKING_PREFIX = 'BATCH'
export const SERIAL_SEGMENT = 'SERIAL'

function sanitizeCode(value: string): string {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function resolveTrackingPrefix(
    prisma: PrismaClient,
    supplierId?: string | null,
): Promise<string> {
    if (!supplierId) return FALLBACK_TRACKING_PREFIX
    const supplier = await prisma.mmSupplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { supplierCode: true },
    })
    if (supplier?.supplierCode?.trim()) {
        return sanitizeCode(supplier.supplierCode)
    }
    return FALLBACK_TRACKING_PREFIX
}

/** Batch/lot numbers: `{SUPPLIER_CODE}-0001` (batches only). */
export async function generateSupplierPrefixedNumber(
    prisma: PrismaClient,
    materialId: string,
    supplierId?: string | null,
): Promise<string> {
    const prefix = await resolveTrackingPrefix(prisma, supplierId)

    const batches = await prisma.mmBatch.findMany({
        where: { materialId, deletedAt: null },
        select: { batchNumber: true },
    })

    const seqPattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, 'i')
    let maxSeq = 0
    for (const row of batches) {
        const match = row.batchNumber.match(seqPattern)
        if (match) {
            maxSeq = Math.max(maxSeq, parseInt(match[1], 10))
        }
    }

    let seq = maxSeq + 1
    while (seq < 1_000_000) {
        const candidate = `${prefix}-${String(seq).padStart(SUPPLIER_PREFIX_SEQ_WIDTH, '0')}`
        const clash = await prisma.mmBatch.findFirst({
            where: { materialId, batchNumber: candidate, deletedAt: null },
            select: { id: true },
        })
        if (!clash) return candidate
        seq += 1
    }

    throw new Error('Unable to allocate a unique batch number')
}

/** Serial numbers: `{SUPPLIER_CODE}-SERIAL-0001` (own sequence, starts at 0001). */
export async function generateSupplierPrefixedSerialNumber(
    prisma: PrismaClient,
    materialId: string,
    supplierId?: string | null,
): Promise<string> {
    const prefix = await resolveTrackingPrefix(prisma, supplierId)
    const serialPrefix = `${prefix}-${SERIAL_SEGMENT}`

    const serials = await prisma.mmSerialNumber.findMany({
        where: { materialId, deletedAt: null },
        select: { serialNumber: true },
    })

    const seqPattern = new RegExp(
        `^${escapeRegExp(serialPrefix)}-(\\d+)$`,
        'i',
    )
    let maxSeq = 0
    for (const row of serials) {
        const match = row.serialNumber.match(seqPattern)
        if (match) {
            maxSeq = Math.max(maxSeq, parseInt(match[1], 10))
        }
    }

    let seq = maxSeq + 1
    while (seq < 1_000_000) {
        const candidate = `${serialPrefix}-${String(seq).padStart(SUPPLIER_PREFIX_SEQ_WIDTH, '0')}`
        const clash = await prisma.mmSerialNumber.findFirst({
            where: { materialId, serialNumber: candidate, deletedAt: null },
            select: { id: true },
        })
        if (!clash) return candidate
        seq += 1
    }

    throw new Error('Unable to allocate a unique serial number')
}
