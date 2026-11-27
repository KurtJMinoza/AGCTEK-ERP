import { Decimal } from '@prisma/client/runtime/library'
import { FicoAccountsPayableService } from './fico-accounts-payable.service'

describe('FicoAccountsPayableService', () => {
    const invoice = {
        id: 'invoice-1',
        invoiceNumber: 'SINV-0001',
        companyId: 'company-1',
        supplierId: 'supplier-1',
        purchaseOrderId: 'po-1',
        invoiceDate: new Date('2026-11-25T00:00:00.000Z'),
        postingDate: null,
        baselineDate: null,
        dueDate: null,
        approvedAt: new Date('2026-11-25T00:00:00.000Z'),
        approvedBy: 'approver-1',
        paymentEligible: true,
        status: 'MATCHED',
        paymentBlocked: false,
        totalAmount: new Decimal(100),
        taxAmount: new Decimal(0),
        taxCodeId: null,
        withholdingTaxCodeId: null,
        supplier: {
            paymentTerms: { dueDays: 30 },
        },
        currency: { code: 'PHP' },
        taxCode: null,
        withholdingTaxCode: null,
        exceptions: [],
        lines: [
            {
                id: 'invoice-line-1',
                invoicedQuantity: new Decimal(10),
                lineTotal: new Decimal(100),
                taxAmount: new Decimal(0),
                receipts: [
                    {
                        goodsReceiptLineId: 'gr-line-1',
                        allocatedQuantity: new Decimal(10),
                    },
                ],
            },
        ],
    }

    it('posts an approved matched MM invoice through the centralized journal and creates AP open-item state atomically', async () => {
        const tx = {
            ficoApDocument: {
                create: jest.fn().mockResolvedValue({ id: 'ap-document-1' }),
            },
            ficoApOpenItem: { create: jest.fn().mockResolvedValue({ id: 'item-1' }) },
            ficoApGrIrAllocation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            ficoAccountingAuditLog: { create: jest.fn() },
        }
        const prisma: any = {
            mmSupplierInvoice: {
                findUnique: jest.fn().mockResolvedValue(invoice),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            ficoApDocument: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            ficoSupplierCompanyAccount: { findUnique: jest.fn().mockResolvedValue(null) },
            ficoGlAccount: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ap-recon',
                    accountCode: '210000',
                    accountName: 'Trade payables',
                    accountType: 'LIABILITY',
                    isReconciliationAccount: true,
                    reconciliationType: 'AP',
                }),
            },
        }
        const resolution = {
            resolve: jest
                .fn()
                .mockResolvedValueOnce({
                    debitLines: [],
                    creditLines: [
                        {
                            glAccountId: 'ap-recon',
                            accountCode: '210000',
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    debitLines: [
                        {
                            glAccountId: 'grir',
                            accountCode: '220000',
                        },
                    ],
                    creditLines: [],
                }),
        }
        const journal = {
            postAutomaticJournal: jest.fn(async (request: any) => {
                await request.afterPersist(tx, {
                    id: 'journal-1',
                    documentNumber: 'SI-000001',
                    postedAt: new Date('2026-11-25T00:00:00.000Z'),
                })
                return {
                    journalEntryId: 'journal-1',
                    documentNumber: 'SI-000001',
                    postedAt: new Date('2026-11-25T00:00:00.000Z'),
                    created: true,
                    duplicate: false,
                }
            }),
        }
        const grirOpenItems = {
            applyInvoiceAllocations: jest.fn().mockResolvedValue(undefined),
        }
        const service = new FicoAccountsPayableService(
            prisma,
            { assertAccess: jest.fn() } as any,
            resolution as any,
            { assertAccountPostable: jest.fn().mockResolvedValue({}) } as any,
            journal as any,
            { calculate: jest.fn() } as any,
            grirOpenItems as any,
        )

        await expect(
            service.postMatchedSupplierInvoice({
                schemaVersion: 'v2',
                eventType: 'SupplierInvoiceMatched',
                companyId: 'company-1',
                postingDate: '2026-11-25T00:00:00.000Z',
                transactionDate: '2026-11-25T00:00:00.000Z',
                currencyCode: 'PHP',
                documentType: 'SUPPLIER_INVOICE',
                documentId: 'invoice-1',
                sourceModule: 'THREE_WAY_MATCH',
                accountingEffects: ['GRIR_ACCRUAL'],
                lines: [],
                financiallyRelevant: true,
                mmAccountingEventId: 'event-1',
            }),
        ).resolves.toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'journal-1',
        })

        const request = journal.postAutomaticJournal.mock.calls[0][0]
        expect(request.subledgerPosting).toBe('AP')
        expect(request.lines).toEqual([
            expect.objectContaining({
                glAccountId: 'grir',
                debit: new Decimal(100),
                credit: new Decimal(0),
            }),
            expect.objectContaining({
                glAccountId: 'ap-recon',
                debit: new Decimal(0),
                credit: new Decimal(100),
            }),
        ])
        expect(tx.ficoApDocument.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    sourceSupplierInvoiceId: 'invoice-1',
                    journalEntryId: 'journal-1',
                    liabilityAmount: new Decimal(100),
                }),
            }),
        )
        expect(tx.ficoApOpenItem.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'OPEN',
                    dueDate: new Date('2026-12-25T00:00:00.000Z'),
                }),
            }),
        )
        expect(tx.ficoApGrIrAllocation.createMany).toHaveBeenCalled()
    })

    it('rejects duplicate supplier invoice numbers before AP posting', async () => {
        const prisma: any = {
            mmSupplierInvoice: {
                findUnique: jest.fn().mockResolvedValue(invoice),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            ficoApDocument: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue({ id: 'dup-ap' }),
            },
        }
        const service = new FicoAccountsPayableService(
            prisma,
            { assertAccess: jest.fn() } as any,
            { resolve: jest.fn() } as any,
            {} as any,
            { postAutomaticJournal: jest.fn() } as any,
            {} as any,
            { applyInvoiceAllocations: jest.fn() } as any,
        )
        await expect(
            service.postMatchedSupplierInvoice({
                eventType: 'SupplierInvoiceMatched',
                companyId: 'company-1',
                documentId: 'invoice-1',
            } as any),
        ).rejects.toThrow('already exists')
    })
})
