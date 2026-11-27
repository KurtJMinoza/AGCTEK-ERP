/**
 * Seeds PO → posted GR (inventory + GR/IR) → supplier invoice → three-way match
 * through the same Nest services the UI uses.
 *
 *   cd backend && npm run prisma:seed-p2p-demo
 *
 * Idempotent: re-run skips when a PO exists with deliveryTerms = seed-p2p-demo-v1.
 * Prerequisites: company AGCTEK, SUP-ACME, purchasable material, MAIN warehouse,
 * open FICO posting period, GR_IR / inventory account determination (or company GL defaults).
 */
import { seedAccountDetermination } from './seed-account-determination'

const TAG = 'seed-p2p-demo-v1'
const FICO_SEED = 'seed-p2p-demo-fico'
const BUYER = 'seed.p2p.buyer'
const APPROVER = 'seed.p2p.approver'
const QTY = 100
const UNIT_PRICE = 35

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

async function ensureP2pFicoReady(
    prisma: InstanceType<typeof import('@prisma/client').PrismaClient>,
    companyId: string,
) {
    const det = await seedAccountDetermination(prisma)
    if (!det.skipped) {
        console.log('   Account determination master data ensured.')
    }
    const now = new Date()
    const ruleCodes = ['MM-001', 'MM-002']
    for (const code of ruleCodes) {
        const rule = await prisma.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: code },
        })
        if (rule && rule.status !== 'ACTIVE') {
            await prisma.ficoAccountDeterminationRule.update({
                where: { id: rule.id },
                data: {
                    status: 'ACTIVE',
                    effectiveFrom: new Date('2020-01-01'),
                    effectiveTo: null,
                    approvedAt: now,
                    approvedBy: FICO_SEED,
                    activatedAt: now,
                    activatedBy: FICO_SEED,
                },
            })
        }
    }

    const accountCodes: Array<{ code: string; apRecon?: boolean }> = [
        { code: '120100' },
        { code: '210200' },
        { code: '210100', apRecon: true },
    ]
    for (const { code, apRecon } of accountCodes) {
        const acct = await prisma.ficoGlAccount.findFirst({
            where: { accountCode: code },
        })
        if (!acct) continue
        if (apRecon) {
            await prisma.ficoGlAccount.update({
                where: { id: acct.id },
                data: {
                    accountType: 'LIABILITY',
                    isReconciliationAccount: true,
                    reconciliationType: 'AP',
                    allowAutomaticPosting: true,
                },
            })
        }
        const assignment = await prisma.ficoCompanyGlAccount.findFirst({
            where: { companyId, glAccountId: acct.id },
        })
        if (!assignment) {
            await prisma.ficoCompanyGlAccount.create({
                data: {
                    companyId,
                    glAccountId: acct.id,
                    postingEnabled: true,
                    createdBy: FICO_SEED,
                    updatedBy: FICO_SEED,
                },
            })
        } else if (!assignment.postingEnabled) {
            await prisma.ficoCompanyGlAccount.update({
                where: { id: assignment.id },
                data: { postingEnabled: true, updatedBy: FICO_SEED },
            })
        }
    }

    const inventory = await prisma.ficoGlAccount.findFirst({ where: { accountCode: '120100' } })
    const settings = await prisma.ficoCompanyAccountingSettings.findFirst({
        where: { companyId, status: 'ACTIVE' },
        select: {
            id: true,
            chartOfAccountsId: true,
            defaultInventoryAccountId: true,
            defaultPayableAccountId: true,
        },
    })
    if (settings && inventory && !settings.defaultInventoryAccountId) {
        await prisma.ficoCompanyAccountingSettings.update({
            where: { id: settings.id },
            data: { defaultInventoryAccountId: inventory.id },
        })
    }
    if (settings) {
        const payableCandidates = await prisma.ficoGlAccount.findMany({
            where: {
                accountCode: '210100',
                isReconciliationAccount: true,
                reconciliationType: 'AP',
                status: 'ACTIVE',
                ...(settings.chartOfAccountsId
                    ? { chartOfAccountsId: settings.chartOfAccountsId }
                    : {}),
            },
            select: { id: true, chartOfAccountsId: true },
        })
        const payable =
            payableCandidates[0] ??
            (await prisma.ficoGlAccount.findFirst({
                where: {
                    accountCode: '210100',
                    isReconciliationAccount: true,
                    reconciliationType: 'AP',
                    status: 'ACTIVE',
                    companyAssignments: { some: { companyId, postingEnabled: true } },
                },
                select: { id: true },
            }))
        if (payable) {
            const current =
                settings.defaultPayableAccountId != null
                    ? await prisma.ficoGlAccount.findUnique({
                          where: { id: settings.defaultPayableAccountId },
                          select: {
                              isReconciliationAccount: true,
                              reconciliationType: true,
                          },
                      })
                    : null
            const currentValid =
                current?.isReconciliationAccount === true &&
                current?.reconciliationType === 'AP'
            if (!currentValid || settings.defaultPayableAccountId !== payable.id) {
                await prisma.ficoCompanyAccountingSettings.update({
                    where: { id: settings.id },
                    data: { defaultPayableAccountId: payable.id },
                })
            }
        }
    }
}

