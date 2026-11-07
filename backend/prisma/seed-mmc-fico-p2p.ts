/* eslint-disable no-console */
/**
 * MM ↔ FICO Procure-to-Pay (P2P) Seed
 *
 * Seeds a complete procurement-to-payment flow with automatic MM→FICO
 * financial postings, following the SAP-inspired model:
 *
 *   1. Purchase Requisition (MM) — no FI posting
 *   2. Purchase Order (MM) — normally no FI posting
 *   3. Goods Receipt (MM) → FICO: Dr Inventory, Cr GR/IR Clearing
 *   4. Supplier Invoice (MM/FICO) → FICO: Dr GR/IR Clearing, Cr Accounts Payable
 *   5. Supplier Payment (FICO) → FICO: Dr Accounts Payable, Cr Cash
 *
 * Idempotent: re-running changes nothing that already exists.
 * Depends on seed-fico-complete.ts (company, COA, G/L accounts, settings).
 *
 * Sample data: AGCTEK buys 100 bottles of Fish Oil at ₱100 each (₱10,000 total).
 */
import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ACTOR = 'seed-mmc-fico-p2p'

const COMPANY_CODE = 'AGCTEK'
const BASE_CURRENCY = 'PHP'

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function money(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value)
}

/* ------------------------------------------------------------------ */
/* Master Data                                                        */
/* ------------------------------------------------------------------ */

async function ensureWarehouse(companyId: string) {
    let wh = await prisma.warehouse.findFirst({
        where: { companyId, code: 'WH-001' },
    })
    if (!wh) {
        wh = await prisma.warehouse.create({
            data: {
                companyId,
                code: 'WH-001',
                name: 'Main Warehouse',
                warehouseType: 'GENERAL',
                address: '123 Industrial Avenue, Manila',
                status: 'ACTIVE',
            },
        })
        console.log(`+ warehouse WH-001`)
    } else {
        console.log(`= warehouse WH-001 already exists`)
    }
    return wh
}

async function ensureCurrency() {
    let cur = await prisma.mmCurrency.findUnique({
        where: { code: 'PHP' },
    })
    if (!cur) {
        cur = await prisma.mmCurrency.create({
            data: {
                code: 'PHP',
                name: 'Philippine Peso',
                symbol: '₱',
            },
        })
        console.log(`+ currency PHP`)
    } else {
        console.log(`= currency PHP already exists`)
    }
    return cur
}

async function ensureUom() {
    let uom = await prisma.mmUom.findUnique({
        where: { code: 'PCS' },
    })
    if (!uom) {
        uom = await prisma.mmUom.create({
            data: {
                code: 'PCS',
                name: 'Pieces',
                symbol: 'pcs',
                isActive: true,
                sortOrder: 1,
            },
        })
        console.log(`+ uom PCS`)
    } else {
        console.log(`= uom PCS already exists`)
    }
    return uom
}

async function ensureMaterialType() {
    let mt = await prisma.mmMaterialType.findUnique({
        where: { code: 'RAW' },
    })
    if (!mt) {
        mt = await prisma.mmMaterialType.create({
            data: {
                code: 'RAW',
                name: 'Raw Material',
                description: 'Raw materials for production and resale',
                isActive: true,
                sortOrder: 1,
            },
        })
        console.log(`+ material type RAW`)
    } else {
        console.log(`= material type RAW already exists`)
    }
    return mt
}

async function ensureMaterialCategory() {
    let mc = await prisma.mmMaterialCategory.findUnique({
        where: { code: 'FOOD' },
    })
    if (!mc) {
        mc = await prisma.mmMaterialCategory.create({
            data: {
                code: 'FOOD',
                name: 'Food & Beverages',
                description: 'Food and beverage materials',
                isActive: true,
                sortOrder: 1,
            },
        })
        console.log(`+ material category FOOD`)
    } else {
        console.log(`= material category FOOD already exists`)
    }
    return mc
}

