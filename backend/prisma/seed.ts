import { PrismaClient } from '@prisma/client'
import { seedMmFull } from './seed-mm-full'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding MM reference data …')

    // ── Company ─────────────────────────────────────────────────────
    const company = await prisma.company.upsert({
        where: { code: 'AGCTEK' },
        update: {},
        create: { code: 'AGCTEK', name: 'AGCTEK Corporation' },
    })

    // ── Plant / Branch ──────────────────────────────────────────────
    const plant = await prisma.plant.upsert({
        where: { companyId_code: { companyId: company.id, code: 'PLT-MAIN' } },
        update: {},
        create: {
            code: 'PLT-MAIN',
            name: 'Main Plant',
            companyId: company.id,
            status: 'ACTIVE',
        },
    })
    const branch = await prisma.branch.upsert({
        where: { companyId_code: { companyId: company.id, code: 'BR-HQ' } },
        update: {},
        create: {
            code: 'BR-HQ',
            name: 'HQ Branch',
            companyId: company.id,
            plantId: plant.id,
            status: 'ACTIVE',
        },
    })

    // ── Warehouses ──────────────────────────────────────────────────
    const mainWarehouse = await prisma.warehouse.upsert({
        where: { code: 'MAIN' },
        update: {
            status: 'ACTIVE',
            timezone: 'Asia/Manila',
            address: '123 Industrial Blvd, Makati City',
            plantId: plant.id,
            branchId: branch.id,
        },
        create: {
            code: 'MAIN',
            name: 'Main Warehouse',
            companyId: company.id,
            plantId: plant.id,
            branchId: branch.id,
            status: 'ACTIVE',
            timezone: 'Asia/Manila',
            address: '123 Industrial Blvd, Makati City',
        },
    })

    const secondaryWarehouse = await prisma.warehouse.upsert({
        where: { code: 'SECONDARY' },
        update: { plantId: plant.id },
        create: {
            code: 'SECONDARY',
            name: 'Secondary Warehouse',
            companyId: company.id,
            plantId: plant.id,
            status: 'ACTIVE',
            timezone: 'Asia/Manila',
            address: '456 Logistics Ave, Taguig City',
        },
    })

    // ── Storage Types (MAIN warehouse) ──────────────────────────────
    const storageTypeData = [
        { code: 'RECEIVING', name: 'Receiving Area', receivingAllowed: true, putawayAllowed: false, pickingAllowed: false, shippingAllowed: false },
        { code: 'QUALITY', name: 'Quality Inspection', qualityControlled: true, putawayAllowed: true, pickingAllowed: false },
        { code: 'HIGH_RACK', name: 'High Rack Storage', putawayAllowed: true, pickingAllowed: true },
        { code: 'BULK', name: 'Bulk Storage', putawayAllowed: true, pickingAllowed: true },
        { code: 'PICKING', name: 'Picking Area', putawayAllowed: true, pickingAllowed: true },
        { code: 'PACKING', name: 'Packing Area', putawayAllowed: true, pickingAllowed: true, shippingAllowed: false },
        { code: 'SHIPPING', name: 'Shipping Area', putawayAllowed: false, pickingAllowed: false, shippingAllowed: true },
        { code: 'COLD_STORAGE', name: 'Cold Storage', temperatureControlled: true, putawayAllowed: true, pickingAllowed: true },
        { code: 'HAZARDOUS', name: 'Hazardous Storage', hazardous: true, putawayAllowed: true, pickingAllowed: true },
        { code: 'RETURNS', name: 'Returns Area', putawayAllowed: true, pickingAllowed: true },
        { code: 'QUARANTINE', name: 'Quarantine', qualityControlled: true, putawayAllowed: true, pickingAllowed: false },
    ] as Array<Record<string, any>>

    const storageTypes: Record<string, any> = {}
    for (const st of storageTypeData) {
        const existing = await prisma.wmStorageType.findFirst({
            where: { warehouseId: mainWarehouse.id, code: st.code },
        })
        if (existing) {
            storageTypes[st.code] = await prisma.wmStorageType.update({
                where: { id: existing.id },
                data: {
                    name: st.name,
                    temperatureControlled: st.temperatureControlled ?? false,
                    hazardous: st.hazardous ?? false,
                    qualityControlled: st.qualityControlled ?? false,
                    pickingAllowed: st.pickingAllowed ?? true,
                    putawayAllowed: st.putawayAllowed ?? true,
                    receivingAllowed: st.receivingAllowed ?? false,
                    shippingAllowed: st.shippingAllowed ?? false,
                },
            })
        } else {
            storageTypes[st.code] = await prisma.wmStorageType.create({
                data: {
                    code: st.code,
                    name: st.name,
                    warehouseId: mainWarehouse.id,
                    temperatureControlled: st.temperatureControlled ?? false,
                    hazardous: st.hazardous ?? false,
                    qualityControlled: st.qualityControlled ?? false,
                    pickingAllowed: st.pickingAllowed ?? true,
                    putawayAllowed: st.putawayAllowed ?? true,
                    receivingAllowed: st.receivingAllowed ?? false,
                    shippingAllowed: st.shippingAllowed ?? false,
                },
            })
        }
    }

    // ── Storage Sections ────────────────────────────────────────────
    const sectionData: { typeCode: string; code: string; name: string }[] = [
        { typeCode: 'HIGH_RACK', code: 'A01', name: 'Aisle A01' },
        { typeCode: 'HIGH_RACK', code: 'A02', name: 'Aisle A02' },
        { typeCode: 'BULK', code: 'B01', name: 'Bulk Zone B01' },
        { typeCode: 'COLD_STORAGE', code: 'C01', name: 'Cold Room C01' },
        { typeCode: 'PICKING', code: 'P01', name: 'Pick Zone P01' },
        { typeCode: 'RECEIVING', code: 'R01', name: 'Receiving Dock R01' },
        { typeCode: 'SHIPPING', code: 'S01', name: 'Shipping Dock S01' },
        { typeCode: 'QUALITY', code: 'Q01', name: 'QI Hold Q01' },
        { typeCode: 'HAZARDOUS', code: 'H01', name: 'Hazmat H01' },
        { typeCode: 'RETURNS', code: 'RT01', name: 'Returns RT01' },
        { typeCode: 'QUARANTINE', code: 'QR01', name: 'Quarantine QR01' },
        { typeCode: 'PACKING', code: 'PK01', name: 'Pack Zone PK01' },
    ]

    const sections: Record<string, any> = {}
    for (const sec of sectionData) {
        const storageTypeId = storageTypes[sec.typeCode].id
        const existing = await prisma.wmStorageSection.findFirst({
            where: { storageTypeId, code: sec.code },
        })
        if (existing) {
            sections[sec.code] = existing
        } else {
            sections[sec.code] = await prisma.wmStorageSection.create({
                data: { code: sec.code, name: sec.name, storageTypeId },
            })
        }
    }

    // ── Storage Bins ────────────────────────────────────────────────
    const binData: { sectionCode: string; code: string; qty: number; weight: number; volume: number }[] = [
        { sectionCode: 'A01', code: 'A01-01-001', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'A01', code: 'A01-01-002', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'A01', code: 'A01-01-003', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'A01', code: 'A01-01-004', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'A01', code: 'A01-01-005', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'A02', code: 'A02-01-001', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'A02', code: 'A02-01-002', qty: 100, weight: 500, volume: 2 },
        { sectionCode: 'B01', code: 'B01-01-001', qty: 500, weight: 2000, volume: 10 },
        { sectionCode: 'B01', code: 'B01-01-002', qty: 500, weight: 2000, volume: 10 },
        { sectionCode: 'C01', code: 'C01-01-001', qty: 50, weight: 200, volume: 1 },
        { sectionCode: 'P01', code: 'P01-01-001', qty: 200, weight: 300, volume: 1.5 },
        { sectionCode: 'R01', code: 'R01-01-001', qty: 1000, weight: 5000, volume: 50 },
        { sectionCode: 'S01', code: 'S01-01-001', qty: 1000, weight: 5000, volume: 50 },
    ]

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
                },
            })
        }
    }

    // ── Material Types ──────────────────────────────────────────────
    const types = [
        { code: 'RAW_MATERIAL', name: 'Raw Material' },
        { code: 'PACKAGING', name: 'Packaging' },
        { code: 'CONSUMABLE', name: 'Consumable' },
        { code: 'SPARE_PART', name: 'Spare Part' },
        { code: 'SEMI_FINISHED', name: 'Semi-Finished' },
        { code: 'FINISHED_GOOD', name: 'Finished Good' },
        { code: 'MERCHANDISE', name: 'Merchandise' },
        { code: 'SERVICE', name: 'Service' },
        { code: 'OFFICE_SUPPLY', name: 'Office Supply' },
        { code: 'ASSET', name: 'Asset' },
    ]
    for (let i = 0; i < types.length; i++) {
        await prisma.mmMaterialType.upsert({
            where: { code: types[i].code },
            update: {},
            create: { ...types[i], sortOrder: i + 1 },
        })
    }

    // ── Material Categories (parent + children) ─────────────────────
    const categoryTree: { code: string; name: string; children: { code: string; name: string }[] }[] = [
        {
            code: 'IT_EQUIPMENT',
            name: 'IT Equipment',
            children: [
                { code: 'IT_HARDWARE', name: 'Hardware' },
                { code: 'IT_PERIPHERALS', name: 'Peripherals' },
                { code: 'IT_NETWORKING', name: 'Networking' },
            ],
        },
        {
            code: 'OFFICE_SUPPLIES',
            name: 'Office Supplies',
            children: [
                { code: 'OS_STATIONERY', name: 'Stationery' },
                { code: 'OS_FURNITURE', name: 'Furniture' },
            ],
        },
        {
            code: 'RAW_MATERIALS',
            name: 'Raw Materials',
            children: [
                { code: 'RM_METALS', name: 'Metals' },
                { code: 'RM_PLASTICS', name: 'Plastics' },
                { code: 'RM_TEXTILES', name: 'Textiles' },
            ],
        },
        {
            code: 'PACKAGING',
            name: 'Packaging',
            children: [
                { code: 'PKG_BOXES', name: 'Boxes' },
                { code: 'PKG_WRAPPING', name: 'Wrapping' },
            ],
        },
        {
            code: 'SPARE_PARTS',
            name: 'Spare Parts',
            children: [
                { code: 'SP_MECHANICAL', name: 'Mechanical' },
                { code: 'SP_ELECTRICAL', name: 'Electrical' },
            ],
        },
        {
            code: 'CONSUMABLES',
            name: 'Consumables',
            children: [
                { code: 'CON_CHEMICALS', name: 'Chemicals' },
                { code: 'CON_SAFETY', name: 'Safety Gear' },
            ],
        },
    ]
    let catSort = 1
    for (const parent of categoryTree) {
        const p = await prisma.mmMaterialCategory.upsert({
            where: { code: parent.code },
            update: {},
            create: { code: parent.code, name: parent.name, sortOrder: catSort++ },
        })
        for (const child of parent.children) {
            await prisma.mmMaterialCategory.upsert({
                where: { code: child.code },
                update: {},
                create: {
                    code: child.code,
                    name: child.name,
                    parentId: p.id,
                    sortOrder: catSort++,
                },
            })
        }
    }

    // ── UOMs (full catalog) ─────────────────────────────────────────
    const uoms = [
        // Count / discrete
        { code: 'PCS', name: 'Piece', symbol: 'pcs' },
        { code: 'EA', name: 'Each', symbol: 'ea' },
        { code: 'DZ', name: 'Dozen', symbol: 'dz' },
        { code: 'GRO', name: 'Gross (144)', symbol: 'gr' },
        { code: 'PR', name: 'Pair', symbol: 'pr' },
        { code: 'SET', name: 'Set', symbol: 'set' },
        // Packaging
        { code: 'BOX', name: 'Box', symbol: 'box' },
        { code: 'CTN', name: 'Carton', symbol: 'ctn' },
        { code: 'CASE', name: 'Case', symbol: 'case' },
        { code: 'PAL', name: 'Pallet', symbol: 'pal' },
        { code: 'BAG', name: 'Bag', symbol: 'bag' },
        { code: 'BTL', name: 'Bottle', symbol: 'btl' },
        { code: 'CAN', name: 'Can', symbol: 'can' },
        { code: 'DRM', name: 'Drum', symbol: 'drm' },
        { code: 'PACK', name: 'Pack', symbol: 'pk' },
        { code: 'ROLL', name: 'Roll', symbol: 'roll' },
        { code: 'BDL', name: 'Bundle', symbol: 'bdl' },
        { code: 'REAM', name: 'Ream', symbol: 'ream' },
        // Weight
        { code: 'MG', name: 'Milligram', symbol: 'mg' },
        { code: 'G', name: 'Gram', symbol: 'g' },
        { code: 'KG', name: 'Kilogram', symbol: 'kg' },
        { code: 'TON', name: 'Metric Ton', symbol: 't' },
        { code: 'LB', name: 'Pound', symbol: 'lb' },
        { code: 'OZ', name: 'Ounce', symbol: 'oz' },
        // Volume
        { code: 'ML', name: 'Milliliter', symbol: 'mL' },
        { code: 'L', name: 'Liter', symbol: 'L' },
        { code: 'GAL', name: 'Gallon (US)', symbol: 'gal' },
        { code: 'QT', name: 'Quart (US)', symbol: 'qt' },
        { code: 'PT', name: 'Pint (US)', symbol: 'pt' },
        { code: 'CBM', name: 'Cubic Meter', symbol: 'm³' },
        // Length
        { code: 'MM', name: 'Millimeter', symbol: 'mm' },
        { code: 'CM', name: 'Centimeter', symbol: 'cm' },
        { code: 'M', name: 'Meter', symbol: 'm' },
        { code: 'KM', name: 'Kilometer', symbol: 'km' },
        { code: 'IN', name: 'Inch', symbol: 'in' },
        { code: 'FT', name: 'Foot', symbol: 'ft' },
        { code: 'YD', name: 'Yard', symbol: 'yd' },
        // Area
        { code: 'SQM', name: 'Square Meter', symbol: 'm²' },
        { code: 'SQFT', name: 'Square Foot', symbol: 'ft²' },
        // Time (service / rental)
        { code: 'HR', name: 'Hour', symbol: 'hr' },
        { code: 'DAY', name: 'Day', symbol: 'day' },
        { code: 'WK', name: 'Week', symbol: 'wk' },
        { code: 'MO', name: 'Month', symbol: 'mo' },
    ]
    for (let i = 0; i < uoms.length; i++) {
        await prisma.mmUom.upsert({
            where: { code: uoms[i].code },
            update: {
                name: uoms[i].name,
                symbol: uoms[i].symbol,
                sortOrder: i + 1,
                isActive: true,
                deletedAt: null,
            },
            create: { ...uoms[i], sortOrder: i + 1 },
        })
    }

    // ── UOM conversions (1 from = factor to) ────────────────────────
    const uomByCode = Object.fromEntries(
        (await prisma.mmUom.findMany({ where: { deletedAt: null } })).map((u) => [u.code, u]),
    )
    const conversions: { from: string; to: string; factor: number }[] = [
        // Count
        { from: 'DZ', to: 'PCS', factor: 12 },
        { from: 'GRO', to: 'PCS', factor: 144 },
        { from: 'GRO', to: 'DZ', factor: 12 },
        { from: 'PR', to: 'PCS', factor: 2 },
        { from: 'EA', to: 'PCS', factor: 1 },
        // Packaging (generic defaults — override per material when needed)
        { from: 'PACK', to: 'PCS', factor: 10 },
        { from: 'BOX', to: 'PCS', factor: 12 },
        { from: 'BOX', to: 'PACK', factor: 1 },
        { from: 'CTN', to: 'BOX', factor: 10 },
        { from: 'CTN', to: 'PCS', factor: 120 },
        { from: 'CASE', to: 'PCS', factor: 24 },
        { from: 'PAL', to: 'CTN', factor: 20 },
        { from: 'PAL', to: 'BOX', factor: 200 },
        { from: 'REAM', to: 'PCS', factor: 500 },
        { from: 'BDL', to: 'PCS', factor: 10 },
        // Weight
        { from: 'G', to: 'MG', factor: 1000 },
        { from: 'KG', to: 'G', factor: 1000 },
        { from: 'KG', to: 'MG', factor: 1_000_000 },
        { from: 'TON', to: 'KG', factor: 1000 },
        { from: 'LB', to: 'OZ', factor: 16 },
        { from: 'KG', to: 'LB', factor: 2.20462 },
        { from: 'LB', to: 'KG', factor: 0.453592 },
        // Volume
        { from: 'L', to: 'ML', factor: 1000 },
        { from: 'GAL', to: 'QT', factor: 4 },
        { from: 'QT', to: 'PT', factor: 2 },
        { from: 'GAL', to: 'L', factor: 3.78541 },
        { from: 'L', to: 'GAL', factor: 0.264172 },
        { from: 'CBM', to: 'L', factor: 1000 },
        // Length
        { from: 'CM', to: 'MM', factor: 10 },
        { from: 'M', to: 'CM', factor: 100 },
        { from: 'M', to: 'MM', factor: 1000 },
        { from: 'KM', to: 'M', factor: 1000 },
        { from: 'FT', to: 'IN', factor: 12 },
        { from: 'YD', to: 'FT', factor: 3 },
        { from: 'M', to: 'FT', factor: 3.28084 },
        { from: 'IN', to: 'CM', factor: 2.54 },
        // Area
        { from: 'SQM', to: 'SQFT', factor: 10.7639 },
        { from: 'SQFT', to: 'SQM', factor: 0.092903 },
        // Time
        { from: 'DAY', to: 'HR', factor: 24 },
        { from: 'WK', to: 'DAY', factor: 7 },
        { from: 'MO', to: 'DAY', factor: 30 },
    ]
    for (const c of conversions) {
        const fromUom = uomByCode[c.from]
        const toUom = uomByCode[c.to]
        if (!fromUom || !toUom) continue
        const existing = await prisma.mmUomConversion.findFirst({
            where: {
                fromUomId: fromUom.id,
                toUomId: toUom.id,
                materialId: null,
            },
        })
        if (existing) {
            await prisma.mmUomConversion.update({
                where: { id: existing.id },
                data: { factor: c.factor, deletedAt: null },
            })
        } else {
            await prisma.mmUomConversion.create({
                data: {
                    fromUomId: fromUom.id,
                    toUomId: toUom.id,
                    factor: c.factor,
                    materialId: null,
                },
            })
        }
    }
    console.log(`Seeded ${uoms.length} UOMs and ${conversions.length} conversions`)

    // ── Currencies ──────────────────────────────────────────────────
    const currencies = [
        { code: 'USD', name: 'US Dollar', symbol: '$' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
        { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
        { code: 'GBP', name: 'British Pound', symbol: '£' },
        { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    ]
    for (const cur of currencies) {
        await prisma.mmCurrency.upsert({
            where: { code: cur.code },
            update: {},
            create: cur,
        })
    }

    // ── Valuation Classes ───────────────────────────────────────────
    const valClasses = [
        { code: 'MOVING_AVERAGE', name: 'Moving Average' },
        { code: 'FIFO', name: 'FIFO' },
        { code: 'LIFO', name: 'LIFO' },
        { code: 'STANDARD_COST', name: 'Standard Cost' },
    ]
    for (const vc of valClasses) {
        await prisma.mmValuationClass.upsert({
            where: { code: vc.code },
            update: {},
            create: vc,
        })
    }

    // ── Update MAIN warehouse type ─────────────────────────────────
    await prisma.warehouse.update({
        where: { id: mainWarehouse.id },
        data: { warehouseType: 'GENERAL' },
    })

    // ── Sample Materials (needed for warehouse ops seeding) ─────────
    const rawMatType = await prisma.mmMaterialType.findUnique({ where: { code: 'RAW_MATERIAL' } })
    const finGoodType = await prisma.mmMaterialType.findUnique({ where: { code: 'FINISHED_GOOD' } })
    const metalsCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'RM_METALS' } })
    const hardwareCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'IT_HARDWARE' } })
    const pcsUom = await prisma.mmUom.findUnique({ where: { code: 'PCS' } })
    const kgUom = await prisma.mmUom.findUnique({ where: { code: 'KG' } })

    if (!rawMatType || !finGoodType || !metalsCat || !hardwareCat || !pcsUom || !kgUom) {
        console.log('Skipping warehouse ops seed — prerequisite reference data missing')
        return
    }

    const matA = await prisma.mmMaterial.upsert({
        where: { materialCode: 'MAT-STEEL-001' },
        update: {},
        create: {
            materialCode: 'MAT-STEEL-001',
            materialName: 'Steel Rod 10mm',
            materialTypeId: rawMatType.id,
            materialCategoryId: metalsCat.id,
            baseUomId: kgUom.id,
            status: 'ACTIVE',
            companyId: company.id,
            defaultWarehouseId: mainWarehouse.id,
        },
    })

    const matB = await prisma.mmMaterial.upsert({
        where: { materialCode: 'MAT-LAPTOP-001' },
        update: {},
        create: {
            materialCode: 'MAT-LAPTOP-001',
            materialName: 'Business Laptop 15"',
            materialTypeId: finGoodType.id,
            materialCategoryId: hardwareCat.id,
            baseUomId: pcsUom.id,
            status: 'ACTIVE',
            companyId: company.id,
            defaultWarehouseId: mainWarehouse.id,
        },
    })

    // ── Look up bins for seeding ────────────────────────────────────
    const binA01_001 = await prisma.wmStorageBin.findFirst({
        where: { code: 'A01-01-001' },
    })
    const binA01_002 = await prisma.wmStorageBin.findFirst({
        where: { code: 'A01-01-002' },
    })
    const binB01_001 = await prisma.wmStorageBin.findFirst({
        where: { code: 'B01-01-001' },
    })
    const binP01_001 = await prisma.wmStorageBin.findFirst({
        where: { code: 'P01-01-001' },
    })
    const binA02_001 = await prisma.wmStorageBin.findFirst({
        where: { code: 'A02-01-001' },
    })

    if (!binA01_001 || !binA01_002 || !binB01_001 || !binP01_001 || !binA02_001) {
        console.log('Skipping warehouse ops seed — bins not found')
        return
    }

    // ── Inventory Balances ──────────────────────────────────────────
    const existingBalance = await prisma.wmInventoryBalance.findFirst({
        where: { binId: binA01_001.id, materialId: matA.id },
    })
    if (!existingBalance) {
        await prisma.wmInventoryBalance.createMany({
            data: [
                {
                    binId: binA01_001.id,
                    materialId: matA.id,
                    quantity: 50,
                    reservedQuantity: 0,
                    availableQuantity: 50,
                },
                {
                    binId: binP01_001.id,
                    materialId: matB.id,
                    quantity: 20,
                    reservedQuantity: 5,
                    availableQuantity: 15,
                },
                {
                    binId: binB01_001.id,
                    materialId: matA.id,
                    quantity: 200,
                    reservedQuantity: 0,
                    availableQuantity: 200,
                },
            ],
        })
    }

    // ── Putaway Tasks ───────────────────────────────────────────────
    const existingPutaway = await prisma.wmPutawayTask.findFirst({
        where: { taskNumber: 'PA-000001' },
    })
    if (!existingPutaway) {
        await prisma.wmPutawayTask.create({
            data: {
                taskNumber: 'PA-000001',
                warehouseId: mainWarehouse.id,
                materialId: matA.id,
                quantity: 30,
                recommendedBinId: binA01_002.id,
                status: 'PENDING',
                priority: 3,
            },
        })
        await prisma.wmPutawayTask.create({
            data: {
                taskNumber: 'PA-000002',
                warehouseId: mainWarehouse.id,
                materialId: matB.id,
                quantity: 10,
                recommendedBinId: binP01_001.id,
                actualBinId: binP01_001.id,
                status: 'COMPLETED',
                completedAt: new Date(),
                assignedWorker: 'worker-1',
                priority: 5,
            },
        })
        await prisma.wmPutawayTask.create({
            data: {
                taskNumber: 'PA-000003',
                warehouseId: mainWarehouse.id,
                materialId: matA.id,
                quantity: 100,
                recommendedBinId: binB01_001.id,
                status: 'ASSIGNED',
                assignedWorker: 'worker-2',
                priority: 1,
            },
        })
    }

    // ── Pick Wave + Picking Tasks ───────────────────────────────────
    const existingWave = await prisma.wmPickWave.findFirst({
        where: { waveNumber: 'WV-000001' },
    })
    if (!existingWave) {
        const wave = await prisma.wmPickWave.create({
            data: {
                waveNumber: 'WV-000001',
                warehouseId: mainWarehouse.id,
                strategy: 'FIFO',
                status: 'IN_PROGRESS',
                taskCount: 2,
            },
        })
        await prisma.wmPickingTask.create({
            data: {
                taskNumber: 'PK-000001',
                waveId: wave.id,
                warehouseId: mainWarehouse.id,
                sourceBinId: binA01_001.id,
                materialId: matA.id,
                requiredQty: 10,
                pickedQty: 0,
                status: 'OPEN',
                priority: 3,
            },
        })
        await prisma.wmPickingTask.create({
            data: {
                taskNumber: 'PK-000002',
                waveId: wave.id,
                warehouseId: mainWarehouse.id,
                sourceBinId: binP01_001.id,
                materialId: matB.id,
                requiredQty: 5,
                pickedQty: 0,
                status: 'ASSIGNED',
                assignedUser: 'picker-1',
                priority: 5,
            },
        })
    }

    // ── Package + Items ─────────────────────────────────────────────
    const existingPackage = await prisma.wmPackage.findFirst({
        where: { packageNumber: 'PKG-000001' },
    })
    if (!existingPackage) {
        await prisma.wmPackage.create({
            data: {
                packageNumber: 'PKG-000001',
                warehouseId: mainWarehouse.id,
                orderNumber: 'SO-2026-001',
                packageType: 'BOX',
                status: 'OPEN',
                items: {
                    create: [
                        {
                            materialId: matA.id,
                            expectedQty: 10,
                            scannedQty: 0,
                            status: 'PENDING',
                        },
                        {
                            materialId: matB.id,
                            expectedQty: 2,
                            scannedQty: 0,
                            status: 'PENDING',
                        },
                    ],
                },
            },
        })
    }

    // ── Warehouse Transfer ──────────────────────────────────────────
    const existingTransfer = await prisma.wmWarehouseTransfer.findFirst({
        where: { transferNumber: 'TO-000001' },
    })
    if (!existingTransfer) {
        await prisma.wmWarehouseTransfer.create({
            data: {
                transferNumber: 'TO-000001',
                sourceWarehouseId: mainWarehouse.id,
                destinationWarehouseId: secondaryWarehouse.id,
                requestedBy: 'admin',
                status: 'DRAFT',
                notes: 'Monthly stock rebalance',
                lines: {
                    create: [
                        {
                            materialId: matA.id,
                            quantity: 25,
                            sourceBinId: binA01_001.id,
                            status: 'PENDING',
                        },
                        {
                            materialId: matB.id,
                            quantity: 5,
                            sourceBinId: binP01_001.id,
                            status: 'PENDING',
                        },
                    ],
                },
            },
        })
    }

    console.log('MM seed complete (including warehouse operations).')

    await seedMmFull(prisma, {
        company,
        plant,
        branch,
        mainWarehouse,
        secondaryWarehouse,
        matA,
        matB,
        binA01_001,
        binP01_001,
        binB01_001,
    })
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
