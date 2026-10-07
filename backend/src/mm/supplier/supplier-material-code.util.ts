import type { PrismaClient } from '@prisma/client'

const MAX_LEN = 80

function sanitizeSegment(value: string): string {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
}

/** `{SUPPLIER_CODE}-{MATERIAL_CODE}` with numeric suffix if needed for uniqueness. */
export async function generateSupplierMaterialCode(
    prisma: PrismaClient,
    supplierId: string,
    materialId: string,
): Promise<string> {
    const [supplier, material] = await Promise.all([
        prisma.mmSupplier.findUnique({
            where: { id: supplierId },
            select: { supplierCode: true },
        }),
        prisma.mmMaterial.findUnique({
            where: { id: materialId },
            select: { materialCode: true },
        }),
    ])
    if (!supplier || !material) {
        throw new Error('Supplier or material not found for code generation')
    }

    const base = `${sanitizeSegment(supplier.supplierCode)}-${sanitizeSegment(material.materialCode)}`.slice(
        0,
        MAX_LEN,
    )

    let candidate = base
    let seq = 1
    while (
        await prisma.mmSupplierMaterial.findFirst({
            where: { supplierMaterialCode: candidate },
            select: { id: true },
        })
    ) {
        seq += 1
        const suffix = `-${String(seq).padStart(2, '0')}`
        candidate = `${base.slice(0, Math.max(1, MAX_LEN - suffix.length))}${suffix}`
    }

    return candidate
}
