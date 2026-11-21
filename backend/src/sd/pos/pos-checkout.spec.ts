import { BadRequestException } from '@nestjs/common'
import { PosCheckoutService, toReceiptBusiness } from './pos-checkout.service'

describe('toReceiptBusiness', () => {
    it('maps the selling company for the receipt header', () => {
        expect(
            toReceiptBusiness({
                name: '  Amalgated World Import Corporation ',
                address: ' 12 Rizal St, Cebu ',
                tin: '123-456-789-000',
                logoUrl: ' /uploads/companies/awic.png ',
            }),
        ).toEqual({
            name: 'Amalgated World Import Corporation',
            address: '12 Rizal St, Cebu',
            tin: '123-456-789-000',
            logoUrl: '/uploads/companies/awic.png',
        })
    })

    it('keeps blank optional fields empty and rejects a company without a name', () => {
        expect(toReceiptBusiness({ name: 'AWIC', address: '', tin: null })).toEqual({
            name: 'AWIC',
            address: '',
            tin: '',
            logoUrl: null,
        })
        expect(toReceiptBusiness({ name: '  ' })).toBeNull()
        expect(toReceiptBusiness(null)).toBeNull()
    })
})

const COMPANY_ID = 'company-1'
const MATERIAL_ID = 'material-1'

const makeMaterial = (treatment: 'VAT_INCLUSIVE' | 'VAT_EXCLUSIVE') => ({
    id: MATERIAL_ID,
    taxClassification: 'VATABLE',
    taxCodeId: 'code-1',
    priceTaxTreatment: treatment,
    taxStatus: 'ACTIVE',
    taxEffectiveFrom: new Date('2026-01-01'),
    taxEffectiveTo: null,
    taxDescription: null,
    taxCode: {
        id: 'code-1',
        companyId: COMPANY_ID,
        code: 'VAT12',
        name: 'VAT 12%',
        taxType: 'VAT',
        status: 'ACTIVE',
        taxRates: [
            {
                rate: 12,
                rateUnit: 'PERCENTAGE',
                effectiveFrom: new Date('2026-01-01'),
                effectiveTo: null,
                status: 'ACTIVE',
            },
        ],
    },
})

