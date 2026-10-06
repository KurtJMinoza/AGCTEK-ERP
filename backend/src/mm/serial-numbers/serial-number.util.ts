import type { PrismaClient } from '@prisma/client'
import { generateSupplierPrefixedSerialNumber } from '../common/supplier-prefixed-number.util'

export async function generateSerialNumber(
    prisma: PrismaClient,
    materialId: string,
    supplierId?: string | null,
): Promise<string> {
    return generateSupplierPrefixedSerialNumber(prisma, materialId, supplierId)
}