async function ensureValuationClass() {
    let vc = await prisma.mmValuationClass.findUnique({
        where: { code: 'TRADING' },
    })
    if (!vc) {
        vc = await prisma.mmValuationClass.create({
            data: {
                code: 'TRADING',
                name: 'Trading Goods',
            },
        })
        console.log(`+ valuation class TRADING`)
    } else {
        console.log(`= valuation class TRADING already exists`)
    }
    return vc
}

async function ensureMaterial(
    companyId: string,
    materialTypeId: string,
    materialCategoryId: string,
    uomId: string,
    currencyId: string | null,
    valuationClassId: string | null,
    warehouseId: string,
) {
    let mat = await prisma.mmMaterial.findUnique({
        where: { materialCode: 'FISH-OIL-001' },
    })
    if (!mat) {
        mat = await prisma.mmMaterial.create({
            data: {
                materialCode: 'FISH-OIL-001',
                materialName: 'Fish Oil 100ml',
                description: 'Pure fish oil dietary supplement, 100ml bottle',
                shortDescription: 'Fish Oil 100ml',
                sku: 'FO-100ML-001',
                materialTypeId,
                materialCategoryId,
                status: 'ACTIVE',
                baseUomId: uomId,
                purchaseUomId: uomId,
                salesUomId: uomId,
                inventoryManaged: true,
                purchasable: true,
                sellable: true,
                batchManaged: false,
                serialManaged: false,
                negativeStockAllowed: false,
                expiryManaged: false,
                qualityInspectionRequired: false,
                valuationMethod: 'STANDARD',
                standardCost: money(100),
                currencyId,
                valuationClassId,
                companyId,
                defaultWarehouseId: warehouseId,
                abcClass: 'B',
                velocityClass: 'MEDIUM',
                riskClass: 'MEDIUM',
                minimumStock: money(10),
                reorderPoint: money(20),
                reorderQuantity: money(100),
                minimumOrderQuantity: money(50),
                leadTimeDays: 7,
            },
        })
        console.log(`+ material FISH-OIL-001 (Fish Oil 100ml)`)
    } else {
        console.log(`= material FISH-OIL-001 already exists`)
    }
    return mat
}

async function ensureSupplier(companyId: string, currencyId: string | null) {
    let sup = await prisma.mmSupplier.findUnique({
        where: { supplierCode: 'SUP-001' },
    })
    if (!sup) {
        sup = await prisma.mmSupplier.create({
            data: {
                supplierCode: 'SUP-001',
                supplierName: 'Ocean Fresh Suppliers',
                legalName: 'Ocean Fresh Suppliers Inc.',
                supplierType: 'MANUFACTURER',
                taxId: 'TIN-123-456-789',
                primaryContact: 'Juan Dela Cruz',
                email: 'juan@oceanfresh.ph',
                phone: '+63-2-123-4567',
                country: 'Philippines',
                region: 'NCR',
                currencyId,
                companyId,
                status: 'ACTIVE',
                sourcingType: 'PREFERRED',
                qualityInspectionRequired: false,
            },
        })
        console.log(`+ supplier SUP-001 (Ocean Fresh Suppliers)`)
    } else {
        console.log(`= supplier SUP-001 already exists`)
    }
    return sup
}

async function ensureSupplierMaterial(
    supplierId: string,
    materialId: string,
    currencyId: string | null,
) {
    let sm = await prisma.mmSupplierMaterial.findUnique({
        where: {
            supplierId_materialId: { supplierId, materialId },
        },
    })
    if (!sm) {
        sm = await prisma.mmSupplierMaterial.create({
            data: {
                supplierId,
                materialId,
                supplierMaterialCode: 'OFS-FISH-100',
                unitPrice: money(100),
                currencyId,
                minimumOrderQuantity: money(50),
                leadTimeDays: 7,
                preferredSupplier: true,
                inspectionRequired: false,
                status: 'ACTIVE',
            },
        })
        console.log(`+ supplier-material link SUP-001 → FISH-OIL-001`)
    } else {
        console.log(`= supplier-material link already exists`)
    }
    return sm
}

