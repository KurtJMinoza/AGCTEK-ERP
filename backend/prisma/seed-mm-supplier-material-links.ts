import type { PrismaClient } from '@prisma/client'

const SUPPLIER = {
    supplierCode: 'SUP-PHILMAN',
    supplierName: 'Philippine Industrial & Safety Supply',
    legalName: 'PhilMan Trading Inc.',
    email: 'orders@philman.example.com',
    phone: '+63-2-8000-0000',
    billingAddress: '88 Supply Chain Rd, Pasig City, Philippines',
    leadTimeDays: 7,
    status: 'ACTIVE',
}

type MaterialLink = {
    materialCode: string
    supplierMaterialCode: string
    unitPrice: number
    leadTimeDays: number
    minimumOrderQuantity: number
    preferredSupplier: boolean
}

const LINKS: MaterialLink[] = [
    {
        materialCode: 'SKU-HELMET-001',
        supplierMaterialCode: 'PHM-HELM-WHT',
        unitPrice: 380,
        leadTimeDays: 7,
        minimumOrderQuantity: 10,
        preferredSupplier: true,
    },
    {
        materialCode: 'SKU-LUBE-1L',
        supplierMaterialCode: 'PHM-LUBE-1L',
        unitPrice: 142,
        leadTimeDays: 14,
        minimumOrderQuantity: 24,
        preferredSupplier: true,
    },
]

/**
 * Creates an ACTIVE supplier and links sample materials with buying (unit) prices.
 */
export async function seedMmSupplierMaterialLinks(prisma: PrismaClient) {
    console.log('Seeding supplier ↔ material links (buying prices) …')

    const company = await prisma.company.findFirst({ where: { code: 'AGCTEK' } })
    if (!company) {
        throw new Error('Company AGCTEK not found. Run npm run prisma:seed-org-warehouse first.')
    }

    const warehouse = await prisma.warehouse.findFirst({ where: { code: 'MAIN' } })
    const currency = await prisma.mmCurrency.findFirst({ where: { code: 'PHP' } })

    const supplier = await prisma.mmSupplier.upsert({
        where: { supplierCode: SUPPLIER.supplierCode },
        update: {
            supplierName: SUPPLIER.supplierName,
            legalName: SUPPLIER.legalName,
            email: SUPPLIER.email,
            phone: SUPPLIER.phone,
            billingAddress: SUPPLIER.billingAddress,
            leadTimeDays: SUPPLIER.leadTimeDays,
            companyId: company.id,
            defaultWarehouseId: warehouse?.id ?? null,
            currencyId: currency?.id ?? null,
            status: SUPPLIER.status,
            deletedAt: null,
        },
        create: {
            ...SUPPLIER,
            companyId: company.id,
            defaultWarehouseId: warehouse?.id ?? null,
            currencyId: currency?.id ?? null,
        },
    })

    for (const link of LINKS) {
        const material = await prisma.mmMaterial.findFirst({
            where: { materialCode: link.materialCode, deletedAt: null },
        })
        if (!material) {
            console.warn(`  Skip ${link.materialCode} — material not found (run prisma:seed-material-samples)`)
            continue
        }

        const supplierMaterial = await prisma.mmSupplierMaterial.upsert({
            where: {
                supplierId_materialId: {
                    supplierId: supplier.id,
                    materialId: material.id,
                },
            },
            update: {
                supplierMaterialCode: link.supplierMaterialCode,
                unitPrice: link.unitPrice,
                currencyId: currency?.id ?? null,
                leadTimeDays: link.leadTimeDays,
                minimumOrderQuantity: link.minimumOrderQuantity,
                preferredSupplier: link.preferredSupplier,
                status: 'ACTIVE',
            },
            create: {
                supplierId: supplier.id,
                materialId: material.id,
                supplierMaterialCode: link.supplierMaterialCode,
                unitPrice: link.unitPrice,
                currencyId: currency?.id ?? null,
                leadTimeDays: link.leadTimeDays,
                minimumOrderQuantity: link.minimumOrderQuantity,
                preferredSupplier: link.preferredSupplier,
                status: 'ACTIVE',
            },
        })

        if (link.preferredSupplier) {
            await prisma.mmMaterial.update({
                where: { id: material.id },
                data: { preferredSupplierId: supplier.id },
            })
        }

        await prisma.mmSupplierPrice.deleteMany({
            where: { supplierMaterialId: supplierMaterial.id },
        })
        await prisma.mmSupplierPrice.create({
            data: {
                supplierId: supplier.id,
                materialId: material.id,
                supplierMaterialId: supplierMaterial.id,
                unitPrice: link.unitPrice,
                currencyId: currency?.id ?? null,
                minimumQuantity: link.minimumOrderQuantity,
                effectiveFrom: new Date(),
            },
        })

        console.log(
            `  ${supplier.supplierCode} → ${material.materialCode}: buy ₱${link.unitPrice} (MOQ ${link.minimumOrderQuantity})`,
        )
    }

    console.log('Supplier-material links seed complete.')
}
