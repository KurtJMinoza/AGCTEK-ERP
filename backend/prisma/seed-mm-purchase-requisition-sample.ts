import type { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const DEMO_PURPOSE = 'Restock — warehouse replenishment (low stock / demo)'

async function nextRequisitionNumber(prisma: PrismaClient): Promise<string> {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const pfx = `REQ-${dateStr}-`
    const last = await prisma.mmPurchaseRequisition.findFirst({
        where: { requisitionNumber: { startsWith: pfx } },
        orderBy: { requisitionNumber: 'desc' },
    })
    let seq = 1
    if (last) {
        const lastSeq = parseInt(last.requisitionNumber.replace(pfx, ''), 10)
        if (!Number.isNaN(lastSeq)) seq = lastSeq + 1
    }
    return `${pfx}${String(seq).padStart(5, '0')}`
}

type LineSpec = {
    materialCode: string
    requestedQuantity: number
    remarks?: string
}

const LINES: LineSpec[] = [
    {
        materialCode: 'SKU-HELMET-001',
        requestedQuantity: 50,
        remarks: 'Safety stock below reorder — helmets for plant floor',
    },
    {
        materialCode: 'SKU-LUBE-1L',
        requestedQuantity: 48,
        remarks: 'Restock lubricant (2× supplier MOQ)',
    },
]

/**
 * Sample purchase requisition (internal buy request) for seeded materials.
 */
export async function seedMmPurchaseRequisitionSample(prisma: PrismaClient) {
    console.log('Seeding sample purchase requisition …')

    const existing = await prisma.mmPurchaseRequisition.findFirst({
        where: { purpose: DEMO_PURPOSE, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } },
    })
    if (existing) {
        console.log(`  Already exists: ${existing.requisitionNumber} (${existing.status})`)
        return existing
    }

    const company = await prisma.company.findFirst({ where: { code: 'AGCTEK' } })
    const branch = await prisma.branch.findFirst({
        where: { companyId: company?.id, code: 'BR-HQ' },
    })
    const warehouse = await prisma.warehouse.findFirst({ where: { code: 'MAIN' } })
    const supplier = await prisma.mmSupplier.findFirst({
        where: { supplierCode: 'SUP-PHILMAN' },
    })

    if (!company || !warehouse) {
        throw new Error('Run org + material + supplier seeds before purchase requisition seed.')
    }

    const requiredDate = new Date()
    requiredDate.setDate(requiredDate.getDate() + 14)

    const lineRows: {
        materialId: string
        description: string
        requestedQuantity: Decimal
        uomId: string
        estimatedUnitPrice: Decimal
        estimatedTotal: Decimal
        requiredDate: Date
        warehouseId: string
        preferredSupplierId: string | null
        convertedQty: Decimal
        remarks: string | null
    }[] = []

    for (const spec of LINES) {
        const material = await prisma.mmMaterial.findFirst({
            where: { materialCode: spec.materialCode, deletedAt: null },
            include: { baseUom: true },
        })
        if (!material) {
            console.warn(`  Skip line — material ${spec.materialCode} not found`)
            continue
        }

        const link = supplier
            ? await prisma.mmSupplierMaterial.findUnique({
                  where: {
                      supplierId_materialId: {
                          supplierId: supplier.id,
                          materialId: material.id,
                      },
                  },
              })
            : null

        const unitPrice = new Decimal(
            link ? Number(link.unitPrice) : Number(material.standardCost),
        )
        const qty = new Decimal(spec.requestedQuantity)

        lineRows.push({
            materialId: material.id,
            description: material.materialName,
            requestedQuantity: qty,
            uomId: material.baseUomId,
            estimatedUnitPrice: unitPrice,
            estimatedTotal: qty.mul(unitPrice),
            requiredDate,
            warehouseId: warehouse.id,
            preferredSupplierId: link?.supplierId ?? material.preferredSupplierId ?? null,
            convertedQty: new Decimal(0),
            remarks: spec.remarks ?? null,
        })
    }

    if (lineRows.length === 0) {
        throw new Error('No PR lines — run prisma:seed-material-samples first.')
    }

    const requisitionNumber = await nextRequisitionNumber(prisma)

    const pr = await prisma.mmPurchaseRequisition.create({
        data: {
            requisitionNumber,
            companyId: company.id,
            branchId: branch?.id ?? null,
            requesterId: 'warehouse-planner',
            requiredDate,
            purpose: DEMO_PURPOSE,
            status: 'DRAFT',
            createdBy: 'seed',
            lines: { create: lineRows },
        },
        include: {
            lines: {
                include: {
                    material: { select: { materialCode: true, materialName: true } },
                },
            },
        },
    })

    await prisma.mmPurchaseRequisitionAudit.create({
        data: {
            requisitionId: pr.id,
            action: 'CREATED',
            newValue: requisitionNumber,
            performedBy: 'seed',
            details: { source: 'seed-mm-purchase-requisition-sample' },
        },
    })

    console.log(`  Created ${pr.requisitionNumber} (DRAFT) with ${pr.lines.length} line(s):`)
    for (const line of pr.lines) {
        console.log(
            `    · ${line.material.materialCode} qty ${line.requestedQuantity.toString()} @ ${line.estimatedUnitPrice.toString()}`,
        )
    }

    return pr
}
