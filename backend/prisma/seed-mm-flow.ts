import type { PrismaClient } from '@prisma/client'

export type SeedFlowCtx = {
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

const DEMO = 'mm-flow-walkthrough-v1'

/**
 * Story-driven documents across MM-01…MM-15 so each module has readable examples
 * after a full purge + org seed. Idempotent via unique document numbers.
 */
export async function seedMmEndToEndFlow(prisma: PrismaClient, ctx: SeedFlowCtx) {
    console.log('Seeding MM end-to-end walkthrough …')

    const php = await prisma.mmCurrency.findUnique({ where: { code: 'PHP' } })
    const net30 = await prisma.mmPaymentTerms.findUnique({ where: { code: 'NET30' } })
    const supAcme = await prisma.mmSupplier.findUnique({ where: { supplierCode: 'SUP-ACME' } })
    const supTech = await prisma.mmSupplier.findUnique({ where: { supplierCode: 'SUP-TECHWORLD' } })
    const matGloves = await prisma.mmMaterial.findUnique({ where: { materialCode: 'MAT-GLV-001' } })
    const matBox = await prisma.mmMaterial.findUnique({ where: { materialCode: 'MAT-BOX-001' } })
    const binR01 = await prisma.wmStorageBin.findFirst({ where: { code: 'R01-01-001' } })

    if (!php || !net30 || !supAcme || !supTech) {
        console.log('Skipping flow seed — base master data missing')
        return
    }

    // ── Unified warehouse task queue (Task Queue / My Tasks / Exceptions UI) ──
    const taskSpecs = [
        {
            taskNumber: 'WT-FLOW-001',
            taskType: 'PUTAWAY',
            status: 'PENDING',
            materialId: ctx.matA.id,
            quantity: 30,
            sourceBinId: binR01?.id ?? null,
            destinationBinId: ctx.binA01_001.id,
            priority: 2,
        },
        {
            taskNumber: 'WT-FLOW-002',
            taskType: 'PICK',
            status: 'ASSIGNED',
            materialId: ctx.matB.id,
            quantity: 5,
            sourceBinId: ctx.binP01_001.id,
            destinationBinId: null,
            assignedUserId: 'demo.picker',
            priority: 4,
        },
        {
            taskNumber: 'WT-FLOW-003',
            taskType: 'TRANSFER',
            status: 'IN_PROGRESS',
            materialId: ctx.matA.id,
            quantity: 25,
            sourceBinId: ctx.binA01_001.id,
            destinationBinId: ctx.binB01_001.id,
            assignedUserId: 'demo.worker',
            priority: 3,
        },
        {
            taskNumber: 'WT-FLOW-004',
            taskType: 'COUNT',
            status: 'PENDING',
            materialId: ctx.matA.id,
            quantity: 1,
            sourceBinId: ctx.binA01_001.id,
            destinationBinId: ctx.binA01_001.id,
            priority: 5,
        },
        {
            taskNumber: 'WT-FLOW-005',
            taskType: 'PICK',
            status: 'EXCEPTION',
            materialId: ctx.matB.id,
            quantity: 2,
            sourceBinId: ctx.binP01_001.id,
            destinationBinId: null,
            assignedUserId: 'demo.picker',
            priority: 1,
            exceptionReason: 'WRONG_BIN',
        },
    ] as const

    for (const spec of taskSpecs) {
        const exists = await prisma.wmWarehouseTask.findUnique({
            where: { taskNumber: spec.taskNumber },
        })
        if (exists) continue
        const task = await prisma.wmWarehouseTask.create({
            data: {
                taskNumber: spec.taskNumber,
                companyId: ctx.company.id,
                plantId: ctx.plant.id,
                warehouseId: ctx.mainWarehouse.id,
                taskType: spec.taskType,
                status: spec.status,
                priority: spec.priority,
                materialId: spec.materialId,
                quantity: spec.quantity,
                completedQuantity: spec.status === 'IN_PROGRESS' ? 10 : 0,
                sourceBinId: spec.sourceBinId,
                destinationBinId: spec.destinationBinId,
                assignedUserId: 'assignedUserId' in spec ? spec.assignedUserId : undefined,
                uomId: spec.materialId === ctx.matA.id ? ctx.matA.baseUomId : ctx.matB.baseUomId,
                referenceType: 'DEMO_SEED',
                referenceId: DEMO,
                stockStatus: 'UNRESTRICTED',
                exceptionReason: 'exceptionReason' in spec ? spec.exceptionReason : undefined,
                metadata: { walkthrough: DEMO, label: spec.taskNumber },
            },
        })
        if (spec.status === 'EXCEPTION') {
            await prisma.wmWarehouseTaskException.create({
                data: {
                    taskId: task.id,
                    exceptionCode: 'WRONG_BIN',
                    details: 'Picker scanned bin P01-01-002 but system expected P01-01-001.',
                },
            })
        }
    }

    // ── Supplier quotation (Procurement) ─────────────────────────────
    const rfqDemo = await prisma.mmRfq.findUnique({ where: { rfqNumber: 'RFQ-DEMO-00001' } })
    if (
        rfqDemo &&
        !(await prisma.mmSupplierQuotation.findUnique({ where: { quotationNumber: 'SQ-FLOW-00001' } }))
    ) {
        await prisma.mmSupplierQuotation.create({
            data: {
                quotationNumber: 'SQ-FLOW-00001',
                rfqId: rfqDemo.id,
                supplierId: supTech.id,
                currencyId: php.id,
                status: 'SUBMITTED',
                validityDate: new Date(Date.now() + 30 * 86400000),
                total: 448000,
                submittedAt: new Date(),
                createdBy: 'seed',
                notes: DEMO,
                lines: {
                    create: [
                        {
                            materialId: ctx.matB.id,
                            quantity: 10,
                            uomId: ctx.matB.baseUomId,
                            unitPrice: 44800,
                            lineTotal: 448000,
                        },
                    ],
                },
            },
        })
    }

    // ── Purchase contract ────────────────────────────────────────────
    if (!(await prisma.mmPurchaseContract.findUnique({ where: { contractNumber: 'PC-FLOW-00001' } }))) {
        await prisma.mmPurchaseContract.create({
            data: {
                contractNumber: 'PC-FLOW-00001',
                companyId: ctx.company.id,
                supplierId: supAcme.id,
                buyerId: 'demo.buyer',
                currencyId: php.id,
                paymentTermsId: net30.id,
                status: 'ACTIVE',
                validFrom: new Date(),
                validTo: new Date(Date.now() + 365 * 86400000),
                activatedAt: new Date(),
                createdBy: 'seed',
                notes: DEMO,
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: ctx.matA.id,
                            uomId: ctx.matA.baseUomId,
                            contractQuantity: 5000,
                            negotiatedPrice: 82,
                        },
                    ],
                },
            },
        })
    }

    // ── PO → ASN → Expected receipt → Receiving → GR → Inspection (Receiving / Quality) ──
    let poInbound = await prisma.mmPurchaseOrder.findUnique({
        where: { poNumber: 'PO-FLOW-INBOUND' },
    })
    if (!poInbound && matGloves) {
        poInbound = await prisma.mmPurchaseOrder.create({
            data: {
                poNumber: 'PO-FLOW-INBOUND',
                companyId: ctx.company.id,
                supplierId: supAcme.id,
                buyerId: 'demo.buyer',
                warehouseId: ctx.mainWarehouse.id,
                currencyId: php.id,
                status: 'APPROVED',
                expectedDeliveryDate: new Date(Date.now() + 5 * 86400000),
                paymentTermsId: net30.id,
                totalAmount: 17500,
                approvedBy: 'manager.demo',
                approvedAt: new Date(),
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: matGloves.id,
                            description: matGloves.materialName,
                            quantity: 500,
                            uomId: matGloves.baseUomId,
                            unitPrice: 35,
                            lineTotal: 17500,
                            warehouseId: ctx.mainWarehouse.id,
                        },
                    ],
                },
            },
        })
    }

    if (poInbound && matGloves && !(await prisma.mmAsn.findUnique({ where: { asnNumber: 'ASN-FLOW-00001' } }))) {
        const asn = await prisma.mmAsn.create({
            data: {
                asnNumber: 'ASN-FLOW-00001',
                companyId: ctx.company.id,
                supplierId: supAcme.id,
                purchaseOrderId: poInbound.id,
                warehouseId: ctx.mainWarehouse.id,
                shipmentNumber: 'SHIP-ACME-4401',
                carrier: 'LBC Freight',
                trackingNumber: 'LBC-2026-4401',
                expectedDate: new Date(Date.now() + 2 * 86400000),
                status: 'CONFIRMED',
                createdBy: 'seed',
                remarks: DEMO,
                lines: {
                    create: [
                        {
                            materialId: matGloves.id,
                            quantity: 500,
                            uomId: matGloves.baseUomId,
                        },
                    ],
                },
            },
        })

        const exp = await prisma.mmExpectedReceipt.create({
            data: {
                documentNumber: 'ER-FLOW-00001',
                companyId: ctx.company.id,
                supplierId: supAcme.id,
                purchaseOrderId: poInbound.id,
                asnId: asn.id,
                warehouseId: ctx.mainWarehouse.id,
                expectedDate: new Date(Date.now() + 2 * 86400000),
                status: 'OPEN',
                sourceType: 'ASN',
                createdBy: 'seed',
                remarks: DEMO,
                lines: {
                    create: [
                        {
                            materialId: matGloves.id,
                            expectedQuantity: 500,
                            uomId: matGloves.baseUomId,
                        },
                    ],
                },
            },
        })

        const expLine = await prisma.mmExpectedReceiptLine.findFirst({
            where: { expectedReceiptId: exp.id },
        })

        if (expLine) {
        const rcv = await prisma.mmReceivingDocument.create({
            data: {
                documentNumber: 'RCV-FLOW-00001',
                companyId: ctx.company.id,
                expectedReceiptId: exp.id,
                warehouseId: ctx.mainWarehouse.id,
                purchaseOrderId: poInbound.id,
                asnId: asn.id,
                supplierId: supAcme.id,
                status: 'VALIDATED',
                receiverId: 'demo.receiver',
                documentDate: new Date(),
                validatedAt: new Date(),
                validatedBy: 'demo.receiver',
                createdBy: 'seed',
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            expectedReceiptLineId: expLine.id,
                            materialId: matGloves.id,
                            receivedQuantity: 480,
                            uomId: matGloves.baseUomId,
                            storageBinId: binR01?.id,
                        },
                    ],
                },
            },
        })

        const now = new Date()
        const gr = await prisma.mmGoodsReceipt.create({
            data: {
                documentNumber: 'GR-FLOW-00001',
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                purchaseOrderId: poInbound.id,
                expectedReceiptId: exp.id,
                asnId: asn.id,
                supplierId: supAcme.id,
                receivingDocumentId: rcv.id,
                postingDate: now,
                documentDate: now,
                status: 'POSTED',
                createdBy: 'seed',
                receiverId: 'demo.receiver',
                remarks: `${DEMO} — partial receipt (480 of 500)`,
                lines: {
                    create: [
                        {
                            materialId: matGloves.id,
                            quantity: 480,
                            uomId: matGloves.baseUomId,
                            unitCost: 35,
                            totalCost: 16800,
                            storageBinId: binR01?.id,
                            stockStatus: 'QUALITY_INSPECTION',
                        },
                    ],
                },
            },
        })

        const grLine = await prisma.mmGoodsReceiptLine.findFirst({
            where: { receiptId: gr.id },
        })
        if (grLine) {
            await prisma.mmInspectionLot.create({
                data: {
                    lotNumber: 'IL-FLOW-00001',
                    companyId: ctx.company.id,
                    goodsReceiptId: gr.id,
                    goodsReceiptLineId: grLine.id,
                    materialId: matGloves.id,
                    warehouseId: ctx.mainWarehouse.id,
                    plantId: ctx.plant.id,
                    supplierId: supAcme.id,
                    purchaseOrderId: poInbound.id,
                    receivingDocumentId: rcv.id,
                    quantity: 480,
                    sampleQuantity: 20,
                    status: 'IN_PROGRESS',
                    assignedInspector: 'demo.qc',
                    remarks: DEMO,
                },
            })

            await prisma.mmReceivingVariance.create({
                data: {
                    receivingDocumentId: rcv.id,
                    varianceType: 'UNDER_RECEIPT',
                    quantity: 20,
                    description: 'Short shipment — 20 pcs missing on ASN-FLOW-00001',
                    status: 'OPEN',
                },
            })
        }
        }
    }

    // ── Goods issue (Inventory) ──────────────────────────────────────
    if (!(await prisma.mmGoodsIssue.findUnique({ where: { documentNumber: 'GI-FLOW-00001' } }))) {
        const now = new Date()
        await prisma.mmGoodsIssue.create({
            data: {
                documentNumber: 'GI-FLOW-00001',
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                postingDate: now,
                documentDate: now,
                status: 'DRAFT',
                issuePurpose: 'PRODUCTION',
                createdBy: 'seed',
                remarks: DEMO,
                lines: {
                    create: [
                        {
                            materialId: ctx.matA.id,
                            quantity: 40,
                            uomId: ctx.matA.baseUomId,
                            storageBinId: ctx.binA01_001.id,
                        },
                    ],
                },
            },
        })
    }

    // ── Stock transfer order MAIN → SECONDARY ────────────────────────
    if (!(await prisma.mmStockTransferOrder.findUnique({ where: { orderNumber: 'STO-FLOW-00001' } }))) {
        await prisma.mmStockTransferOrder.create({
            data: {
                orderNumber: 'STO-FLOW-00001',
                companyId: ctx.company.id,
                sourceWarehouseId: ctx.mainWarehouse.id,
                destinationWarehouseId: ctx.secondaryWarehouse.id,
                status: 'DRAFT',
                requestedBy: 'demo.planner',
                notes: DEMO,
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: ctx.matA.id,
                            quantity: 50,
                            uomId: ctx.matA.baseUomId,
                            sourceBinId: ctx.binA01_001.id,
                        },
                        ...(matBox
                            ? [
                                  {
                                      lineNumber: 2,
                                      materialId: matBox.id,
                                      quantity: 100,
                                      uomId: matBox.baseUomId,
                                      sourceBinId: ctx.binB01_001.id,
                                  },
                              ]
                            : []),
                    ],
                },
            },
        })
    }

    // ── MRP run + requirement snapshot (Planning) ────────────────────
    if (!(await prisma.mmMrpRun.findUnique({ where: { runNumber: 'MRP-FLOW-00001' } }))) {
        const started = new Date(Date.now() - 3600000)
        const mrp = await prisma.mmMrpRun.create({
            data: {
                runNumber: 'MRP-FLOW-00001',
                companyId: ctx.company.id,
                plantId: ctx.plant.id,
                warehouseId: ctx.mainWarehouse.id,
                status: 'COMPLETED',
                startedAt: started,
                completedAt: new Date(),
                planningHorizonDays: 30,
                resultsCount: 1,
                createdBy: 'seed',
                parametersJson: { demo: DEMO },
            },
        })
        await prisma.mmMaterialRequirement.create({
            data: {
                mrpRunId: mrp.id,
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                materialId: ctx.matA.id,
                unrestrictedQty: 250,
                availableQty: 250,
                grossDemand: 150,
                netRequirement: 100,
                recommendedQty: 200,
                shortageQty: 0,
                recommendedAction: 'CREATE_PR',
                source: 'REORDER',
                belowReorderPoint: false,
                shortage: false,
            },
        })
        await prisma.mmProcurementSuggestion.create({
            data: {
                mrpRunId: mrp.id,
                suggestionType: 'PR_RECOMMENDATION',
                companyId: ctx.company.id,
                warehouseId: ctx.mainWarehouse.id,
                materialId: ctx.matA.id,
                quantity: 200,
                uomId: ctx.matA.baseUomId,
                requiredDate: new Date(Date.now() + 10 * 86400000),
                status: 'OPEN',
                reason: 'NET_REQUIREMENT',
                explanation: DEMO,
            },
        })
    }

    // ── Defect code + hold (Quality master) ──────────────────────────
    await prisma.mmDefectCode.upsert({
        where: { companyId_code: { companyId: ctx.company.id, code: 'DAMAGED' } },
        update: {},
        create: {
            companyId: ctx.company.id,
            code: 'DAMAGED',
            description: 'Physical damage on receipt',
            category: 'QUALITY',
            severityDefault: 'HIGH',
        },
    })

    console.log('MM end-to-end walkthrough seed complete.')
    console.log('  See docs/MM_DEMO_WALKTHROUGH.md for the recommended click-path.')
}