/* ------------------------------------------------------------------ */
/* G/L Account IDs                                                    */
/* ------------------------------------------------------------------ */

async function getGlAccountIds() {
    const accounts = await prisma.ficoGlAccount.findMany({
        where: {
            accountCode: {
                in: ['110100', '120100', '130100', '210100', '210200', '210300', '310100', '410100', '510100'],
            },
        },
    })
    const map = new Map<string, string>()
    for (const acc of accounts) {
        map.set(acc.accountCode, acc.id)
    }
    const missing = ['110100', '120100', '210100', '210200'].filter(
        (code) => !map.has(code),
    )
    if (missing.length > 0) {
        throw new Error(
            `Missing required G/L accounts: ${missing.join(', ')}. Run seed-fico-complete.ts first.`,
        )
    }
    return map
}

/* ------------------------------------------------------------------ */
/* Step 1: Purchase Order                                             */
/* ------------------------------------------------------------------ */

async function createPurchaseOrder(
    companyId: string,
    supplierId: string,
    currencyId: string | null,
    buyerId: string,
) {
    let po = await prisma.mmPurchaseOrder.findUnique({
        where: { poNumber: 'PO-2026-001' },
    })
    if (!po) {
        po = await prisma.mmPurchaseOrder.create({
            data: {
                poNumber: 'PO-2026-001',
                companyId,
                supplierId,
                buyerId,
                currencyId,
                status: 'APPROVED',
                totalAmount: money(10000),
            },
        })
        console.log(`+ purchase order PO-2026-001`)

        const uom = await prisma.mmUom.findUnique({ where: { code: 'PCS' } })
        const mat = await prisma.mmMaterial.findUnique({
            where: { materialCode: 'FISH-OIL-001' },
        })
        await prisma.mmPurchaseOrderLine.create({
            data: {
                purchaseOrderId: po.id,
                lineNumber: 1,
                materialId: mat!.id,
                description: 'Fish Oil 100ml',
                quantity: money(100),
                uomId: uom!.id,
                unitPrice: money(100),
                discount: money(0),
                tax: money(0),
                freight: money(0),
                lineTotal: money(10000),
                receivedQuantity: money(100),
                invoicedQuantity: money(0),
            },
        })
        console.log(`+ PO line: 100 PCS Fish Oil @ ₱100 = ₱10,000`)
    } else {
        console.log(`= purchase order PO-2026-001 already exists`)
    }
    return po
}

/* ------------------------------------------------------------------ */
/* Step 2: Goods Receipt + FICO Journal Entry                         */
/*   Dr Inventory (120100) ₱10,000   Cr GR/IR (210200) ₱10,000       */
/* ------------------------------------------------------------------ */

