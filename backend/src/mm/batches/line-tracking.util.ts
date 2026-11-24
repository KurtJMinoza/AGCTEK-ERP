import { BadRequestException } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { formatTrackingNumber } from '../common/tracking-number.format'

export type LineBatchTracking = {
    batchId: string | null
    batchNumber: string | null
    lotNumber: string | null
}

type Client = Pick<
    PrismaClient,
    'mmBatch' | 'mmInventoryBalance' | 'mmMaterial'
>

/**
 * Prefer stocked batch (FEFO by expiry), else the newest batch on the material.
 */
export async function resolveMaterialLineTracking(
    prisma: Client,
    materialId: string,
    companyId?: string | null,
): Promise<LineBatchTracking> {
    const material = await prisma.mmMaterial.findFirst({
        where: { id: materialId, deletedAt: null },
        select: { batchManaged: true },
    })
    if (!material?.batchManaged) {
        return { batchId: null, batchNumber: null, lotNumber: null }
    }

    const balances = await prisma.mmInventoryBalance.findMany({
        where: {
            materialId,
            ...(companyId ? { companyId } : {}),
            batchId: { not: null },
            quantity: { gt: 0 },
            stockStatus: 'UNRESTRICTED',
        },
        select: {
            batch: {
                select: {
                    id: true,
                    batchNumber: true,
                    lotNumber: true,
                    expiryDate: true,
                    createdAt: true,
                },
            },
        },
        take: 50,
    })

    const batches = balances
        .map((row) => row.batch)
        .filter((b): b is NonNullable<typeof b> => Boolean(b))

    const pick =
        batches.sort((a, b) => {
            const aExp = a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
            const bExp = b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
            if (aExp !== bExp) return aExp - bExp
            return b.createdAt.getTime() - a.createdAt.getTime()
        })[0] ??
        (await prisma.mmBatch.findFirst({
            where: { materialId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: { id: true, batchNumber: true, lotNumber: true },
        }))

    if (!pick) {
        return { batchId: null, batchNumber: null, lotNumber: null }
    }
    return {
        batchId: pick.id,
        batchNumber: pick.batchNumber,
        lotNumber: pick.lotNumber ?? null,
    }
}

/**
 * Find or create a batch row when the user supplies batch and/or lot on import or a form.
 */
export async function ensureMaterialBatch(
    prisma: Client,
    materialId: string,
    rawBatch?: string | null,
    rawLot?: string | null,
): Promise<LineBatchTracking | null> {
    const batchNumber = rawBatch?.trim()
        ? formatTrackingNumber(rawBatch.trim())
        : null
    const lotNumber = rawLot?.trim()
        ? formatTrackingNumber(rawLot.trim())
        : null
    if (!batchNumber && !lotNumber) return null

    /** When operators enter only a lot, use it as the batch identity (same tracking key). */
    const resolvedBatchNumber = batchNumber ?? lotNumber!

    await prisma.mmMaterial.updateMany({
        where: { id: materialId, deletedAt: null, batchManaged: false },
        data: { batchManaged: true },
    })

    const existing = await prisma.mmBatch.findFirst({
        where: {
            materialId,
            batchNumber: resolvedBatchNumber,
            deletedAt: null,
        },
        select: { id: true, batchNumber: true, lotNumber: true },
    })
    if (existing) {
        if (lotNumber && existing.lotNumber && existing.lotNumber !== lotNumber) {
            throw new BadRequestException(
                `Batch ${resolvedBatchNumber} already exists with lot ${existing.lotNumber}.`,
            )
        }
        if (lotNumber && !existing.lotNumber) {
            const updated = await prisma.mmBatch.update({
                where: { id: existing.id },
                data: { lotNumber },
                select: { id: true, batchNumber: true, lotNumber: true },
            })
            return {
                batchId: updated.id,
                batchNumber: updated.batchNumber,
                lotNumber: updated.lotNumber,
            }
        }
        return {
            batchId: existing.id,
            batchNumber: existing.batchNumber,
            lotNumber: existing.lotNumber ?? lotNumber,
        }
    }

    const created = await prisma.mmBatch.create({
        data: {
            materialId,
            batchNumber: resolvedBatchNumber,
            lotNumber: lotNumber ?? null,
            status: 'AVAILABLE',
        },
        select: { id: true, batchNumber: true, lotNumber: true },
    })
    return {
        batchId: created.id,
        batchNumber: created.batchNumber,
        lotNumber: created.lotNumber,
    }
}