async function retryDocumentAccounting(
    prisma: InstanceType<typeof import('@prisma/client').PrismaClient>,
    processor: InstanceType<
        typeof import('../src/fico/fico-accounting-event-processor.service').FicoAccountingEventProcessorService
    >,
    documentIds: string[],
) {
    const events = await prisma.mmAccountingEvent.findMany({
        where: {
            documentId: { in: documentIds },
            status: { not: 'CONSUMED' },
        },
        orderBy: { createdAt: 'asc' },
    })
    for (const ev of events) {
        try {
            await processor.retryEvent(ev.id)
        } catch (err) {
            console.warn(`   Retry ${ev.eventType} failed: ${err instanceof Error ? err.message : err}`)
        }
    }
}

async function approvePoForDemo(
    poService: InstanceType<typeof import('../src/mm/purchase-order/purchase-order.service').PurchaseOrderService>,
    prisma: InstanceType<typeof import('@prisma/client').PrismaClient>,
    poId: string,
    buyer: string,
    approver: string,
) {
    let po = await poService.findOne(poId)
    if (['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].includes(po.status)) {
        return po
    }
    try {
        if (po.status === 'DRAFT') {
            await poService.submit(poId, buyer)
        }
        po = await poService.findOne(poId)
        if (po.status === 'PENDING_APPROVAL') {
            await poService.approveViaWorkflow(poId, approver, 'P2P demo seed approval')
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`   Workflow unavailable (${msg}) — marking PO APPROVED for demo seed.`)
        await prisma.mmPurchaseOrder.update({
            where: { id: poId },
            data: {
                status: 'APPROVED',
                approvedBy: approver,
                approvedAt: new Date(),
                submittedAt: new Date(),
            },
        })
    }
    return poService.findOne(poId)
}

async function dispatchAccounting(
    recovery: { processPendingBatch: (limit?: number) => Promise<number> },
    attempts = 8,
) {
    for (let i = 0; i < attempts; i++) {
        const n = await recovery.processPendingBatch(20)
        if (n === 0 && i >= 2) break
        await sleep(400)
    }
}

async function main() {
    const { NestFactory } = await import('@nestjs/core')
    const { AppModule } = await import('../src/app.module')
    const { PrismaService } = await import('../src/prisma/prisma.service')
    const { PurchaseOrderService } = await import('../src/mm/purchase-order/purchase-order.service')
    const { GoodsReceiptService } = await import('../src/mm/stock-ops/goods-receipt.service')
    const { SupplierInvoiceService } = await import('../src/mm/three-way-match/supplier-invoice.service')
    const { ThreeWayMatchService } = await import('../src/mm/three-way-match/three-way-match.service')
    const { FicoAccountingEventRecoveryService } = await import(
        '../src/fico/fico-accounting-event-recovery.service'
    )

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    })

    try {
        const prisma = app.get(PrismaService)
        const poService = app.get(PurchaseOrderService)
        const grService = app.get(GoodsReceiptService)
        const invoiceService = app.get(SupplierInvoiceService)
        const matchService = app.get(ThreeWayMatchService)
        const recovery = app.get(FicoAccountingEventRecoveryService)
        const processor = app.get(
            (await import('../src/fico/fico-accounting-event-processor.service'))
                .FicoAccountingEventProcessorService,
        )

        const company = await prisma.company.findFirst({ where: { code: 'AGCTEK' } })
        if (!company) throw new Error('Company AGCTEK not found — run org/warehouse seeds first.')

        console.log('0) FICO prerequisites (determination + AP reconciliation) …')
        await ensureP2pFicoReady(prisma, company.id)

        const existing = await prisma.mmPurchaseOrder.findFirst({
            where: { deliveryTerms: TAG },
            include: {
                lines: true,
                goodsReceipts: { include: { lines: true } },
                supplierInvoices: true,
            },
        })
        const done =
            existing?.supplierInvoices?.some((inv) =>
                ['MATCHED', 'PARTIALLY_MATCHED', 'APPROVED', 'PAID'].includes(inv.status),
            ) ?? false
        if (existing && done) {
            const docIds = [
                existing.id,
                ...existing.goodsReceipts.map((g) => g.id),
                ...(existing.supplierInvoices?.map((i) => i.id) ?? []),
            ]
            await retryDocumentAccounting(prisma, processor, docIds)
            await dispatchAccounting(recovery)
            await printSummary(prisma, existing.id)
            console.log(`\nAlready seeded (${TAG}). Retried pending accounting events.`)
            return
        }

        const procureSupplier = async (codes: string[]) => {
            for (const supplierCode of codes) {
                const row = await prisma.mmSupplier.findFirst({
                    where: {
                        supplierCode,
                        companyId: company.id,
                        status: 'ACTIVE',
                        deletedAt: null,
                    },
                })
                if (row) return row
            }
            return prisma.mmSupplier.findFirst({
                where: { companyId: company.id, status: 'ACTIVE', deletedAt: null },
                orderBy: { supplierCode: 'asc' },
            })
        }

        let supplier = await procureSupplier(['SUP-ACME', 'SUP-PHILMAN', 'SUP-TECHWORLD'])
        if (!supplier) {
            const candidate = await prisma.mmSupplier.findFirst({
                where: { companyId: company.id, deletedAt: null, status: { not: 'BLOCKED' } },
                orderBy: { supplierCode: 'asc' },
            })
            if (!candidate) {
                throw new Error('No supplier for AGCTEK — seed MM suppliers first.')
            }
            supplier = await prisma.mmSupplier.update({
                where: { id: candidate.id },
                data: { status: 'ACTIVE' },
            })
            console.log(`   Activated supplier ${supplier.supplierCode} for demo PO.`)
        }

        const linkedMaterial = await prisma.mmSupplierMaterial.findFirst({
            where: {
                supplierId: supplier.id,
                status: 'ACTIVE',
                material: { deletedAt: null, purchasable: true, companyId: company.id },
            },
            include: { material: true },
        })

        const material =
            linkedMaterial?.material ??
            (await prisma.mmMaterial.findFirst({
                where: { materialCode: 'MAT-GLV-001', deletedAt: null, companyId: company.id },
            })) ??
            (await prisma.mmMaterial.findFirst({
                where: { companyId: company.id, deletedAt: null, purchasable: true },
                orderBy: { materialCode: 'asc' },
            }))
        if (!material) throw new Error('No purchasable material found for P2P demo.')

        const unitPrice =
            linkedMaterial && Number(linkedMaterial.unitPrice) > 0
                ? Number(linkedMaterial.unitPrice)
                : UNIT_PRICE

        const warehouse = await prisma.warehouse.findFirst({
            where: { companyId: company.id, code: 'MAIN' },
        })
        if (!warehouse) {
            throw new Error('Warehouse MAIN not found for AGCTEK.')
        }

        const bin =
            (await prisma.wmStorageBin.findFirst({
                where: {
                    code: { contains: 'R01' },
                    storageSection: { storageType: { warehouseId: warehouse.id } },
                    status: 'ACTIVE',
                },
                orderBy: { code: 'asc' },
            })) ??
            (await prisma.wmStorageBin.findFirst({
                where: {
                    storageSection: { storageType: { warehouseId: warehouse.id } },
                    status: 'ACTIVE',
                },
                orderBy: { code: 'asc' },
            }))

        const php = await prisma.mmCurrency.findUnique({ where: { code: 'PHP' } })
        const net30 = await prisma.mmPaymentTerms.findUnique({ where: { code: 'NET30' } })

        const nowIso = new Date().toISOString()
        const lineTotal = QTY * unitPrice

        let po =
            existing ??
            (await poService.create({
                companyId: company.id,
                supplierId: supplier.id,
                buyerId: BUYER,
                warehouseId: warehouse.id,
                currencyId: php?.id,
                paymentTermsId: net30?.id,
                deliveryTerms: TAG,
                expectedDeliveryDate: nowIso,
                createdBy: 'seed',
                lines: [
                    {
                        materialId: material.id,
                        description: material.materialName,
                        quantity: QTY,
                        uomId: material.baseUomId,
                        unitPrice: unitPrice,
                        warehouseId: warehouse.id,
                        storageBinId: bin?.id,
                    },
                ],
            }))

        if (existing) {
            console.log(`1) Resuming PO ${po.poNumber} (${po.status}) …`)
        } else {
            console.log('1) Creating purchase order …')
        }

        const approvedPo = await approvePoForDemo(poService, prisma, po.id, BUYER, APPROVER)
        console.log(`   PO ${approvedPo.poNumber} → ${approvedPo.status}`)
        const poLine = approvedPo.lines[0]
        if (!poLine) throw new Error('PO line missing.')

        const materialId = poLine.materialId
        const grUnitCost = Number(poLine.unitPrice)

        let postedGr = existing?.goodsReceipts?.find((g) => g.status === 'POSTED')
        if (!postedGr) {
            console.log('2) Goods receipt → submit → verify → post …')
            const gr = await grService.create({
                companyId: company.id,
                warehouseId: warehouse.id,
                purchaseOrderId: po.id,
                supplierId: supplier.id,
                receiverId: 'seed.receiver',
                postingDate: nowIso,
                documentDate: nowIso,
                stockStatus: 'UNRESTRICTED',
                remarks: TAG,
                createdBy: 'seed',
                receiptPurpose: 'PROCUREMENT',
                lines: [
                    {
                        materialId,
                        quantity: QTY,
                        uomId: poLine.uomId,
                        unitCost: grUnitCost,
                        totalCost: QTY * grUnitCost,
                        storageBinId: bin?.id,
                        purchaseOrderLineId: poLine.id,
                        stockStatus: 'UNRESTRICTED',
                    },
                ],
            })
            await grService.submit(gr.id, { submittedBy: 'seed.receiver' })
            await grService.verify(gr.id, { verifiedBy: 'seed.verifier' })
            postedGr = await grService.post(gr.id)
        } else {
            console.log(`2) Using posted GR ${postedGr.documentNumber}`)
        }
        console.log(`   GR ${postedGr.documentNumber} → ${postedGr.status}`)

        await dispatchAccounting(recovery)
        const grEvent = await prisma.mmAccountingEvent.findFirst({
            where: {
                eventType: 'GoodsReceiptPosted',
                documentId: postedGr.id,
            },
            orderBy: { createdAt: 'desc' },
        })
        const grJournal = grEvent?.journalEntryId
            ? await prisma.ficoJournalEntry.findUnique({
                  where: { id: grEvent.journalEntryId },
                  select: { documentNumber: true, status: true },
              })
            : null
        console.log(
            `   Accounting: event=${grEvent?.status ?? 'n/a'} journal=${grJournal?.documentNumber ?? 'n/a'}`,
        )

        const grLine = await prisma.mmGoodsReceiptLine.findFirst({
            where: { receiptId: postedGr.id },
        })
        if (!grLine) throw new Error('GR line missing after post.')

        let invoice = existing?.supplierInvoices?.[0]
        if (!invoice) {
            console.log('3) Supplier invoice …')
            invoice = await invoiceService.create({
                companyId: company.id,
                supplierId: supplier.id,
                purchaseOrderId: po.id,
                currencyId: php?.id ?? undefined,
                invoiceDate: nowIso.slice(0, 10),
                postingDate: nowIso.slice(0, 10),
                taxAmount: 0,
                createdBy: 'seed',
                remarks: TAG,
                lines: [
                    {
                        materialId,
                        purchaseOrderLineId: poLine.id,
                        uomId: poLine.uomId,
                        invoicedQuantity: QTY,
                        unitPrice: grUnitCost,
                        taxAmount: 0,
                        receipts: [
                            {
                                goodsReceiptLineId: grLine.id,
                                allocatedQuantity: QTY,
                            },
                        ],
                    },
                ],
            })
            await invoiceService.submit(invoice.id)
            console.log(`   Invoice ${invoice.invoiceNumber} submitted.`)
        } else {
            console.log(`3) Using invoice ${invoice.invoiceNumber} (${invoice.status})`)
        }

        console.log('4) Three-way match …')
        let matched = await matchService.runMatch(invoice.id)
        console.log(`   Match status: ${matched.status}`)

        if (['MATCHED', 'PARTIALLY_MATCHED'].includes(matched.status) && matched.status !== 'APPROVED') {
            const approved = await matchService.approve(invoice.id, {
                approvedBy: APPROVER,
            })
            console.log(`   Invoice approved for payment (${approved.status}).`)
            matched = approved
            await dispatchAccounting(recovery)
        } else if (!['MATCHED', 'PARTIALLY_MATCHED'].includes(matched.status)) {
            console.log('   Skipping approve — resolve exceptions in UI first.')
        }

        const docIds = [
            po.id,
            postedGr.id,
            invoice.id,
        ]
        await retryDocumentAccounting(prisma, processor, docIds)
        await dispatchAccounting(recovery)

        await printSummary(prisma, po.id)
        console.log('\nP2P demo seed complete.')
    } finally {
        await app.close()
    }
}

