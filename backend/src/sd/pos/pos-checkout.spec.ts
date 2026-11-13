import { BadRequestException } from '@nestjs/common'
import { PosCheckoutService } from './pos-checkout.service'

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

    beforeEach(() => {
        prisma = {
            sdSalesOrder: {
                findUnique: jest.fn().mockResolvedValue(null),
                count: jest.fn().mockResolvedValue(4),
                findFirst: jest.fn().mockResolvedValue(null),
                update: jest.fn().mockImplementation(async () => ({
                    ...order,
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
            sdSalesOrderLine: { findMany: jest.fn().mockResolvedValue(order.lines) },
            mmMaterial: {
                findMany: jest.fn().mockResolvedValue([makeMaterial('VAT_INCLUSIVE')]),
                findUnique: jest.fn().mockResolvedValue({ baseUomId: 'uom-1' }),
            },
            mmInventoryReservationHeader: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'res-1',
                    warehouseId: 'wh-1',
                    createdBy: 'cashier-1',
                }),
            },
            mmInventoryBalance: {
                findFirst: jest.fn().mockResolvedValue({ storageBinId: 'bin-1' }),
            },
            mmGoodsIssue: { findFirst: jest.fn().mockResolvedValue(null) },
            sdCustomer: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'cust-1',
                    customerAccountType: 'CREDIT',
                    creditLimit: 10000,
                    availableCredit: 5000,
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

    it('records one tender row per payment method', async () => {
        await service.complete(
            dto({
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
    })

    it('adds the tax of VAT-exclusive lines to the amount due', async () => {
        prisma.mmMaterial.findMany.mockResolvedValue([
            makeMaterial('VAT_EXCLUSIVE'),
        ])
        await service.complete(
            dto({ tenders: [{ method: 'CASH', amount: 8176 }] }) as never,
        )
        expect(salesOrders.createRetail).toHaveBeenCalledWith(
            expect.objectContaining({ taxAmount: 876, totalAmount: 8176 }),
        )
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

    it('rejects a salary deduction without a credit account', async () => {
        prisma.sdCustomer.findUnique.mockResolvedValue({
            id: 'cust-1',
            customerAccountType: 'NON_CREDIT',
            creditLimit: 0,
            availableCredit: 0,
        })
        await expect(
            service.complete(
                dto({
                    tenders: [
                        {
                            method: 'SALARY_LOAN',
                            amount: 7300,
                            employeeNumber: 'EMP-1',
                        },
                    ],
                }) as never,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(salesOrders.createRetail).not.toHaveBeenCalled()
    })

    it('rejects a salary deduction above the credit limit', async () => {
        prisma.sdCustomer.findUnique.mockResolvedValue({
            id: 'cust-1',
            customerAccountType: 'CREDIT',
            creditLimit: 10000,
            availableCredit: 100,
        })
        await expect(
            service.complete(
                dto({
                    tenders: [
                        {
                            method: 'SALARY_LOAN',
                            amount: 7300,
                            employeeNumber: 'EMP-1',
                        },
                    ],
                }) as never,
            ),
        ).rejects.toThrow('Employee credit limit exceeded')
    })
})
