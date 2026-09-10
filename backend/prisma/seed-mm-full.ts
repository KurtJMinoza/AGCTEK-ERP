import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

type SeedCtx = {
    company: { id: string }
    plant: { id: string }
    branch: { id: string }
    mainWarehouse: { id: string }
    secondaryWarehouse: { id: string }
    matA: { id: string; baseUomId: string }
    matB: { id: string; baseUomId: string }
    binA01_001: { id: string }
    binP01_001: { id: string }
    binB01_001: { id: string }
}

async function upsertStock(
    prisma: PrismaClient,
    args: {
        companyId: string
        warehouseId: string
        storageBinId?: string | null
        materialId: string
        uomId: string
        quantity: number
        unitCost?: number
        transactionNumber: string
    },
) {
    const qty = new Decimal(args.quantity)
    const unitCost = new Decimal(args.unitCost ?? 10)
    const now = new Date()

    const existingBal = await prisma.mmInventoryBalance.findFirst({
        where: {
            companyId: args.companyId,
            warehouseId: args.warehouseId,
            storageBinId: args.storageBinId ?? null,
            materialId: args.materialId,
            batchId: null,
            serialNumberId: null,
            stockStatus: 'UNRESTRICTED',
        },
    })

    if (existingBal) {
        await prisma.mmInventoryBalance.update({
            where: { id: existingBal.id },
            data: {
                quantity: existingBal.quantity.add(qty),
                availableQuantity: existingBal.availableQuantity.add(qty),
            },
        })
    } else {
        await prisma.mmInventoryBalance.create({
            data: {
                companyId: args.companyId,
                warehouseId: args.warehouseId,
                storageBinId: args.storageBinId ?? null,
                materialId: args.materialId,
                stockStatus: 'UNRESTRICTED',
                quantity: qty,
                reservedQuantity: 0,
                availableQuantity: qty,
            },
        })
    }

    const existingTxn = await prisma.mmInventoryTransaction.findUnique({
        where: { transactionNumber: args.transactionNumber },
    })
    if (!existingTxn) {
        await prisma.mmInventoryTransaction.create({
            data: {
                transactionNumber: args.transactionNumber,
                companyId: args.companyId,
                warehouseId: args.warehouseId,
                storageBinId: args.storageBinId ?? null,
                materialId: args.materialId,
                stockStatus: 'UNRESTRICTED',
                movementType: 'RECEIPT',
                quantity: qty,
                baseQuantity: qty,
                signedQuantity: qty,
                uomId: args.uomId,
                unitCost,
                totalCost: qty.mul(unitCost),
                postingDate: now,
                documentDate: now,
                sourceModule: 'SEED',
                sourceDocumentType: 'OPENING_BALANCE',
                remarks: 'Demo seed stock',
                createdBy: 'seed',
            },
        })
    }
}