async function printSummary(prisma: InstanceType<typeof import('@prisma/client').PrismaClient>, poId: string) {
    const po = await prisma.mmPurchaseOrder.findUnique({
        where: { id: poId },
        include: {
            supplier: { select: { supplierCode: true, supplierName: true } },
            lines: { include: { material: { select: { materialCode: true } } } },
            goodsReceipts: {
                include: {
                    lines: true,
                },
            },
            supplierInvoices: true,
        },
    })
    if (!po) return

    const gr = po.goodsReceipts[0]
    const inv = po.supplierInvoices[0]
    const grAccounting = gr
        ? await prisma.mmAccountingEvent.findFirst({
              where: { documentId: gr.id, eventType: 'GoodsReceiptPosted' },
          })
        : null

    console.log('\n── Summary (UI paths) ──')
    console.log(`PO:     /modules/mm/procurement/purchase-orders  → ${po.poNumber} (${po.status})`)
    const unit = po.lines[0] ? Number(po.lines[0].unitPrice) : UNIT_PRICE
    console.log(`        Supplier ${po.supplier?.supplierCode} · ${po.lines[0]?.material?.materialCode} × ${QTY} @ ${unit}`)
    if (gr) {
        console.log(`GR:     MM Stock ops / receiving  → ${gr.documentNumber} (${gr.status})`)
        console.log(
            `        accountingPostingStatus=${gr.accountingPostingStatus ?? 'n/a'} · event=${grAccounting?.status ?? 'n/a'}`,
        )
    }
    if (inv) {
        console.log(`Invoice: /modules/mm/procurement/supplier-invoices → ${inv.invoiceNumber} (${inv.status})`)
        console.log(`3-way:   /modules/mm/procurement/three-way-match → invoice ${inv.invoiceNumber}`)
    }
    console.log('FICO:    /modules/fico → Journal entries · Accounting events (GoodsReceiptPosted / GR_IR)')
}

main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err)
    process.exit(1)
})