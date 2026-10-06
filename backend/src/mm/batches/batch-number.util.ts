import type { PrismaClient } from '@prisma/client'
import { generateSupplierPrefixedNumber } from '../common/supplier-prefixed-number.util'

export async function generateBatchNumber(
    prisma: PrismaClient,
    materialId: string,
    supplierId?: string | null,
): Promise<string> {
    return generateSupplierPrefixedNumber(prisma, materialId, supplierId)
}