export async function seedMmFull(prisma: PrismaClient, ctx: SeedCtx) {
    console.log('Seeding full MM demo data …')

    const php = await prisma.mmCurrency.findUnique({ where: { code: 'PHP' } })
    const usd = await prisma.mmCurrency.findUnique({ where: { code: 'USD' } })
    const pcsUom = await prisma.mmUom.findUnique({ where: { code: 'PCS' } })
    const kgUom = await prisma.mmUom.findUnique({ where: { code: 'KG' } })
    const lUom = await prisma.mmUom.findUnique({ where: { code: 'L' } })
    const hrUom = await prisma.mmUom.findUnique({ where: { code: 'HR' } })
    const ctnUom = await prisma.mmUom.findUnique({ where: { code: 'CTN' } })
    const rawMatType = await prisma.mmMaterialType.findUnique({ where: { code: 'RAW_MATERIAL' } })
    const finGoodType = await prisma.mmMaterialType.findUnique({ where: { code: 'FINISHED_GOOD' } })
    const packagingType = await prisma.mmMaterialType.findUnique({ where: { code: 'PACKAGING' } })
    const consumableType = await prisma.mmMaterialType.findUnique({ where: { code: 'CONSUMABLE' } })
    const serviceType = await prisma.mmMaterialType.findUnique({ where: { code: 'SERVICE' } })
    const metalsCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'RM_METALS' } })
    const hardwareCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'IT_HARDWARE' } })
    const boxesCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'PKG_BOXES' } })
    const safetyCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'CON_SAFETY' } })
    const chemicalsCat = await prisma.mmMaterialCategory.findUnique({ where: { code: 'CON_CHEMICALS' } })

    if (!php || !pcsUom || !kgUom || !rawMatType || !finGoodType) {
        console.log('Skipping MM full seed — reference data missing')
        return
    }

    // ── Payment terms ───────────────────────────────────────────────
    const net30 = await prisma.mmPaymentTerms.upsert({
        where: { code: 'NET30' },
        update: {},
        create: { code: 'NET30', name: 'Net 30 days', dueDays: 30 },
    })
    await prisma.mmPaymentTerms.upsert({
        where: { code: 'NET15' },
        update: {},
        create: { code: 'NET15', name: 'Net 15 days', dueDays: 15 },
    })

    // ── Supplier categories ─────────────────────────────────────────
    const indCat = await prisma.mmSupplierCategory.upsert({
        where: { code: 'INDUSTRIAL' },
        update: {},
        create: { code: 'INDUSTRIAL', name: 'Industrial Suppliers', sortOrder: 1 },
    })
    const itCat = await prisma.mmSupplierCategory.upsert({
        where: { code: 'IT_VENDORS' },
        update: {},
        create: { code: 'IT_VENDORS', name: 'IT Vendors', sortOrder: 2 },
    })
    await prisma.mmSupplierCategory.upsert({
        where: { code: 'OFFICE' },
        update: {},
        create: { code: 'OFFICE', name: 'Office Supplies', sortOrder: 3 },
    })

    // ── Suppliers ───────────────────────────────────────────────────
    const supAcme = await prisma.mmSupplier.upsert({
        where: { supplierCode: 'SUP-ACME' },
        update: { status: 'ACTIVE' },
        create: {
            supplierCode: 'SUP-ACME',
            supplierName: 'Acme Industrial Supply',
            legalName: 'Acme Industrial Supply Inc.',
            supplierType: 'MANUFACTURER',
            email: 'orders@acme-industrial.example',
            phone: '+63-2-8800-1001',
            country: 'PH',
            currencyId: php.id,
            paymentTermsId: net30.id,
            defaultWarehouseId: ctx.mainWarehouse.id,
            leadTimeDays: 7,
            companyId: ctx.company.id,
            categoryId: indCat.id,
            status: 'ACTIVE',
            createdBy: 'seed',
        },
    })

    const supTech = await prisma.mmSupplier.upsert({
        where: { supplierCode: 'SUP-TECHWORLD' },
        update: { status: 'ACTIVE' },
        create: {
            supplierCode: 'SUP-TECHWORLD',
            supplierName: 'TechWorld Philippines',
            supplierType: 'DISTRIBUTOR',
            email: 'procurement@techworld.example',
            phone: '+63-2-8800-2002',
            country: 'PH',
            currencyId: usd?.id ?? php.id,
            paymentTermsId: net30.id,
            defaultWarehouseId: ctx.mainWarehouse.id,
            leadTimeDays: 14,
            companyId: ctx.company.id,
            categoryId: itCat.id,
            status: 'ACTIVE',
            createdBy: 'seed',
        },
    })

    // ── Enhance existing materials ──────────────────────────────────
    await prisma.mmMaterial.update({
        where: { id: ctx.matA.id },
        data: {
            sku: 'SKU-STEEL-10MM',
            description: 'Cold-rolled steel rod, 10mm diameter, for fabrication.',
            weight: 7.85,
            weightUom: 'KG',
            valuationMethod: 'MOVING_AVERAGE',
            standardCost: 85,
            currencyId: php.id,
            inventoryManaged: true,
            purchasable: true,
            sellable: false,
            reorderPoint: 100,
            safetyStock: 25,
            reorderQuantity: 200,
            leadTimeDays: 7,
            minimumOrderQuantity: 50,
            preferredSupplierId: supAcme.id,
        },
    })

    await prisma.mmMaterial.update({
        where: { id: ctx.matB.id },
        data: {
            sku: 'SKU-LAPTOP-15',
            description: '15-inch business laptop, 16GB RAM, 512GB SSD.',
            purchaseUomId: pcsUom.id,
            valuationMethod: 'MOVING_AVERAGE',
            standardCost: 45000,
            currencyId: php.id,
            inventoryManaged: true,
            purchasable: true,
            sellable: true,
            reorderPoint: 10,
            safetyStock: 3,
            reorderQuantity: 20,
            leadTimeDays: 14,
            preferredSupplierId: supTech.id,
        },
    })

    // ── Additional materials ────────────────────────────────────────
    let matBox = await prisma.mmMaterial.findUnique({ where: { materialCode: 'MAT-BOX-001' } })
    if (!matBox && packagingType && boxesCat) {
        matBox = await prisma.mmMaterial.create({
            data: {
                materialCode: 'MAT-BOX-001',
                materialName: 'Corrugated Box 400×300×200',
                sku: 'SKU-BOX-400',
                description: 'Standard shipping carton for finished goods.',
                materialTypeId: packagingType.id,
                materialCategoryId: boxesCat.id,
                baseUomId: pcsUom.id,
                purchaseUomId: ctnUom?.id,
                status: 'ACTIVE',
                companyId: ctx.company.id,
                defaultWarehouseId: ctx.mainWarehouse.id,
                preferredSupplierId: supAcme.id,
                valuationMethod: 'MOVING_AVERAGE',
                standardCost: 45,
                currencyId: php.id,
                inventoryManaged: true,
                purchasable: true,
                sellable: true,
                reorderPoint: 500,
                safetyStock: 100,
                reorderQuantity: 1000,
            },
        })
    }

    let matGloves = await prisma.mmMaterial.findUnique({ where: { materialCode: 'MAT-GLV-001' } })
    if (!matGloves && consumableType && safetyCat) {
        matGloves = await prisma.mmMaterial.create({
            data: {
                materialCode: 'MAT-GLV-001',
                materialName: 'Safety Gloves — Nitrile (L)',
                sku: 'SKU-GLV-NIT-L',
                materialTypeId: consumableType.id,
                materialCategoryId: safetyCat.id,
                baseUomId: pcsUom.id,
                purchaseUomId: pcsUom.id,
                status: 'ACTIVE',
                companyId: ctx.company.id,
                defaultWarehouseId: ctx.mainWarehouse.id,
                batchManaged: true,
                inventoryManaged: true,
                purchasable: true,
                valuationMethod: 'FIFO',
                standardCost: 35,
                currencyId: php.id,
                reorderPoint: 200,
                safetyStock: 50,
            },
        })
    }

    let matOil = await prisma.mmMaterial.findUnique({ where: { materialCode: 'MAT-OIL-001' } })
    if (!matOil && consumableType && chemicalsCat && lUom) {
        matOil = await prisma.mmMaterial.create({
            data: {
                materialCode: 'MAT-OIL-001',
                materialName: 'Machine Lubricant ISO 68',
                sku: 'SKU-OIL-ISO68',
                materialTypeId: consumableType.id,
                materialCategoryId: chemicalsCat.id,
                baseUomId: lUom.id,
                status: 'ACTIVE',
                companyId: ctx.company.id,
                defaultWarehouseId: ctx.mainWarehouse.id,
                preferredSupplierId: supAcme.id,
                inventoryManaged: true,
                purchasable: true,
                valuationMethod: 'MOVING_AVERAGE',
                standardCost: 320,
                currencyId: php.id,
                reorderPoint: 50,
                safetyStock: 10,
            },
        })
    }

    let matService = await prisma.mmMaterial.findUnique({ where: { materialCode: 'MAT-SERV-001' } })
    if (!matService && serviceType && hardwareCat && hrUom) {
        matService = await prisma.mmMaterial.create({
            data: {
                materialCode: 'MAT-SERV-001',
                materialName: 'IT Support — On-site (hour)',
                sku: 'SKU-SERV-IT-HR',
                materialTypeId: serviceType.id,
                materialCategoryId: hardwareCat.id,
                baseUomId: hrUom.id,
                status: 'ACTIVE',
                companyId: ctx.company.id,
                inventoryManaged: false,
                purchasable: true,
                sellable: true,
                valuationMethod: 'STANDARD_COST',
                standardCost: 1500,
                currencyId: php.id,
            },
        })
    }

    // ── Supplier materials & prices ─────────────────────────────────
    for (const [supplierId, materialId, price] of [
        [supAcme.id, ctx.matA.id, 82],
        [supAcme.id, matBox?.id, 42],
        [supTech.id, ctx.matB.id, 44500],
    ] as const) {
        if (!materialId) continue
        const existing = await prisma.mmSupplierMaterial.findFirst({
            where: { supplierId, materialId },
        })
        if (!existing) {
            await prisma.mmSupplierMaterial.create({
                data: {
                    supplierId,
                    materialId,
                    supplierMaterialCode: `V-${materialId.slice(-6)}`,
                    currencyId: php.id,
                    leadTimeDays: 7,
                    preferredSupplier: true,
                    unitPrice: price,
                },
            })
        }
        const priceExisting = await prisma.mmSupplierPrice.findFirst({
            where: { supplierId, materialId, effectiveTo: null },
        })
        if (!priceExisting) {
            await prisma.mmSupplierPrice.create({
                data: {
                    supplierId,
                    materialId,
                    unitPrice: price,
                    currencyId: php.id,
                    minimumQuantity: 1,
                    effectiveFrom: new Date(),
                },
            })
        }
    }

    // ── Barcodes ────────────────────────────────────────────────────
    for (const [materialId, value] of [
        [ctx.matA.id, '8901234567890'],
        [ctx.matB.id, '8901234567891'],
        [matBox?.id, '8901234567892'],
    ] as const) {
        if (!materialId) continue
        const exists = await prisma.mmBarcode.findFirst({
            where: { materialId, barcodeValue: value, deletedAt: null },
        })
        if (!exists) {
            await prisma.mmBarcode.create({
                data: {
                    materialId,
                    barcodeType: 'EAN13',
                    barcodeValue: value,
                    isPrimary: true,
                },
            })
        }
    }

    // ── Batch (gloves) ──────────────────────────────────────────────
    if (matGloves) {
        const batch = await prisma.mmBatch.findFirst({
            where: { materialId: matGloves.id, batchNumber: 'LOT-2026-001' },
        })
        if (!batch) {
            await prisma.mmBatch.create({
                data: {
                    materialId: matGloves.id,
                    batchNumber: 'LOT-2026-001',
                    supplierId: supAcme.id,
                    manufacturingDate: new Date('2026-01-15'),
                    expiryDate: new Date('2028-01-15'),
                    status: 'AVAILABLE',
                },
            })
        }
    }

    // ── MM inventory ledger (opening balances) ──────────────────────
    await upsertStock(prisma, {
        companyId: ctx.company.id,
        warehouseId: ctx.mainWarehouse.id,
        storageBinId: ctx.binA01_001.id,
        materialId: ctx.matA.id,
        uomId: ctx.matA.baseUomId,
        quantity: 250,
        unitCost: 85,
        transactionNumber: 'TXN-SEED-000001',
    })
    await upsertStock(prisma, {
        companyId: ctx.company.id,
        warehouseId: ctx.mainWarehouse.id,
        storageBinId: ctx.binP01_001.id,
        materialId: ctx.matB.id,
        uomId: ctx.matB.baseUomId,
        quantity: 18,
        unitCost: 45000,
        transactionNumber: 'TXN-SEED-000002',
    })
    if (matBox) {
        await upsertStock(prisma, {
            companyId: ctx.company.id,
            warehouseId: ctx.mainWarehouse.id,
            storageBinId: ctx.binB01_001.id,
            materialId: matBox.id,
            uomId: pcsUom.id,
            quantity: 1200,
            unitCost: 45,
            transactionNumber: 'TXN-SEED-000003',
        })
    }

    // ── Material valuation snapshots ────────────────────────────────
    for (const [materialId, avgCost, qty] of [
        [ctx.matA.id, 85, 250],
        [ctx.matB.id, 45000, 18],
        [matBox?.id, 45, 1200],
    ] as const) {
        if (!materialId) continue
        const existing = await prisma.mmMaterialValuation.findFirst({
            where: {
                companyId: ctx.company.id,
                materialId,
                warehouseId: ctx.mainWarehouse.id,
            },
        })
        if (!existing) {
            await prisma.mmMaterialValuation.create({
                data: {
                    companyId: ctx.company.id,
                    materialId,
                    warehouseId: ctx.mainWarehouse.id,
                    valuationMethod: 'MOVING_AVERAGE',
                    currencyId: php.id,
                    movingAverageCost: avgCost,
                    standardCost: avgCost,
                },
            })
        }
    }

    // ── Planning ────────────────────────────────────────────────────
    const demandExisting = await prisma.mmPlanningDemand.findFirst({
        where: { companyId: ctx.company.id, remarks: 'demo-seed-demand' },
    })
    if (!demandExisting) {
        const reqDate = new Date()
        reqDate.setDate(reqDate.getDate() + 14)
        await prisma.mmPlanningDemand.create({
            data: {
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                materialId: ctx.matA.id,
                demandDate: reqDate,
                quantity: 150,
                sourceType: 'MANUAL',
                remarks: 'demo-seed-demand',
            },
        })
    }

    const reorderExisting = await prisma.mmReorderRule.findFirst({
        where: { companyId: ctx.company.id, materialId: ctx.matA.id },
    })
    if (!reorderExisting) {
        await prisma.mmReorderRule.create({
            data: {
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                materialId: ctx.matA.id,
                reorderPoint: 100,
                reorderQuantity: 200,
                safetyStock: 25,
                isActive: true,
            },
        })
    }

    // ── Purchase requisitions ───────────────────────────────────────
    const prDraft = await prisma.mmPurchaseRequisition.findUnique({
        where: { requisitionNumber: 'REQ-DEMO-00001' },
    })
    if (!prDraft) {
        await prisma.mmPurchaseRequisition.create({
            data: {
                requisitionNumber: 'REQ-DEMO-00001',
                companyId: ctx.company.id,
                branchId: ctx.branch.id,
                requesterId: 'demo.user',
                requiredDate: new Date(Date.now() + 7 * 86400000),
                purpose: 'Replenish steel rod stock for production line A',
                status: 'DRAFT',
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            materialId: ctx.matA.id,
                            description: 'Steel Rod 10mm',
                            requestedQuantity: 200,
                            uomId: ctx.matA.baseUomId,
                            estimatedUnitPrice: 85,
                            estimatedTotal: 17000,
                            requiredDate: new Date(Date.now() + 7 * 86400000),
                            warehouseId: ctx.mainWarehouse.id,
                            preferredSupplierId: supAcme.id,
                        },
                    ],
                },
            },
        })
    }

    const prApproved = await prisma.mmPurchaseRequisition.findUnique({
        where: { requisitionNumber: 'REQ-DEMO-00002' },
    })
    if (!prApproved) {
        await prisma.mmPurchaseRequisition.create({
            data: {
                requisitionNumber: 'REQ-DEMO-00002',
                companyId: ctx.company.id,
                branchId: ctx.branch.id,
                requesterId: 'demo.user',
                requiredDate: new Date(Date.now() + 10 * 86400000),
                purpose: 'Laptop refresh for new hires Q3',
                status: 'APPROVED',
                approvedBy: 'manager.demo',
                approvedAt: new Date(),
                submittedAt: new Date(),
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            materialId: ctx.matB.id,
                            description: 'Business Laptop 15"',
                            requestedQuantity: 5,
                            uomId: ctx.matB.baseUomId,
                            estimatedUnitPrice: 45000,
                            estimatedTotal: 225000,
                            requiredDate: new Date(Date.now() + 10 * 86400000),
                            warehouseId: ctx.mainWarehouse.id,
                            preferredSupplierId: supTech.id,
                        },
                    ],
                },
            },
        })
    }

    // ── RFQ ───────────────────────────────────────────────────────────
    const rfqExisting = await prisma.mmRfq.findUnique({ where: { rfqNumber: 'RFQ-DEMO-00001' } })
    if (!rfqExisting) {
        await prisma.mmRfq.create({
            data: {
                rfqNumber: 'RFQ-DEMO-00001',
                companyId: ctx.company.id,
                buyerId: 'demo.buyer',
                responseDeadline: new Date(Date.now() + 14 * 86400000),
                currencyId: php.id,
                status: 'OPEN',
                purpose: 'Q3 Laptop procurement',
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: ctx.matB.id,
                            quantity: 10,
                            uomId: ctx.matB.baseUomId,
                            specifications: 'Business Laptop 15"',
                        },
                    ],
                },
                invitedSuppliers: {
                    create: [{ supplierId: supTech.id, responseStatus: 'INVITED' }],
                },
            },
        })
    }

    // ── Purchase order ──────────────────────────────────────────────
    const poExisting = await prisma.mmPurchaseOrder.findUnique({
        where: { poNumber: 'PO-DEMO-00001' },
    })
    if (!poExisting) {
        await prisma.mmPurchaseOrder.create({
            data: {
                poNumber: 'PO-DEMO-00001',
                companyId: ctx.company.id,
                supplierId: supAcme.id,
                buyerId: 'demo.buyer',
                warehouseId: ctx.mainWarehouse.id,
                currencyId: php.id,
                status: 'APPROVED',
                expectedDeliveryDate: new Date(Date.now() + 7 * 86400000),
                paymentTermsId: net30.id,
                totalAmount: matBox ? 45600 : 24600,
                approvedBy: 'manager.demo',
                approvedAt: new Date(),
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: ctx.matA.id,
                            description: 'Steel Rod 10mm',
                            quantity: 300,
                            uomId: ctx.matA.baseUomId,
                            unitPrice: 82,
                            lineTotal: 24600,
                            warehouseId: ctx.mainWarehouse.id,
                        },
                        ...(matBox
                            ? [{
                                lineNumber: 2,
                                materialId: matBox.id,
                                description: matBox.materialName,
                                quantity: 500,
                                uomId: pcsUom.id,
                                unitPrice: 42,
                                lineTotal: 21000,
                                warehouseId: ctx.mainWarehouse.id,
                            }]
                            : []),
                    ],
                },
            },
        })
    }

    // ── Goods receipt (posted header — demo visibility) ───────────────
    const grExisting = await prisma.mmGoodsReceipt.findUnique({
        where: { documentNumber: 'GR-DEMO-00001' },
    })
    if (!grExisting) {
        const now = new Date()
        await prisma.mmGoodsReceipt.create({
            data: {
                documentNumber: 'GR-DEMO-00001',
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                supplierId: supTech.id,
                status: 'POSTED',
                postingDate: now,
                documentDate: now,
                createdBy: 'seed',
                receiverId: 'seed',
                lines: {
                    create: [
                        {
                            materialId: ctx.matB.id,
                            quantity: 3,
                            uomId: ctx.matB.baseUomId,
                            unitCost: 44500,
                            totalCost: 133500,
                            storageBinId: ctx.binP01_001.id,
                            stockStatus: 'UNRESTRICTED',
                        },
                    ],
                },
            },
        })
    }

    // ── Inventory count ─────────────────────────────────────────────
    const countExisting = await prisma.mmInventoryCount.findUnique({
        where: { countNumber: 'CC-DEMO-00001' },
    })
    if (!countExisting) {
        await prisma.mmInventoryCount.create({
            data: {
                countNumber: 'CC-DEMO-00001',
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                countType: 'CYCLE',
                status: 'OPEN',
                dueDate: new Date(Date.now() + 3 * 86400000),
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: ctx.matA.id,
                            storageBinId: ctx.binA01_001.id,
                            systemQuantity: 250,
                            status: 'PENDING',
                        },
                        {
                            lineNumber: 2,
                            materialId: ctx.matB.id,
                            storageBinId: ctx.binP01_001.id,
                            systemQuantity: 18,
                            status: 'PENDING',
                        },
                    ],
                },
            },
        })
    }

    // ── Returns / disposal config ───────────────────────────────────
    await prisma.mmReturnsDisposalConfig.upsert({
        where: { companyId: ctx.company.id },
        update: {},
        create: {
            companyId: ctx.company.id,
            approvalAmountThreshold: 10000,
            approvalQuantityThreshold: 0,
        },
    })

    // ── Supplier evaluation config ──────────────────────────────────
    await prisma.mmSupplierScoreWeightConfig.upsert({
        where: { companyId: ctx.company.id },
        update: {},
        create: {
            companyId: ctx.company.id,
            deliveryWeight: 30,
            qualityWeight: 30,
            priceWeight: 20,
            serviceWeight: 10,
            complianceWeight: 10,
        },
    })

    console.log('MM full demo seed complete.')
}
