import type { PrismaClient } from '@prisma/client'
import { parseCalendarDateString } from '../mm/common/calendar-date.util'
import { resolveMaterialLineTracking } from '../mm/batches/line-tracking.util'

type Client = Pick<
    PrismaClient,
    'sdProductVariant' | 'mmMaterial' | 'mmBatch' | 'mmInventoryBalance'
>

/** Line override → catalog variant → FEFO/batch → material default. */
export async function resolveSellableProductExpiry(
    prisma: Client,
    args: {
        materialId: string
        companyId?: string | null
        variantId?: string | null
        lineOverride?: string | Date | null
    },
): Promise<Date | null> {
    if (args.lineOverride) {
        const parsed =
            args.lineOverride instanceof Date
                ? args.lineOverride
                : parseCalendarDateString(String(args.lineOverride).trim())
        if (parsed) return parsed
    }

    if (args.variantId) {
        const variant = await prisma.sdProductVariant.findFirst({
            where: { id: args.variantId },
            select: { catalogExpiryDate: true },
        })
        if (variant?.catalogExpiryDate) return variant.catalogExpiryDate
    }

    const tracking = await resolveMaterialLineTracking(
        prisma,
        args.materialId,
        args.companyId ?? null,
    )
    if (tracking.expiryDate) return tracking.expiryDate

    const material = await prisma.mmMaterial.findFirst({
        where: { id: args.materialId, deletedAt: null },
        select: { defaultExpiryDate: true },
    })
    return material?.defaultExpiryDate ?? null
}

export function formatCalendarExpiryDate(value: Date | null | undefined): string | null {
    if (!value) return null
    return value.toISOString().slice(0, 10)
}