describe('PosCheckoutService', () => {
    let service: PosCheckoutService
    let prisma: any
    let salesOrders: any
    let sessions: any
    let materials: any
    let goodsIssue: any
    let sdEvents: any
    let customers: any

    const order = {
        id: 'order-1',
        orderNumber: 'POS-000001',
        companyId: COMPANY_ID,
        receiptNumber: null,
        status: 'CONFIRMED',
        branchId: 'branch-1',
        posSessionId: null,
        cashierUserId: null,
        customerName: 'Walk-in customer',
        subtotal: 7300,
        discountAmount: 0,
        taxAmount: null,
        totalAmount: 7300,
        paymentReceived: 8000,
        changeAmount: 700,
        createdBy: 'cashier-1',
        updatedAt: new Date('2026-11-12T00:00:00.000Z'),
        lines: [
            {
                sku: 'SKU-1',
                description: 'Item',
                variantName: null,
                lineNumber: 1,
                materialId: MATERIAL_ID,
                quantity: 1,
                unitPrice: 7300,
                lineTotal: 7300,
            },
        ],
    }

    /** VAT snapshot written per order line (lineNumber → data), as the DB would keep it. */
    let lineTax: Record<number, Record<string, unknown>>

    beforeEach(() => {
        lineTax = {}
        prisma = {
            sdSalesOrder: {
                findUnique: jest.fn().mockResolvedValue(null),
                count: jest.fn().mockResolvedValue(4),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn().mockImplementation(async () => ({
                    ...order,
                    lines: order.lines.map((line) => ({ ...line, ...lineTax[line.lineNumber] })),
                    status: 'COMPLETED',
                    receiptNumber: 'RCP-000005',
                    payments: [
                        {
                            paymentMethod: 'CASH',
                            amount: 7300,
                            tenderAmount: 8000,
                            changeAmount: 700,
                            referenceNumber: null,
                            status: 'Paid',
                            verificationStatus: 'VERIFIED',
                        },
                    ],
                })),
            },
            sdSalesOrderPayment: { upsert: jest.fn().mockResolvedValue({}) },
            sdSalesOrderLine: {
                findMany: jest.fn().mockResolvedValue(order.lines),
                updateMany: jest.fn(async ({ where, data }: { where: { lineNumber: number }; data: Record<string, unknown> }) => {
                    lineTax[where.lineNumber] = data
                    return { count: 1 }
                }),
            },
            mmMaterial: {
                findMany: jest.fn().mockResolvedValue([makeMaterial('VAT_INCLUSIVE')]),
                findUnique: jest.fn().mockResolvedValue({ baseUomId: 'uom-1' }),
            },
            mmInventoryReservationHeader: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'res-1',
                    companyId: COMPANY_ID,
                    warehouseId: 'wh-1',
                    createdBy: 'cashier-1',
                }),
            },
            mmInventoryBalance: {
                findFirst: jest.fn().mockResolvedValue({ storageBinId: 'bin-1' }),
                findMany: jest.fn().mockResolvedValue([
                    { storageBinId: 'bin-1', quantity: 5 },
                ]),
            },
            mmGoodsIssue: {
                findFirst: jest.fn().mockResolvedValue(null),
                delete: jest.fn().mockResolvedValue({}),
            },
            mmGoodsIssueLine: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            $transaction: jest.fn(async (ops: unknown) =>
                Promise.all(ops as Promise<unknown>[]),
            ),
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'cust-1',
                    customerAccountType: 'CREDIT',
                    creditLimit: 10000,
                    availableCredit: 5000,
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            sdEmployeeLoanItem: {
                create: jest.fn().mockResolvedValue({ id: 'loan-1' }),
            },
            sdPosReceivable: {
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _sum: { balance: null } }),
                upsert: jest.fn().mockResolvedValue({}),
            },
            user: {
                findFirst: jest.fn().mockResolvedValue({
                    employeeCode: 'EMP-1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
        }
        salesOrders = {
            createRetail: jest.fn().mockResolvedValue(order),
        }
        sessions = {
            requireOpen: jest.fn().mockResolvedValue({
                id: 'session-1',
                companyId: COMPANY_ID,
                branchId: 'branch-1',
                status: 'OPEN',
            }),
            ensureOpen: jest.fn().mockResolvedValue({
                id: 'session-1',
                companyId: COMPANY_ID,
                branchId: 'branch-1',
                status: 'OPEN',
            }),
        }
        materials = {
            findProductByDivisionSku: jest
                .fn()
                .mockResolvedValue({ id: 'product-1' }),
            resolveMaterialForProduct: jest.fn().mockResolvedValue({
                materialId: MATERIAL_ID,
            }),
        }
        goodsIssue = {
            create: jest.fn().mockResolvedValue({ id: 'gi-1' }),
            verifySupervisor: jest.fn().mockResolvedValue({ id: 'gi-1' }),
            post: jest.fn().mockResolvedValue({ id: 'gi-1', status: 'POSTED' }),
        }
        sdEvents = { emit: jest.fn().mockResolvedValue(undefined) }
        customers = {
            resolveByName: jest.fn().mockResolvedValue({
                id: 'cust-1',
                companyName: 'Walk-in customer',
            }),
        }

        service = new PosCheckoutService(
            prisma,
            salesOrders,
            sessions,
            materials,
            goodsIssue,
            sdEvents,
            customers,
            { list: jest.fn().mockResolvedValue([]) } as any,
        )
    })

    const dto = (overrides: Record<string, unknown> = {}) => ({
        posSessionId: 'session-1',
        companyId: COMPANY_ID,
        terminalCode: 'POS-01',
        idempotencyKey: 'pos-key-1',
        divisionId: 'DIV_RETAIL',
        branchId: 'branch-1',
        customerId: 'WALK-IN',
        cashierUserId: 'cashier-1',
        createdBy: 'cashier-1',
        lines: [
            {
                sku: 'SKU-1',
                quantity: 1,
                unitPrice: 7300,
                description: 'Item',
            },
        ],
        tenders: [{ method: 'CASH', amount: 7300, tenderAmount: 8000 }],
        ...overrides,
    })

    it('completes the sale: order, tenders, goods issue and receipt', async () => {
        const receipt = await service.complete(dto() as never)

        expect(salesOrders.createRetail).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'POS',
                deferCompletion: true,
                subtotal: 7300,
                totalAmount: 7300,
                taxAmount: 0,
            }),
        )
        expect(prisma.sdSalesOrderPayment.upsert).toHaveBeenCalledTimes(1)
        expect(goodsIssue.create).toHaveBeenCalledWith(
            expect.objectContaining({
                issuePurpose: 'SALES',
                sourceDocumentType: 'SALES_ORDER',
                sourceDocumentId: 'order-1',
                lines: [
                    expect.objectContaining({
                        materialId: MATERIAL_ID,
                        quantity: 1,
                        storageBinId: 'bin-1',
                    }),
                ],
            }),
        )
        expect(goodsIssue.verifySupervisor).toHaveBeenCalledWith(
            'gi-1',
            expect.objectContaining({ sourceDocumentReference: 'POS-000001' }),
        )
        expect(goodsIssue.post).toHaveBeenCalledWith('gi-1')
        expect(sdEvents.emit).toHaveBeenCalledWith(
            'PosSaleCompleted',
            expect.objectContaining({ orderNumber: 'POS-000001' }),
        )
        expect(receipt.total).toBe(7300)
        expect(receipt.change).toBe(700)
        expect(receipt.receiptNumber).toBe('RCP-000005')
    })

    it('freezes the VAT of VAT-inclusive lines on the order and shows it on the receipt', async () => {
        const receipt = await service.complete(dto() as never)

        expect(prisma.sdSalesOrderLine.updateMany).toHaveBeenCalledWith({
            where: { salesOrderId: 'order-1', lineNumber: 1 },
            data: {
                taxClassification: 'VATABLE',
                taxCode: 'VAT12',
                taxRate: 12,
                taxTreatment: 'VAT_INCLUSIVE',
                taxAmount: 782.14,
                taxableAmount: 6517.86,
            },
        })
        expect(receipt.total).toBe(7300)
        expect(receipt).toMatchObject({
            vatableSales: 6517.86,
            vatAmount: 782.14,
            taxIncludedAmount: 782.14,
            vatExemptSales: 0,
            zeroRatedSales: 0,
        })
        expect(receipt.lines[0]).toMatchObject({
            taxClassification: 'VATABLE',
            taxCode: 'VAT12',
            taxRate: 12,
            taxIncluded: 782.14,
            taxAdded: 0,
        })
    })

    it('puts the material category and brand on each receipt line', async () => {
        const withMaterial = {
            ...order,
            status: 'COMPLETED',
            receiptNumber: 'RCP-000005',
            payments: [],
            lines: [
                {
                    ...order.lines[0],
                    material: {
                        brand: '  Aveeno ',
                        materialCategory: { name: 'SKINCARE' },
                        barcodes: [],
                    },
                },
                { ...order.lines[0], lineNumber: 2, sku: 'SKU-2', material: null },
            ],
        }
        prisma.sdSalesOrder.update.mockResolvedValueOnce(withMaterial)

        const receipt = await service.complete(dto() as never)

        expect(receipt.lines[0]).toMatchObject({ category: 'SKINCARE', brand: 'Aveeno' })
        expect(receipt.lines[1]).toMatchObject({ category: null, brand: null })
    })

    it('prints the cashier full name on the receipt, falling back to the login name', async () => {
        const served = {
            ...order,
            status: 'COMPLETED',
            receiptNumber: 'RCP-000005',
            payments: [],
            cashierUserId: 'cashier-1',
        }
        prisma.sdSalesOrder.update.mockResolvedValueOnce(served)
        prisma.user.findMany.mockResolvedValueOnce([
            {
                id: 'cashier-1',
                firstName: ' Jane ',
                lastName: 'Doe',
                userName: 'jdoe',
            },
        ])
        const receipt = await service.complete(dto() as never)
        expect(receipt.cashierName).toBe('Jane Doe')

        prisma.sdSalesOrder.update.mockResolvedValueOnce(served)
        prisma.user.findMany.mockResolvedValueOnce([
            { id: 'cashier-1', firstName: '', lastName: '', userName: 'jdoe' },
        ])
        const fallback = await service.complete(dto() as never)
        expect(fallback.cashierName).toBe('jdoe')
    })

    it('records one tender row per payment method', async () => {
        await service.complete(
            dto({
                paymentMode: 'SPLIT',
                tenders: [
                    { method: 'CASH', amount: 3000 },
                    {
                        method: 'GCASH',
                        amount: 4300,
                        referenceNumber: 'GC-1',
                        verifiedBy: 'cashier-1',
                    },
                ],
            }) as never,
        )
        expect(prisma.sdSalesOrderPayment.upsert).toHaveBeenCalledTimes(2)
        expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paymentMethod: 'SPLIT',
                    paymentStatus: 'Paid',
                }),
            }),
        )
    })

    it('rejects split payment with a single tender', async () => {
        await expect(
            service.complete(
                dto({
                    paymentMode: 'SPLIT',
                    tenders: [{ method: 'CASH', amount: 7300, tenderAmount: 7300 }],
                }) as never,
            ),
        ).rejects.toThrow(/at least two payment methods/i)
    })

    it('does not mark a split sale Paid while a tender is still pending', async () => {
        await service.complete(
            dto({
                paymentMode: 'SPLIT',
                tenders: [
                    { method: 'CASH', amount: 3000 },
                    {
                        method: 'GCASH',
                        amount: 4300,
                        referenceNumber: 'GC-1',
                    },
                ],
            }) as never,
        )
        expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paymentMethod: 'SPLIT',
                    paymentStatus: 'Pending Verification',
                }),
            }),
        )
    })

    it('treats an item without tax setup as a non-VAT sale, without a receipt warning', async () => {
        prisma.mmMaterial.findMany.mockResolvedValue([
            { id: MATERIAL_ID, taxClassification: null, taxCodeId: null, priceTaxTreatment: null, taxStatus: null, taxCode: null },
        ])
        const receipt = await service.complete(dto() as never)

        expect(receipt.warnings).toEqual([])
        expect(receipt).toMatchObject({ vatableSales: 0, vatAmount: 0, nonVatSales: 7300, total: 7300 })
        expect(receipt.lines[0]).toMatchObject({ taxClassification: null, taxIncluded: 0, taxAdded: 0 })
    })

    it('adds the tax of VAT-exclusive lines to the amount due', async () => {
        prisma.mmMaterial.findMany.mockResolvedValue([
            makeMaterial('VAT_EXCLUSIVE'),
        ])
        const receipt = await service.complete(
            dto({ tenders: [{ method: 'CASH', amount: 8176 }] }) as never,
        )
        expect(salesOrders.createRetail).toHaveBeenCalledWith(
            expect.objectContaining({ taxAmount: 876, totalAmount: 8176 }),
        )
        expect(receipt).toMatchObject({ vatableSales: 7300, vatAmount: 876, taxIncludedAmount: 0 })
        expect(receipt.lines[0]).toMatchObject({ taxAdded: 876, taxIncluded: 0 })
    })

    it('lists the void transaction after the completed sale it reversed', async () => {
        prisma.sdSalesOrder.findMany = jest.fn().mockResolvedValue([
            {
                ...order,
                status: 'CANCELLED',
                receiptNumber: 'RCP-000005',
                voidedAt: new Date('2026-11-13T01:00:00.000Z'),
                voidedBy: 'cashier-1',
                voidReason: 'Wrong item scanned',
                payments: [],
                voidTransaction: {
                    voidNumber: 'V-RCP-000005',
                    amount: -7300,
                    reason: 'Wrong item scanned',
                    voidedBy: 'cashier-1',
                    createdAt: new Date('2026-11-13T01:00:00.000Z'),
                },
            },
        ])

        const rows = await service.listReceipts({ companyId: COMPANY_ID })

        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({
            receiptNumber: 'RCP-000005',
            status: 'CANCELLED',
            transactionType: 'SALE',
            voidTransactionNumber: 'V-RCP-000005',
        })
        expect(rows[1]).toMatchObject({
            receiptNumber: 'V-RCP-000005',
            status: 'VOID',
            transactionType: 'VOID',
            originalReceiptNumber: 'RCP-000005',
            voidTransactionNumber: 'V-RCP-000005',
            total: -7300,
            tenders: [],
        })
    })

    it('lists a sale that was not voided on its own', async () => {
        prisma.sdSalesOrder.findMany = jest
            .fn()
            .mockResolvedValue([{ ...order, payments: [], voidTransaction: null }])

        const rows = await service.listReceipts({ companyId: COMPANY_ID })

        expect(rows).toHaveLength(1)
        expect(rows[0].receiptNumber).toBe('POS-000001')
    })

    it('finishes a sale whose checkout stopped before the goods issue', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue({
            ...order,
            status: 'CONFIRMED',
            receiptNumber: 'RCP-000009',
            customerId: 'cust-1',
            currency: 'PHP',
            posSessionId: null,
            changeAmount: null,
            paymentReceived: 8000,
            payments: [
                {
                    paymentMethod: 'CASH',
                    amount: 7300,
                    tenderAmount: 8000,
                    changeAmount: 700,
                    referenceNumber: null,
                    paymentProvider: null,
                    status: 'Paid',
                    verificationStatus: 'VERIFIED',
                },
            ],
        })
        prisma.mmGoodsIssue.findFirst.mockResolvedValue({
            id: 'gi-1',
            status: 'DRAFT',
            supervisorVerifiedAt: null,
        })

        const receipt = await service.finalizeStagedOrder(
            'order-1',
            'cashier-1',
        )

        expect(goodsIssue.verifySupervisor).toHaveBeenCalledWith(
            'gi-1',
            expect.objectContaining({
                sourceDocumentReference: 'POS-000001',
            }),
        )
        expect(goodsIssue.post).toHaveBeenCalledWith('gi-1')
        expect(prisma.mmGoodsIssueLine.deleteMany).toHaveBeenCalledWith({
            where: { issueId: 'gi-1' },
        })
        expect(prisma.mmGoodsIssue.delete).toHaveBeenCalledWith({
            where: { id: 'gi-1' },
        })
        expect(goodsIssue.create).toHaveBeenCalled()
        expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'COMPLETED' }),
            }),
        )
        expect(receipt.status).toBe('COMPLETED')
    })

    it('replays the same checkout without posting anything twice', async () => {
        prisma.sdSalesOrder.findUnique.mockResolvedValue({
            ...order,
            status: 'COMPLETED',
            receiptNumber: 'RCP-000005',
            payments: [],
        })
        const receipt = await service.complete(dto() as never)
        expect(salesOrders.createRetail).not.toHaveBeenCalled()
        expect(goodsIssue.post).not.toHaveBeenCalled()
        expect(prisma.sdSalesOrderPayment.upsert).not.toHaveBeenCalled()
        expect(receipt.receiptNumber).toBe('RCP-000005')
    })

    it('allows a salary deduction without a CREDIT customer account', async () => {
        prisma.sdCustomer.findUnique.mockResolvedValue({
            id: 'cust-1',
            customerAccountType: 'NON_CREDIT',
            creditLimit: 0,
            availableCredit: 0,
        })
        prisma.sdSalesOrder.update.mockImplementation(async () => ({
            ...order,
            lines: order.lines.map((line) => ({
                ...line,
                ...lineTax[line.lineNumber],
            })),
            status: 'COMPLETED',
            receiptNumber: 'RCP-000006',
            paymentStatus: 'Unpaid',
            payments: [
                {
                    paymentMethod: 'SALARY_LOAN',
                    amount: 7300,
                    tenderAmount: 7300,
                    changeAmount: 0,
                    referenceNumber: null,
                    employeeName: 'Jane Doe',
                    status: 'Unpaid',
                    verificationStatus: 'RECEIVABLE',
                },
            ],
        }))
        const receipt = await service.complete(
            dto({
                customerId: 'cust-1',
                customerName: 'Jane Doe',
                tenders: [
                    {
                        method: 'SALARY_LOAN',
                        amount: 7300,
                        employeeName: 'Jane Doe',
                    },
                ],
            }) as never,
        )
        expect(salesOrders.createRetail).toHaveBeenCalled()
        expect(receipt.paymentStatus).toBe('Unpaid')
        expect(receipt.tenders[0].employeeName).toBe('Jane Doe')
    })

    describe('charge sale (pay later)', () => {
        const dueIn = (days: number) =>
            new Date(Date.now() + days * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)

        const chargeDto = (overrides: Record<string, unknown> = {}) =>
            dto({
                customerId: 'cust-1',
                customerName: 'Ian Apusaga',
                paymentMode: 'CHARGE',
                tenders: [],
                dueDate: dueIn(3),
                ...overrides,
            })

        /** The completed charge order as the database keeps it. */
        const chargedOrder = () => ({
            ...order,
            lines: order.lines.map((line) => ({
                ...line,
                ...lineTax[line.lineNumber],
            })),
            status: 'COMPLETED',
            receiptNumber: 'RCP-000005',
            paymentMethod: 'CHARGE',
            paymentStatus: 'Unpaid',
            paymentReceived: 0,
            changeAmount: 0,
            outstandingBalance: 7300,
            dueDate: new Date(`${dueIn(3)}T00:00:00.000Z`),
            payments: [],
        })

        beforeEach(() => {
            prisma.sdSalesOrder.update.mockImplementation(async () =>
                chargedOrder(),
            )
        })

        it('releases the goods and books the whole total as a receivable', async () => {
            const receipt = await service.complete(chargeDto() as never)

            expect(salesOrders.createRetail).toHaveBeenCalledWith(
                expect.objectContaining({
                    chargeSale: true,
                    paymentReceived: 0,
                    deferCompletion: true,
                    totalAmount: 7300,
                }),
            )
            // No money changed hands: no tender rows.
            expect(prisma.sdSalesOrderPayment.upsert).not.toHaveBeenCalled()
            // The goods still leave through the MM goods issue.
            expect(goodsIssue.post).toHaveBeenCalledWith('gi-1')
            expect(prisma.sdPosReceivable.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    create: expect.objectContaining({
                        salesOrderId: 'order-1',
                        customerId: 'cust-1',
                        originalAmount: 7300,
                        balance: 7300,
                    }),
                }),
            )
            expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: 'COMPLETED',
                        paymentMethod: 'CHARGE',
                        paymentStatus: 'Unpaid',
                        outstandingBalance: 7300,
                        downPaymentType: null,
                        downPaymentAmount: null,
                    }),
                }),
            )
            // Accounting books Accounts Receivable for the whole total.
            expect(sdEvents.emit).toHaveBeenCalledWith(
                'PosSaleCompleted',
                expect.objectContaining({
                    outstandingBalance: '7300.00',
                    paymentStatus: 'Unpaid',
                    tenders: [],
                }),
            )
            expect(receipt).toMatchObject({
                paymentMode: 'CHARGE',
                paymentStatus: 'Unpaid',
                outstandingBalance: 7300,
                total: 7300,
                tenders: [],
            })
            expect(receipt.dueDate).toBeTruthy()
        })

        it('requires an identified customer', async () => {
            await expect(
                service.complete(
                    chargeDto({
                        customerId: 'WALK-IN',
                        customerName: undefined,
                    }) as never,
                ),
            ).rejects.toThrow('identified customer')
            expect(salesOrders.createRetail).not.toHaveBeenCalled()
            expect(goodsIssue.post).not.toHaveBeenCalled()
        })

        it('requires a due date that is not in the past', async () => {
            await expect(
                service.complete(
                    chargeDto({ dueDate: undefined }) as never,
                ),
            ).rejects.toThrow('due date')
            await expect(
                service.complete(chargeDto({ dueDate: dueIn(-2) }) as never),
            ).rejects.toThrow('past')
            expect(salesOrders.createRetail).not.toHaveBeenCalled()
        })

        it('takes no payment at the register', async () => {
            await expect(
                service.complete(
                    chargeDto({
                        tenders: [{ method: 'CASH', amount: 100 }],
                    }) as never,
                ),
            ).rejects.toThrow('down payment')
            expect(salesOrders.createRetail).not.toHaveBeenCalled()
        })

        it('holds a CREDIT customer to the credit limit, counting open receivables', async () => {
            // Limit 10,000; 5,000 already owed + 7,300 charge > 10,000.
            prisma.sdPosReceivable.aggregate.mockResolvedValue({
                _sum: { balance: 5000 },
            })
            await expect(
                service.complete(chargeDto() as never),
            ).rejects.toThrow('Credit limit exceeded')
            expect(salesOrders.createRetail).not.toHaveBeenCalled()
            expect(goodsIssue.post).not.toHaveBeenCalled()

            // Within the limit the sale goes through.
            prisma.sdPosReceivable.aggregate.mockResolvedValue({
                _sum: { balance: 2000 },
            })
            await expect(
                service.complete(chargeDto() as never),
            ).resolves.toMatchObject({ paymentMode: 'CHARGE' })
        })

        it('does not limit a customer without a credit account', async () => {
            prisma.sdCustomer.findUnique.mockResolvedValue({
                id: 'cust-1',
                customerAccountType: 'NON_CREDIT',
                creditLimit: 0,
            })
            prisma.sdPosReceivable.aggregate.mockResolvedValue({
                _sum: { balance: 99999 },
            })
            await expect(
                service.complete(chargeDto() as never),
            ).resolves.toMatchObject({ paymentMode: 'CHARGE' })
        })

        it('finishes a staged charge sale that has no tender, without a second order', async () => {
            prisma.sdSalesOrder.findFirst.mockResolvedValue({
                ...order,
                status: 'CONFIRMED',
                receiptNumber: 'RCP-000009',
                customerId: 'cust-1',
                currency: 'PHP',
                posSessionId: null,
                changeAmount: null,
                paymentReceived: 0,
                paymentMethod: 'CHARGE',
                outstandingBalance: 7300,
                dueDate: new Date(`${dueIn(3)}T00:00:00.000Z`),
                payments: [],
            })

            const receipt = await service.finalizeStagedOrder(
                'order-1',
                'cashier-1',
            )

            expect(goodsIssue.post).toHaveBeenCalledWith('gi-1')
            expect(prisma.sdPosReceivable.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { salesOrderId: 'order-1' },
                    create: expect.objectContaining({ balance: 7300 }),
                }),
            )
            expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        paymentMethod: 'CHARGE',
                        paymentStatus: 'Unpaid',
                    }),
                }),
            )
            expect(sdEvents.emit).toHaveBeenCalledWith(
                'PosSaleCompleted',
                expect.objectContaining({ outstandingBalance: '7300' }),
            )
            expect(receipt.paymentMode).toBe('CHARGE')
            expect(salesOrders.createRetail).not.toHaveBeenCalled()
        })

        it('still refuses to finish a normal staged sale that has no tender', async () => {
            prisma.sdSalesOrder.findFirst.mockResolvedValue({
                ...order,
                status: 'CONFIRMED',
                paymentMethod: null,
                outstandingBalance: null,
                payments: [],
            })
            await expect(
                service.finalizeStagedOrder('order-1', 'cashier-1'),
            ).rejects.toThrow('no tender')
        })
    })
})