async function createGoodsReceipt(
    companyId: string,
    warehouseId: string,
    poId: string,
    poLineId: string,
    materialId: string,
    uomId: string,
    glAccounts: Map<string, string>,
) {
    let gr = await prisma.mmGoodsReceipt.findUnique({
        where: { documentNumber: 'GR-2026-001' },
    })
    if (!gr) {
        const po = await prisma.mmPurchaseOrder.findUnique({
            where: { id: poId },
        })
        gr = await prisma.mmGoodsReceipt.create({
            data: {
                documentNumber: 'GR-2026-001',
                companyId,
                warehouseId,
                purchaseOrderId: poId,
                supplierId: po!.supplierId,
                postingDate: new Date('2026-01-15T10:00:00Z'),
                documentDate: new Date('2026-01-15T10:00:00Z'),
                stockStatus: 'UNRESTRICTED',
                remarks: 'Goods receipt for PO-2026-001 - Fish Oil 100ml',
                receiptPurpose: 'PROCUREMENT',
                status: 'SUBMITTED',
            },
        })
        console.log(`+ goods receipt GR-2026-001`)

        await prisma.mmGoodsReceiptLine.create({
            data: {
                receiptId: gr.id,
                materialId,
                quantity: money(100),
                expectedQuantity: money(100),
                unitCost: money(100),
                totalCost: money(10000),
                uomId,
                purchaseOrderLineId: poLineId,
            },
        })
        console.log(`+ GR line: 100 PCS Fish Oil @ ₱100 = ₱10,000`)

        const uom = await prisma.mmUom.findUnique({ where: { code: 'PCS' } })
        await prisma.mmInventoryTransaction.create({
            data: {
                transactionNumber: 'IT-2026-001',
                companyId,
                warehouseId,
                materialId,
                movementType: 'GR',
                quantity: money(100),
                baseQuantity: money(100),
                signedQuantity: money(100),
                uomId,
                unitCost: money(100),
                totalCost: money(10000),
                postingDate: new Date('2026-01-15T10:00:00Z'),
                documentDate: new Date('2026-01-15T10:00:00Z'),
                sourceModule: 'MM',
                sourceDocumentType: 'GOODS_RECEIPT',
                sourceDocumentId: gr.id,
                reasonCode: 'PURCHASE',
                remarks: 'Goods receipt GR-2026-001',
            },
        })
        console.log(`+ inventory transaction IT-2026-001`)

        const existingBalance = await prisma.mmInventoryBalance.findFirst({
            where: {
                companyId,
                warehouseId,
                materialId,
                stockStatus: 'UNRESTRICTED',
            },
        })
        if (existingBalance) {
            await prisma.mmInventoryBalance.update({
                where: { id: existingBalance.id },
                data: {
                    quantity: money(100),
                    availableQuantity: money(100),
                },
            })
        } else {
            await prisma.mmInventoryBalance.create({
                data: {
                    companyId,
                    warehouseId,
                    materialId,
                    stockStatus: 'UNRESTRICTED',
                    quantity: money(100),
                    reservedQuantity: money(0),
                    availableQuantity: money(100),
                },
            })
        }
        console.log(`+ inventory balance: 100 PCS @ ₱100`)
    } else {
        console.log(`= goods receipt GR-2026-001 already exists`)
    }

    // --- FICO Journal Entry: Dr Inventory 120100, Cr GR/IR 210200 ---
    // Created independently of whether GR already exists
    let acctEvent = await prisma.mmAccountingEvent.findUnique({
        where: { idempotencyKey: 'mm:gr:GR-2026-001' },
    })
    if (!acctEvent) {
        acctEvent = await prisma.mmAccountingEvent.create({
            data: {
                eventType: 'GOODS_RECEIPT',
                sourceModule: 'MM',
                documentType: 'GOODS_RECEIPT',
                documentId: gr.id,
                companyId,
                sourceEventId: gr.id,
                idempotencyKey: 'mm:gr:GR-2026-001',
                postingDate: new Date('2026-01-15T10:00:00Z'),
                currencyCode: BASE_CURRENCY,
                totalValue: money(10000),
                accountingEffects: ['INVENTORY_INCREASE', 'GRIR_ACCRUAL'],
                payload: {
                    documentNumber: 'GR-2026-001',
                    materialCode: 'FISH-OIL-001',
                    quantity: 100,
                    unitCost: 100,
                    totalValue: 10000,
                    debitAccount: '120100',
                    creditAccount: '210200',
                },
                status: 'PENDING',
            },
        })
        console.log(`+ mm accounting event: GOODS_RECEIPT (pending)`)
    } else {
        console.log(`= mm accounting event: GOODS_RECEIPT already exists (status: ${acctEvent.status})`)
    }

    // Try to create the FICO journal entry if it doesn't exist yet
    const existingJe = await prisma.ficoJournalEntry.findUnique({
        where: { idempotencyKey: 'fico:je:GR-2026-001' },
    })
    if (!existingJe) {
        try {
            const je = await prisma.ficoJournalEntry.create({
                data: {
                    idempotencyKey: 'fico:je:GR-2026-001',
                    documentNumber: 'JE-2026-001',
                    documentType: 'JOURNAL',
                    documentDate: new Date('2026-01-15T10:00:00Z'),
                    postingDate: new Date('2026-01-15T10:00:00Z'),
                    fiscalYear: 2026,
                    companyId,
                    totalAmount: money(10000),
                    currencyCode: BASE_CURRENCY,
                    status: 'DRAFT',
                    sourceModule: 'MM',
                    sourceDocumentType: 'GOODS_RECEIPT',
                    sourceDocumentId: gr.id,
                    sourcePostingKey: 'GR_IR',
                    mmAccountingEventId: acctEvent.id,
                    metadata: {
                        eventType: 'GOODS_RECEIPT',
                        accountingEffects: ['INVENTORY_INCREASE', 'GRIR_ACCRUAL'],
                        documentType: 'GOODS_RECEIPT',
                        documentId: gr.id,
                    },
                },
            })
            await prisma.ficoJournalEntryLine.create({
                data: {
                    journalEntryId: je.id,
                    lineNumber: 1,
                    glAccountId: glAccounts.get('120100')!,
                    companyId,
                    debitAmount: money(10000),
                    creditAmount: money(0),
                    currency: BASE_CURRENCY,
                    description: 'Inventory increase - Fish Oil GR-2026-001',
                    materialId,
                    warehouseId,
                },
            })
            await prisma.ficoJournalEntryLine.create({
                data: {
                    journalEntryId: je.id,
                    lineNumber: 2,
                    glAccountId: glAccounts.get('210200')!,
                    companyId,
                    debitAmount: money(0),
                    creditAmount: money(10000),
                    currency: BASE_CURRENCY,
                    description: 'GR/IR clearing - Fish Oil GR-2026-001',
                },
            })
            await prisma.ficoJournalEntry.update({
                where: { id: je.id },
                data: { status: 'POSTED', postedAt: new Date('2026-01-15T11:00:00Z'), postedBy: ACTOR },
            })
            console.log(
                `+ FICO journal JE-2026-001: Dr 120100 ₱10,000 / Cr 210200 ₱10,000`,
            )

            await prisma.mmAccountingEvent.update({
                where: { id: acctEvent.id },
                data: {
                    status: 'CONSUMED',
                    consumedAt: new Date('2026-01-15T11:00:00Z'),
                    journalEntryId: je.id,
                },
            })
            console.log(`+ mm accounting event marked CONSUMED`)
        } catch (err: any) {
            if (err?.code === 'P0001' && err?.message?.includes('immutable')) {
                console.log(`= FICO journal JE-2026-001 already exists (immutable)`)
            } else {
                throw err
            }
        }
    } else {
        console.log(`= FICO journal JE-2026-001 already exists`)
    }

    return gr
}

