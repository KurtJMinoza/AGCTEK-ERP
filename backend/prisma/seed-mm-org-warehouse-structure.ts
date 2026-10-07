import type { PrismaClient } from '@prisma/client'

export type MmOrgWarehouseSeedResult = {
    company: { id: string; code: string; name: string }
    branch: { id: string; code: string }
    mainWarehouse: { id: string; code: string }
}

/**
 * Seeds legal org (company → branch → warehouse) and WM topology:
 * - Storage type  = storage area (receiving, bulk rack, shipping, …)
 * - Storage section = aisle / shelf within an area
 * - Storage bin     = exact pick/put location
 *
 * Idempotent: safe to re-run; upserts org masters and creates missing WM nodes.
 */
export async function seedMmOrgAndWarehouseStructure(
    prisma: PrismaClient,
): Promise<MmOrgWarehouseSeedResult> {
    console.log('Seeding company, branch, warehouse, and storage topology …')

    const company = await prisma.company.upsert({
        where: { code: 'AGCTEK' },
        update: {
            name: 'AGCTEK Corporation',
            address: '123 Industrial Blvd, Makati City, Philippines',
            tin: '000-000-000-000',
        },
        create: {
            code: 'AGCTEK',
            name: 'AGCTEK Corporation',
            address: '123 Industrial Blvd, Makati City, Philippines',
            tin: '000-000-000-000',
            logoUrl: '/img/logo/AGC_DARK.png',
        },
    })

    const branch = await prisma.branch.upsert({
        where: { companyId_code: { companyId: company.id, code: 'BR-HQ' } },
        update: {
            name: 'HQ Branch',
            plantId: null,
            status: 'ACTIVE',
            deletedAt: null,
        },
        create: {
            code: 'BR-HQ',
            name: 'HQ Branch',
            companyId: company.id,
            status: 'ACTIVE',
        },
    })

    const mainWarehouse = await prisma.warehouse.upsert({
        where: { code: 'MAIN' },
        update: {
            name: 'Main Warehouse',
            companyId: company.id,
            plantId: null,
            branchId: branch.id,
            status: 'ACTIVE',
            deletedAt: null,
            timezone: 'Asia/Manila',
            address: '123 Industrial Blvd, Makati City',
            warehouseType: 'GENERAL',
            defaultReceivingArea: 'RECEIVING',
            defaultShippingArea: 'SHIPPING',
        },
        create: {
            code: 'MAIN',
            name: 'Main Warehouse',
            companyId: company.id,
            plantId: null,
            branchId: branch.id,
            status: 'ACTIVE',
            timezone: 'Asia/Manila',
            address: '123 Industrial Blvd, Makati City',
            warehouseType: 'GENERAL',
            defaultReceivingArea: 'RECEIVING',
            defaultShippingArea: 'SHIPPING',
        },
    })

    /** Storage areas (storage types) */
    const storageTypeData = [
        {
            code: 'RECEIVING',
            name: 'Receiving Area',
            description: 'Inbound dock — goods arrive here before putaway',
            receivingAllowed: true,
            putawayAllowed: false,
            pickingAllowed: false,
            shippingAllowed: false,
        },
        {
            code: 'BULK_RACK',
            name: 'Bulk Rack Area',
            description: 'Primary pallet / rack storage',
            putawayAllowed: true,
            pickingAllowed: true,
        },
        {
            code: 'PICK_FACE',
            name: 'Pick Face Area',
            description: 'Forward pick locations for order fulfillment',
            putawayAllowed: true,
            pickingAllowed: true,
        },
        {
            code: 'SHIPPING',
            name: 'Shipping Area',
            description: 'Staging for outbound shipments',
            putawayAllowed: false,
            pickingAllowed: false,
            shippingAllowed: true,
        },
        {
            code: 'QC_HOLD',
            name: 'Quality Hold Area',
            description: 'Inspection and quarantine',
            qualityControlled: true,
            putawayAllowed: true,
            pickingAllowed: false,
        },
    ] as Array<Record<string, unknown>>

    const storageTypes: Record<string, { id: string; code: string }> = {}
    for (const st of storageTypeData) {
        const code = String(st.code)
        const existing = await prisma.wmStorageType.findFirst({
            where: { warehouseId: mainWarehouse.id, code },
        })
        const payload = {
            name: String(st.name),
            description: (st.description as string) ?? null,
            temperatureControlled: Boolean(st.temperatureControlled),
            hazardous: Boolean(st.hazardous),
            qualityControlled: Boolean(st.qualityControlled),
            pickingAllowed: st.pickingAllowed !== false,
            putawayAllowed: st.putawayAllowed !== false,
            receivingAllowed: Boolean(st.receivingAllowed),
            shippingAllowed: Boolean(st.shippingAllowed),
            status: 'ACTIVE',
            deletedAt: null,
        }
        storageTypes[code] = existing
            ? await prisma.wmStorageType.update({
                  where: { id: existing.id },
                  data: payload,
              })
            : await prisma.wmStorageType.create({
                  data: {
                      code,
                      warehouseId: mainWarehouse.id,
                      ...payload,
                  },
              })
    }

    /** Sections = aisle / shelf within an area */
    const sectionData: {
        typeCode: string
        code: string
        name: string
        description?: string
    }[] = [
        { typeCode: 'RECEIVING', code: 'RCV-D01', name: 'Receiving Dock 1' },
        { typeCode: 'BULK_RACK', code: 'A01', name: 'Aisle A01', description: 'Rack aisle A' },
        { typeCode: 'BULK_RACK', code: 'A01-S01', name: 'Aisle A01 · Shelf 1' },
        { typeCode: 'BULK_RACK', code: 'A01-S02', name: 'Aisle A01 · Shelf 2' },
        { typeCode: 'BULK_RACK', code: 'A01-S03', name: 'Aisle A01 · Shelf 3' },
        { typeCode: 'BULK_RACK', code: 'A02-S01', name: 'Aisle A02 · Shelf 1' },
        { typeCode: 'BULK_RACK', code: 'A02-S02', name: 'Aisle A02 · Shelf 2' },
        { typeCode: 'PICK_FACE', code: 'PF-Z01', name: 'Pick Zone 1' },
        { typeCode: 'SHIPPING', code: 'SHP-D01', name: 'Shipping Dock 1' },
        { typeCode: 'QC_HOLD', code: 'QC-01', name: 'QC Hold Bay 1' },
    ]

    const sections: Record<string, { id: string; code: string }> = {}
    for (const sec of sectionData) {
        const storageTypeId = storageTypes[sec.typeCode].id
        const existing = await prisma.wmStorageSection.findFirst({
            where: { storageTypeId, code: sec.code },
        })
        sections[sec.code] = existing
            ? await prisma.wmStorageSection.update({
                  where: { id: existing.id },
                  data: {
                      name: sec.name,
                      description: sec.description ?? null,
                      status: 'ACTIVE',
                      deletedAt: null,
                  },
              })
            : await prisma.wmStorageSection.create({
                  data: {
                      code: sec.code,
                      name: sec.name,
                      description: sec.description ?? null,
                      storageTypeId,
                      status: 'ACTIVE',
                  },
              })
    }

    /** Bins = exact coordinates (section + bin code) */
    const binData: {
        sectionCode: string
        code: string
        qty: number
        weight: number
        volume: number
    }[] = [
        { sectionCode: 'RCV-D01', code: 'RCV-D01-001', qty: 2000, weight: 10000, volume: 80 },
        { sectionCode: 'A01-S01', code: 'A01-S01-001', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'A01-S01', code: 'A01-S01-002', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'A01-S02', code: 'A01-S02-001', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'A01-S02', code: 'A01-S02-002', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'A01-S03', code: 'A01-S03-001', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'A02-S01', code: 'A02-S01-001', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'A02-S02', code: 'A02-S02-001', qty: 120, weight: 600, volume: 2.5 },
        { sectionCode: 'PF-Z01', code: 'PF-Z01-001', qty: 80, weight: 400, volume: 1.2 },
        { sectionCode: 'PF-Z01', code: 'PF-Z01-002', qty: 80, weight: 400, volume: 1.2 },
        { sectionCode: 'SHP-D01', code: 'SHP-D01-001', qty: 2000, weight: 10000, volume: 80 },
        { sectionCode: 'QC-01', code: 'QC-01-001', qty: 50, weight: 250, volume: 1 },
    ]

    let binsCreated = 0
    for (const bin of binData) {
        const storageSectionId = sections[bin.sectionCode].id
        const existing = await prisma.wmStorageBin.findFirst({
            where: { storageSectionId, code: bin.code },
        })
        if (!existing) {
            await prisma.wmStorageBin.create({
                data: {
                    code: bin.code,
                    storageSectionId,
                    barcode: `BIN-${bin.code}`,
                    capacityQuantity: bin.qty,
                    capacityWeight: bin.weight,
                    capacityVolume: bin.volume,
                    weightUom: 'KG',
                    volumeUom: 'CBM',
                    status: 'ACTIVE',
                },
            })
            binsCreated++
        }
    }

    const typeCount = Object.keys(storageTypes).length
    const sectionCount = Object.keys(sections).length
    const binCount = await prisma.wmStorageBin.count({
        where: {
            storageSection: { storageType: { warehouseId: mainWarehouse.id } },
        },
    })

    console.log(`  Company: ${company.code} — ${company.name}`)
    console.log(`  Branch: ${branch.code}, Warehouse: ${mainWarehouse.code}`)
    console.log(
        `  Topology: ${typeCount} storage area(s), ${sectionCount} section(s)/shelf(s), ${binCount} bin(s) (${binsCreated} new).`,
    )

    return { company, branch, mainWarehouse }
}
