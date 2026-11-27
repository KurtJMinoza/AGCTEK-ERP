import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { FicoAccountsReceivableService } from './fico-accounts-receivable.service'

describe('FicoAccountsReceivableService', () => {
    const invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-0001',
        companyId: 'company-1',
        salesOrderId: 'so-1',
        status: 'ISSUED',
        currency: 'PHP',
        totalAmount: new Decimal(112),
        issuedAt: new Date('2026-11-01T00:00:00.000Z'),
        paidAt: null as Date | null,
        salesOrder: {
            id: 'so-1',
            orderNumber: 'SO-1',
            channel: 'STANDARD',
            customerId: 'cust-1',
            customerName: 'Acme',
            lines: [{ taxAmount: new Decimal(12) }],
        },
    }

    function buildService(overrides?: {
        prisma?: Record<string, unknown>
        journal?: { postAutomaticJournal: jest.Mock }
        resolution?: { resolveDetermination: jest.Mock }
        access?: { assertAccess: jest.Mock }
    }) {
        const tx = {
            ficoArDocument: {
                create: jest.fn().mockResolvedValue({ id: 'ar-doc-1' }),
                update: jest.fn(),
            },
            ficoArOpenItem: {
                create: jest.fn().mockResolvedValue({ id: 'ar-item-1' }),
                update: jest.fn(),
            },
            ficoAccountingAuditLog: { create: jest.fn() },
        }
        const prisma: any = {
            ficoArDocument: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: tx.ficoArDocument.create,
                update: tx.ficoArDocument.update,
            },
            sdSalesInvoice: {
                findUnique: jest.fn().mockResolvedValue(invoice),
            },
            sdSalesOrder: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'cust-1',
                    customerNumber: 'C-1',
                    companyName: 'Acme',
                }),
            },
            mmAccountingEvent: { findUnique: jest.fn().mockResolvedValue(null) },
            sdPosReceivable: {
                findFirst: jest.fn().mockResolvedValue(null),
                findMany: jest.fn().mockResolvedValue([]),
            },
            sdPosCollection: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
            ficoJournalEntry: {
                findUnique: jest.fn().mockResolvedValue(null),
            },
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue({
                    chartOfAccountsId: 'coa-1',
                    defaultReceivableAccountId: 'ar-gl',
                    defaultSalesRevenueAccountId: 'rev-gl',
                    defaultTaxOutputAccountId: 'tax-gl',
                    defaultCashAccountId: 'cash-gl',
                }),
            },
            ficoGlAccount: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ar-gl',
                    accountCode: '1100',
                    accountName: 'Trade receivables',
                }),
            },
            ficoArOpenItem: {
                findMany: jest.fn().mockResolvedValue([]),
                create: tx.ficoArOpenItem.create,
                update: jest.fn(),
            },
            $transaction: jest.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) =>
                fn(tx),
            ),
            ...overrides?.prisma,
        }
        if (!(prisma as { $transaction?: unknown }).$transaction) {
            prisma.$transaction = jest.fn(
                async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
            )
        }
        const journal = overrides?.journal ?? {
            postAutomaticJournal: jest.fn(async (request: any) => {
                await request.afterPersist(tx, {
                    id: 'journal-1',
                    documentNumber: 'AR-000001',
                    postedAt: new Date('2026-11-01T00:00:00.000Z'),
                })
                return {
                    journalEntryId: 'journal-1',
                    documentNumber: 'AR-000001',
                    postedAt: new Date('2026-11-01T00:00:00.000Z'),
                    created: true,
                    duplicate: false,
                }
            }),
        }
        const resolution = overrides?.resolution ?? {
            resolveDetermination: jest.fn().mockRejectedValue(new Error('no rule')),
        }
        const access = overrides?.access ?? { assertAccess: jest.fn() }
        const service = new FicoAccountsReceivableService(
            prisma,
            access as any,
            resolution as any,
            journal as any,
        )
        return { service, prisma, journal, tx, access }
    }

    it('posts an issued sales invoice through the journal and creates AR open-item state', async () => {
        const { service, journal, tx } = buildService()

        await expect(
            service.postIssuedSalesInvoice({
                schemaVersion: 'v2',
                eventType: 'SalesInvoiceIssued',
                companyId: 'company-1',
                postingDate: '2026-11-01T00:00:00.000Z',
                transactionDate: '2026-11-01T00:00:00.000Z',
                currencyCode: 'PHP',
                documentType: 'SALES_INVOICE',
                documentId: 'inv-1',
                sourceModule: 'SD',
                accountingEffects: [],
                lines: [],
                financiallyRelevant: true,
                mmAccountingEventId: 'event-1',
                idempotencyKey: 'sales-invoice-ar:inv-1',
            }),
        ).resolves.toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'journal-1',
        })

        const request = journal.postAutomaticJournal.mock.calls[0][0]
        expect(request.subledgerPosting).toBe('AR')
        expect(request.sourceModule).toBe('AR')
        expect(request.lines).toEqual([
            expect.objectContaining({
                glAccountId: 'ar-gl',
                debit: new Decimal(112),
                credit: new Decimal(0),
            }),
            expect.objectContaining({
                glAccountId: 'rev-gl',
                debit: new Decimal(0),
                credit: new Decimal(100),
            }),
            expect.objectContaining({
                glAccountId: 'tax-gl',
                debit: new Decimal(0),
                credit: new Decimal(12),
            }),
        ])
        expect(tx.ficoArDocument.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    sourceSalesInvoiceId: 'inv-1',
                    journalEntryId: 'journal-1',
                    receivableAmount: new Decimal(112),
                }),
            }),
        )
        expect(tx.ficoArOpenItem.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'OPEN',
                    direction: 'DEBIT',
                    dueDate: new Date('2026-12-01T00:00:00.000Z'),
                }),
            }),
        )
    })

    it('replays the issued event as a duplicate without a second document', async () => {
        const { service, journal } = buildService({
            prisma: {
                ficoArDocument: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'ar-doc-1',
                        status: 'POSTED',
                        journalEntryId: 'journal-1',
                    }),
                },
            },
        })

        await expect(
            service.postIssuedSalesInvoice({
                schemaVersion: 'v2',
                eventType: 'SalesInvoiceIssued',
                companyId: 'company-1',
                postingDate: '2026-11-01T00:00:00.000Z',
                transactionDate: '2026-11-01T00:00:00.000Z',
                currencyCode: 'PHP',
                documentType: 'SALES_INVOICE',
                documentId: 'inv-1',
                sourceModule: 'SD',
                accountingEffects: [],
                lines: [],
                financiallyRelevant: true,
            }),
        ).resolves.toEqual({
            created: false,
            duplicate: true,
            journalEntryId: 'journal-1',
        })
        expect(journal.postAutomaticJournal).not.toHaveBeenCalled()
    })

    it('skips POS-owned orders so AR does not double-post with POS revenue', async () => {
        const { service, journal } = buildService({
            prisma: {
                sdSalesInvoice: {
                    findUnique: jest.fn().mockResolvedValue({
                        ...invoice,
                        salesOrder: { ...invoice.salesOrder, channel: 'POS' },
                    }),
                },
            },
        })

        await expect(
            service.postIssuedSalesInvoice({
                schemaVersion: 'v2',
                eventType: 'SalesInvoiceIssued',
                companyId: 'company-1',
                postingDate: '2026-11-01T00:00:00.000Z',
                transactionDate: '2026-11-01T00:00:00.000Z',
                currencyCode: 'PHP',
                documentType: 'SALES_INVOICE',
                documentId: 'inv-1',
                sourceModule: 'SD',
                accountingEffects: [],
                lines: [],
                financiallyRelevant: true,
            }),
        ).resolves.toMatchObject({
            created: false,
            skipped: true,
        })
        expect(journal.postAutomaticJournal).not.toHaveBeenCalled()
    })

    it('clears the open item and posts Dr cash / Cr AR on SalesInvoicePaid', async () => {
        const openItem = {
            id: 'ar-item-1',
            openAmount: new Decimal(112),
            status: 'OPEN',
            reconciliationAccountId: 'ar-gl',
        }
        const document = {
            id: 'ar-doc-1',
            companyId: 'company-1',
            referenceNumber: 'INV-0001',
            status: 'POSTED',
            currencyCode: 'PHP',
            journalEntryId: 'journal-issue',
            clearingJournalEntryId: null,
            reconciliationAccountId: 'ar-gl',
            openItem,
        }
        const { service, journal, tx, prisma } = buildService({
            prisma: {
                ficoArDocument: {
                    findUnique: jest.fn().mockResolvedValue(document),
                },
                sdSalesInvoice: {
                    findUnique: jest.fn().mockResolvedValue({
                        ...invoice,
                        status: 'PAID',
                        paidAt: new Date('2026-11-15T00:00:00.000Z'),
                    }),
                },
            },
        })

        await expect(
            service.clearPaidSalesInvoice({
                schemaVersion: 'v2',
                eventType: 'SalesInvoicePaid',
                companyId: 'company-1',
                postingDate: '2026-11-15T00:00:00.000Z',
                transactionDate: '2026-11-15T00:00:00.000Z',
                currencyCode: 'PHP',
                documentType: 'SALES_INVOICE',
                documentId: 'inv-1',
                sourceModule: 'SD',
                accountingEffects: [],
                lines: [],
                financiallyRelevant: true,
                idempotencyKey: 'sales-invoice-ar-clear:inv-1',
            }),
        ).resolves.toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'journal-1',
        })

        const request = journal.postAutomaticJournal.mock.calls[0][0]
        expect(request.lines).toEqual([
            expect.objectContaining({
                glAccountId: 'cash-gl',
                debit: new Decimal(112),
            }),
            expect.objectContaining({
                glAccountId: 'ar-gl',
                credit: new Decimal(112),
            }),
        ])
        expect(tx.ficoArOpenItem.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    openAmount: new Decimal(0),
                    status: 'CLEARED',
                }),
            }),
        )
        expect(prisma.ficoArDocument.findUnique).toHaveBeenCalled()
    })

    it('ages open items into CURRENT / D1_30 / D90_PLUS buckets', async () => {
        const asOf = '2026-12-01T00:00:00.000Z'
        const { service, prisma, access } = buildService({
            prisma: {
                ficoArOpenItem: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: '1',
                            openAmount: new Decimal(10),
                            dueDate: new Date('2026-12-01T00:00:00.000Z'),
                            baselineDate: new Date('2026-11-01T00:00:00.000Z'),
                            customer: { id: 'c1', customerNumber: 'C1', companyName: 'A' },
                            document: {
                                id: 'd1',
                                referenceNumber: 'INV-1',
                                sourceSalesInvoice: { id: 'i1', invoiceNumber: 'INV-1' },
                                journalEntry: { id: 'j1', documentNumber: 'AR-1' },
                            },
                            reconciliationAccount: null,
                        },
                        {
                            id: '2',
                            openAmount: new Decimal(20),
                            dueDate: new Date('2026-11-01T00:00:00.000Z'),
                            baselineDate: new Date('2026-10-01T00:00:00.000Z'),
                            customer: { id: 'c2', customerNumber: 'C2', companyName: 'B' },
                            document: {
                                id: 'd2',
                                referenceNumber: 'INV-2',
                                sourceSalesInvoice: { id: 'i2', invoiceNumber: 'INV-2' },
                                journalEntry: { id: 'j2', documentNumber: 'AR-2' },
                            },
                            reconciliationAccount: null,
                        },
                        {
                            id: '3',
                            openAmount: new Decimal(30),
                            dueDate: new Date('2026-08-01T00:00:00.000Z'),
                            baselineDate: new Date('2026-07-01T00:00:00.000Z'),
                            customer: { id: 'c3', customerNumber: 'C3', companyName: 'C' },
                            document: {
                                id: 'd3',
                                referenceNumber: 'INV-3',
                                sourceSalesInvoice: { id: 'i3', invoiceNumber: 'INV-3' },
                                journalEntry: { id: 'j3', documentNumber: 'AR-3' },
                            },
                            reconciliationAccount: null,
                        },
                    ]),
                },
            },
        })

        const aging = await service.getAging('company-1', asOf, {
            id: 'user-1',
            role: 'accountant',
        } as any)

        expect(access.assertAccess).toHaveBeenCalled()
        expect(aging.buckets.CURRENT.toString()).toBe('10')
        expect(aging.buckets.D1_30.toString()).toBe('20')
        expect(aging.buckets.D90_PLUS.toString()).toBe('30')
        expect(prisma.ficoArOpenItem.findMany).toHaveBeenCalled()
    })

    it('denies company-scoped list access when the access guard rejects', async () => {
        const access = {
            assertAccess: jest.fn().mockRejectedValue(new BadRequestException('denied')),
        }
        const { service } = buildService({ access })

        await expect(
            service.listOpenItems(
                { companyId: 'company-1' },
                { id: 'user-1', role: 'accountant' } as any,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(access.assertAccess).toHaveBeenCalled()
    })

    it('attaches a POS charge open item to the existing revenue journal without posting GL', async () => {
        const { service, journal, tx, prisma } = buildService({
            prisma: {
                ficoArDocument: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
                sdSalesOrder: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'so-pos-1',
                        orderNumber: 'POS-000007',
                        companyId: 'company-1',
                        customerId: 'cust-1',
                        currency: 'PHP',
                        totalAmount: new Decimal(3000),
                        taxAmount: new Decimal(321.43),
                        outstandingBalance: new Decimal(3000),
                        dueDate: new Date('2026-12-03T00:00:00.000Z'),
                        createdAt: new Date('2026-11-26T00:00:00.000Z'),
                        lines: [{ taxAmount: new Decimal(321.43) }],
                    }),
                },
                sdPosReceivable: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'recv-1',
                        originalAmount: new Decimal(3000),
                        balance: new Decimal(3000),
                        dueDate: new Date('2026-12-03T00:00:00.000Z'),
                        status: 'OPEN',
                    }),
                },
                ficoJournalEntry: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'pos-journal-1',
                        companyId: 'company-1',
                        postingDate: new Date('2026-11-26T00:00:00.000Z'),
                        documentDate: new Date('2026-11-26T00:00:00.000Z'),
                        currencyCode: 'PHP',
                        status: 'POSTED',
                        lines: [
                            {
                                glAccountId: 'ar-gl',
                                debitAmount: new Decimal(3000),
                                creditAmount: new Decimal(0),
                            },
                        ],
                    }),
                },
            },
        })

        await expect(
            service.registerPosChargeOpenItemFromJournal({
                companyId: 'company-1',
                salesOrderId: 'so-pos-1',
                journalEntryId: 'pos-journal-1',
                outstandingBalance: '3000',
            }),
        ).resolves.toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'pos-journal-1',
        })

        expect(journal.postAutomaticJournal).not.toHaveBeenCalled()
        expect(prisma.$transaction).toHaveBeenCalled()
        expect(tx.ficoArDocument.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    documentType: 'POS_CHARGE',
                    sourceSalesOrderId: 'so-pos-1',
                    sourcePosReceivableId: 'recv-1',
                    journalEntryId: 'pos-journal-1',
                    referenceNumber: 'POS-000007',
                    receivableAmount: new Decimal(3000),
                }),
            }),
        )
        expect(tx.ficoArOpenItem.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    itemType: 'POS_CHARGE',
                    status: 'OPEN',
                    openAmount: new Decimal(3000),
                }),
            }),
        )
    })

    it('replays POS charge attach as a duplicate when the order already has an AR document', async () => {
        const { service, journal } = buildService({
            prisma: {
                ficoArDocument: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'ar-doc-pos',
                        journalEntryId: 'pos-journal-1',
                        status: 'POSTED',
                    }),
                },
            },
        })

        await expect(
            service.registerPosChargeOpenItemFromJournal({
                companyId: 'company-1',
                salesOrderId: 'so-pos-1',
                journalEntryId: 'pos-journal-1',
                outstandingBalance: '3000',
            }),
        ).resolves.toEqual({
            created: false,
            duplicate: true,
            journalEntryId: 'pos-journal-1',
        })
        expect(journal.postAutomaticJournal).not.toHaveBeenCalled()
    })

    it('reduces the POS AR open item on collection without posting a clearing journal', async () => {
        const openItem = {
            id: 'ar-item-pos',
            openAmount: new Decimal(3000),
            status: 'OPEN',
        }
        const document = {
            id: 'ar-doc-pos',
            status: 'POSTED',
            journalEntryId: 'pos-journal-1',
            clearingJournalEntryId: null,
            openItem,
        }
        const { service, journal, tx, prisma } = buildService({
            prisma: {
                sdPosCollection: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'coll-1',
                        companyId: 'company-1',
                        salesOrderId: 'so-pos-1',
                        totalAmount: new Decimal(1000),
                        status: 'COMPLETED',
                        collectionNumber: 'COL-1',
                    }),
                },
                ficoArDocument: {
                    findUnique: jest.fn().mockResolvedValue(document),
                },
            },
        })

        await expect(
            service.applyPosCollectionToOpenItem({
                companyId: 'company-1',
                collectionId: 'coll-1',
                journalEntryId: 'pos-coll-journal-1',
                collectedAmount: '1000',
            }),
        ).resolves.toEqual({
            created: true,
            duplicate: false,
            journalEntryId: 'pos-coll-journal-1',
        })

        expect(journal.postAutomaticJournal).not.toHaveBeenCalled()
        expect(tx.ficoArOpenItem.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    openAmount: new Decimal(2000),
                    status: 'PARTIALLY_CLEARED',
                }),
            }),
        )
        expect(tx.ficoArDocument.update).not.toHaveBeenCalled()
        expect(prisma.$transaction).toHaveBeenCalled()
    })
})