/* ------------------------------------------------------------------ */
/* Step 3: Supplier Invoice + FICO Journal Entry                      */
/*   Dr GR/IR Clearing (210200) ₱10,000   Cr AP (210100) ₱10,000     */
/* ------------------------------------------------------------------ */

async function createSupplierInvoice(
    companyId: string,
    supplierId: string,
    poId: string,
    poLineId: string,
    materialId: string,
    uomId: string,
    glAccounts: Map<string, string>,
    currencyId: string | null,
) {
    let inv = await prisma.mmSupplierInvoice.findUnique({
        where: { invoiceNumber: 'INV-2026-001' },
    })
    if (!inv) {
        inv = await prisma.mmSupplierInvoice.create({
            data: {
                invoiceNumber: 'INV-2026-001',
                companyId,
                supplierId,
                purchaseOrderId: poId,
                currencyId,
                invoiceDate: new Date('2026-01-20T10:00:00Z'),
                postingDate: new Date('2026-01-20T10:00:00Z'),
                taxAmount: money(0),
                totalAmount: money(10000),
                status: 'MATCHED',
                matchStatus: 'MATCHED',
                paymentEligible: true,
                invoicedApplied: false,
                remarks: 'Supplier invoice INV-2026-001 for PO-2026-001',
            },
        })
        console.log(`+ supplier invoice INV-2026-001`)

        await prisma.mmSupplierInvoiceLine.create({
            data: {
                invoiceId: inv.id,
                lineNumber: 1,
                materialId,
                purchaseOrderLineId: poLineId,
                uomId,
                invoicedQuantity: money(100),
                unitPrice: money(100),
                taxAmount: money(0),
                lineTotal: money(10000),
                matchedQuantity: money(100),
                matchStatus: 'MATCHED',
            },
        })
        console.log(`+ invoice line: 100 PCS Fish Oil @ ₱100 = ₱10,000`)

        const gr = await prisma.mmGoodsReceipt.findUnique({
            where: { documentNumber: 'GR-2026-001' },
        })
        const grLine = await prisma.mmGoodsReceiptLine.findFirst({
            where: { receiptId: gr!.id, purchaseOrderLineId: poLineId },
        })
        await prisma.mmSupplierInvoiceLineReceipt.create({
            data: {
                invoiceLineId: inv.id,
                goodsReceiptLineId: grLine!.id,
                allocatedQuantity: money(100),
            },
        })
        console.log(`+ invoice-line receipt allocation: 100 PCS`)
    } else {
        console.log(`= supplier invoice INV-2026-001 already exists`)
    }

    // --- FICO Journal Entry: Dr GR/IR 210200, Cr AP 210100 ---
    const acctEvent = await prisma.mmAccountingEvent.findUnique({
        where: { idempotencyKey: 'mm:si:INV-2026-001' },
    })
    if (!acctEvent) {
        const createdAcctEvent = await prisma.mmAccountingEvent.create({
            data: {
                eventType: 'SUPPLIER_INVOICE',
                sourceModule: 'MM',
                documentType: 'SUPPLIER_INVOICE',
                documentId: inv.id,
                companyId,
                sourceEventId: inv.id,
                idempotencyKey: 'mm:si:INV-2026-001',
                postingDate: new Date('2026-01-20T10:00:00Z'),
                currencyCode: BASE_CURRENCY,
                totalValue: money(10000),
                accountingEffects: ['GRIR_ACCRUAL', 'SUPPLIER_INVOICE'],
                payload: {
                    invoiceNumber: 'INV-2026-001',
                    supplierCode: 'SUP-001',
                    totalValue: 10000,
                    debitAccount: '210200',
                    creditAccount: '210100',
                },
                status: 'PENDING',
            },
        })
        console.log(`+ mm accounting event: SUPPLIER_INVOICE (pending)`)

        try {
            const je = await prisma.ficoJournalEntry.create({
                data: {
                    idempotencyKey: 'fico:je:INV-2026-001',
                    documentNumber: 'JE-2026-002',
                    documentType: 'JOURNAL',
                    documentDate: new Date('2026-01-20T10:00:00Z'),
                    postingDate: new Date('2026-01-20T10:00:00Z'),
                    fiscalYear: 2026,
                    companyId,
                    totalAmount: money(10000),
                    currencyCode: BASE_CURRENCY,
                    status: 'DRAFT',
                    sourceModule: 'MM',
                    sourceDocumentType: 'SUPPLIER_INVOICE',
                    sourceDocumentId: inv.id,
                    sourcePostingKey: 'SUPPLIER_INVOICE',
                    mmAccountingEventId: createdAcctEvent.id,
                    metadata: {
                        eventType: 'SUPPLIER_INVOICE',
                        accountingEffects: ['GRIR_ACCRUAL', 'SUPPLIER_INVOICE'],
                        documentType: 'SUPPLIER_INVOICE',
                        documentId: inv.id,
                    },
                },
            })
            await prisma.ficoJournalEntryLine.create({
                data: {
                    journalEntryId: je.id,
                    lineNumber: 1,
                    glAccountId: glAccounts.get('210200')!,
                    companyId,
                    debitAmount: money(10000),
                    creditAmount: money(0),
                    currency: BASE_CURRENCY,
                    description: 'GR/IR clearing - INV-2026-001',
                },
            })
            await prisma.ficoJournalEntryLine.create({
                data: {
                    journalEntryId: je.id,
                    lineNumber: 2,
                    glAccountId: glAccounts.get('210100')!,
                    companyId,
                    debitAmount: money(0),
                    creditAmount: money(10000),
                    currency: BASE_CURRENCY,
                    description: 'Accounts payable - Ocean Fresh Suppliers INV-2026-001',
                },
            })
            await prisma.ficoJournalEntry.update({
                where: { id: je.id },
                data: { status: 'POSTED', postedAt: new Date('2026-01-20T14:00:00Z'), postedBy: ACTOR },
            })
            console.log(
                `+ FICO journal JE-2026-002: Dr 210200 ₱10,000 / Cr 210100 ₱10,000`,
            )

            await prisma.mmAccountingEvent.update({
                where: { id: createdAcctEvent.id },
                data: {
                    status: 'CONSUMED',
                    consumedAt: new Date('2026-01-20T14:00:00Z'),
                    journalEntryId: je.id,
                },
            })
            console.log(`+ mm accounting event marked CONSUMED`)
        } catch (err: any) {
            if (err?.code === 'P0001' && err?.message?.includes('immutable')) {
                console.log(`= FICO journal JE-2026-002 already exists (immutable)`)
                const existingJe = await prisma.ficoJournalEntry.findUnique({
                    where: { idempotencyKey: 'fico:je:INV-2026-001' },
                })
                if (existingJe) {
                    await prisma.mmAccountingEvent.update({
                        where: { id: createdAcctEvent.id },
                        data: {
                            status: 'CONSUMED',
                            consumedAt: new Date('2026-01-20T14:00:00Z'),
                            journalEntryId: existingJe.id,
                        },
                    })
                }
            } else {
                throw err
            }
        }
    } else {
        console.log(`= mm accounting event: SUPPLIER_INVOICE already exists`)
        const existingJe = await prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey: 'fico:je:INV-2026-001' },
        })
        if (existingJe) {
            console.log(`= FICO journal JE-2026-002 already exists`)
        }
    }

    return inv
}

/* ------------------------------------------------------------------ */
/* Step 4: Supplier Payment + FICO Journal Entry                      */
/*   Dr Accounts Payable (210100) ₱10,000   Cr Cash (110100) ₱10,000 */
/* ------------------------------------------------------------------ */

async function createSupplierPayment(
    companyId: string,
    supplierId: string,
    invoiceId: string,
    glAccounts: Map<string, string>,
) {
    const existingJe = await prisma.ficoJournalEntry.findUnique({
        where: { idempotencyKey: 'fico:je:PAY-2026-001' },
    })
    if (!existingJe) {
        try {
            const je = await prisma.ficoJournalEntry.create({
                data: {
                    idempotencyKey: 'fico:je:PAY-2026-001',
                    documentNumber: 'JE-2026-003',
                    documentType: 'JOURNAL',
                    documentDate: new Date('2026-01-25T10:00:00Z'),
                    postingDate: new Date('2026-01-25T10:00:00Z'),
                    fiscalYear: 2026,
                    companyId,
                    totalAmount: money(10000),
                    currencyCode: BASE_CURRENCY,
                    status: 'DRAFT',
                    sourceModule: 'FICO',
                    sourceDocumentType: 'SUPPLIER_PAYMENT',
                    sourceDocumentId: invoiceId,
                    metadata: {
                        eventType: 'SUPPLIER_PAYMENT',
                        documentType: 'SUPPLIER_PAYMENT',
                        documentId: invoiceId,
                        supplierCode: 'SUP-001',
                    },
                },
            })
            await prisma.ficoJournalEntryLine.create({
                data: {
                    journalEntryId: je.id,
                    lineNumber: 1,
                    glAccountId: glAccounts.get('210100')!,
                    companyId,
                    debitAmount: money(10000),
                    creditAmount: money(0),
                    currency: BASE_CURRENCY,
                    description: 'Accounts payable payment - Ocean Fresh Suppliers',
                },
            })
            await prisma.ficoJournalEntryLine.create({
                data: {
                    journalEntryId: je.id,
                    lineNumber: 2,
                    glAccountId: glAccounts.get('110100')!,
                    companyId,
                    debitAmount: money(0),
                    creditAmount: money(10000),
                    currency: BASE_CURRENCY,
                    description: 'Cash payment - Ocean Fresh Suppliers PAY-2026-001',
                },
            })
            await prisma.ficoJournalEntry.update({
                where: { id: je.id },
                data: { status: 'POSTED', postedAt: new Date('2026-01-25T10:00:00Z'), postedBy: ACTOR },
            })
            console.log(
                `+ FICO payment journal JE-2026-003: Dr 210100 ₱10,000 / Cr 110100 ₱10,000`,
            )
        } catch (err: any) {
            if (err?.code === 'P0001' && err?.message?.includes('immutable')) {
                console.log(`= FICO payment journal JE-2026-003 already exists (immutable)`)
            } else {
                throw err
            }
        }
    } else {
        console.log(`= FICO payment journal JE-2026-003 already exists`)
    }
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
    console.log(`\n=== MM ↔ FICO P2P Seed (${ACTOR}) ===\n`)

    const company = await prisma.company.findUnique({
        where: { code: COMPANY_CODE },
    })
    if (!company) {
        throw new Error(
            `Company ${COMPANY_CODE} not found. Run seed-fico-complete.ts first.`,
        )
    }
    console.log(`= company ${COMPANY_CODE}`)

    const warehouse = await ensureWarehouse(company.id)
    const currency = await ensureCurrency()
    const uom = await ensureUom()
    const materialType = await ensureMaterialType()
    const materialCategory = await ensureMaterialCategory()
    const valuationClass = await ensureValuationClass()

    const material = await ensureMaterial(
        company.id,
        materialType.id,
        materialCategory.id,
        uom.id,
        currency.id,
        valuationClass.id,
        warehouse.id,
    )

    const supplier = await ensureSupplier(company.id, currency.id)
    await ensureSupplierMaterial(supplier.id, material.id, currency.id)

    const glAccounts = await getGlAccountIds()

    const buyerId = company.id

    const po = await createPurchaseOrder(
        company.id,
        supplier.id,
        currency.id,
        buyerId,
    )
    const poLine = await prisma.mmPurchaseOrderLine.findFirst({
        where: { purchaseOrderId: po.id, lineNumber: 1 },
    })
    if (!poLine) {
        throw new Error('PO line not found')
    }

    await createGoodsReceipt(
        company.id,
        warehouse.id,
        po.id,
        poLine.id,
        material.id,
        uom.id,
        glAccounts,
    )

    await createSupplierInvoice(
        company.id,
        supplier.id,
        po.id,
        poLine.id,
        material.id,
        uom.id,
        glAccounts,
        currency.id,
    )

    const inv = await prisma.mmSupplierInvoice.findUnique({
        where: { invoiceNumber: 'INV-2026-001' },
    })
    if (inv) {
        await createSupplierPayment(
            company.id,
            supplier.id,
            inv.id,
            glAccounts,
        )
    }

    console.log('\n=== MM ↔ FICO P2P Seed finished successfully ===')
    console.log('\nSummary:')
    console.log('  Material:   FISH-OIL-001 (Fish Oil 100ml)')
    console.log('  Supplier:   SUP-001 (Ocean Fresh Suppliers)')
    console.log('  PO:         PO-2026-001 — 100 PCS @ ₱100 = ₱10,000')
    console.log('  GR:         GR-2026-001 — Dr Inventory ₱10,000 / Cr GR/IR ₱10,000')
    console.log('  Invoice:    INV-2026-001 — Dr GR/IR ₱10,000 / Cr AP ₱10,000')
    console.log('  Payment:    PAY-2026-001 — Dr AP ₱10,000 / Cr Cash ₱10,000')
    console.log('\nResult: GR/IR Clearing = 0, AP = 0, Inventory = ₱10,000, Cash = -₱10,000')
}

main()
    .then(() => {
        void prisma.$disconnect()
    })
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
        void prisma.$disconnect()
    })
