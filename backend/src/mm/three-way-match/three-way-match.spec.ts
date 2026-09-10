import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { ThreeWayMatchService } from './three-way-match.service'
import { MatchToleranceService } from './match-tolerance.service'
import { SupplierInvoiceService } from './supplier-invoice.service'

describe('MM-13 Three-Way Match', () => {
    let match: ThreeWayMatchService
    let invoices: SupplierInvoiceService

    const mockEvents = { emit: jest.fn() }

    const po = {
        id: 'po-1',
        poNumber: 'PO-1',
        companyId: 'co-1',
        supplierId: 'sup-1',
        currencyId: 'cur-1',
        quantityTolerancePctOverride: null,
        priceTolerancePctOverride: null,
        overDeliveryPctOverride: null,
        underDeliveryPctOverride: null,
        lines: [
            {
                id: 'pol-1',
                lineNumber: 1,
                materialId: 'mat-1',
                quantity: new Decimal(100),
                unitPrice: new Decimal(10),
                tax: new Decimal(50),
                receivedQuantity: new Decimal(98),
                invoicedQuantity: new Decimal(0),
            },
        ],
    }

    function makeInvoice(overrides: any = {}) {
        return {
            id: 'inv-1',
            invoiceNumber: 'SINV-1',
            companyId: 'co-1',
            supplierId: 'sup-1',
            purchaseOrderId: 'po-1',
            currencyId: 'cur-1',
            status: 'SUBMITTED',
            invoicedApplied: false,
            taxAmount: new Decimal(49),
            totalAmount: new Decimal(1029),
            lines: [
                {
                    id: 'il-1',
                    lineNumber: 1,
                    materialId: 'mat-1',
                    purchaseOrderLineId: 'pol-1',
                    invoicedQuantity: new Decimal(98),
                    unitPrice: new Decimal(10),
                    taxAmount: new Decimal(49),
                    lineTotal: new Decimal(1029),
                    matchStatus: 'PENDING',
                    receipts: [
                        {
                            goodsReceiptLineId: 'grl-1',
                            allocatedQuantity: new Decimal(98),
                            goodsReceiptLine: {
                                quantity: new Decimal(98),
                                receipt: {
                                    documentNumber: 'GR-1',
                                    status: 'POSTED',
                                    purchaseOrderId: 'po-1',
                                },
                            },
                        },
                    ],
                },
            ],
            ...overrides,
        }
    }

    const mockPrisma: any = {
        mmPurchaseOrder: {
            findUnique: jest.fn(),
        },
        mmPoToleranceConfig: {
            findUnique: jest.fn().mockResolvedValue({
                quantityTolerancePct: 0,
                priceTolerancePct: 0,
                absoluteToleranceAmount: 0,
                overDeliveryPct: 0,
                underDeliveryPct: 0,
            }),
        },
        mmSupplierInvoice: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        mmSupplierInvoiceLine: {
            update: jest.fn(),
            deleteMany: jest.fn(),
            create: jest.fn(),
        },
        mmSupplierInvoiceLineReceipt: {
            deleteMany: jest.fn(),
        },
        mmMatchException: {
            deleteMany: jest.fn(),
            create: jest.fn().mockImplementation(async ({ data }) => ({
                id: 'ex-1',
                ...data,
            })),
        },
        mmPurchaseOrderLine: {
            update: jest.fn(),
        },
        mmAccountingEvent: {
            create: jest.fn(),
        },
        mmGoodsReceiptLine: {
            findUnique: jest.fn(),
        },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue(po)
        mockPrisma.mmSupplierInvoice.update.mockImplementation(async ({ data }: any) => ({
            ...makeInvoice(),
            ...data,
            lines: makeInvoice().lines,
            exceptions: [],
            supplier: { id: 'sup-1' },
            purchaseOrder: po,
        }))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ThreeWayMatchService,
                MatchToleranceService,
                SupplierInvoiceService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EventEmitter2, useValue: mockEvents },
            ],
        }).compile()

        match = module.get(ThreeWayMatchService)
        invoices = module.get(SupplierInvoiceService)

        jest.spyOn(invoices, 'findOne').mockImplementation(async () =>
            makeInvoice(),
        )
    })

    it('PO 100 / GR 98 / Inv 98 → MATCHED, payment eligible, invoicedQuantity updated', async () => {
        const result = await match.runMatch('inv-1')

        expect(mockPrisma.mmSupplierInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'MATCHED',
                    paymentEligible: true,
                }),
            }),
        )
        expect(mockPrisma.mmPurchaseOrderLine.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'pol-1' },
                data: { invoicedQuantity: { increment: expect.anything() } },
            }),
        )
        expect(mockPrisma.mmAccountingEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    eventType: 'SUPPLIER_INVOICE_MATCHED',
                }),
            }),
        )
        expect(result).toBeDefined()
    })

    it('PO 100 / GR 98 / Inv 100 → BLOCKED + QUANTITY exception', async () => {
        const blockedInv = makeInvoice({
            lines: [
                {
                    ...makeInvoice().lines[0],
                    invoicedQuantity: new Decimal(100),
                    receipts: [
                        {
                            goodsReceiptLineId: 'grl-1',
                            allocatedQuantity: new Decimal(98),
                            goodsReceiptLine: {
                                quantity: new Decimal(98),
                                receipt: {
                                    documentNumber: 'GR-1',
                                    status: 'POSTED',
                                    purchaseOrderId: 'po-1',
                                },
                            },
                        },
                    ],
                },
            ],
        })
        jest.spyOn(invoices, 'findOne').mockResolvedValue(blockedInv as any)

        await match.runMatch('inv-1')

        expect(mockPrisma.mmSupplierInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'BLOCKED',
                    paymentEligible: false,
                }),
            }),
        )
        expect(mockPrisma.mmMatchException.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    varianceType: 'QUANTITY',
                    severity: 'BLOCKED',
                }),
            }),
        )
        expect(mockPrisma.mmAccountingEvent.create).not.toHaveBeenCalled()
        expect(mockEvents.emit).toHaveBeenCalledWith(
            'match.exception.created',
            expect.anything(),
        )
    })

    it('price mismatch beyond tolerance → BLOCKED', async () => {
        const inv = makeInvoice({
            lines: [
                {
                    ...makeInvoice().lines[0],
                    unitPrice: new Decimal(15),
                },
            ],
        })
        jest.spyOn(invoices, 'findOne').mockResolvedValue(inv as any)

        await match.runMatch('inv-1')

        expect(mockPrisma.mmMatchException.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ varianceType: 'PRICE' }),
            }),
        )
        expect(mockPrisma.mmSupplierInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'BLOCKED' }),
            }),
        )
    })

    it('tax mismatch beyond tolerance → BLOCKED', async () => {
        const inv = makeInvoice({
            lines: [
                {
                    ...makeInvoice().lines[0],
                    taxAmount: new Decimal(500),
                },
            ],
        })
        jest.spyOn(invoices, 'findOne').mockResolvedValue(inv as any)

        await match.runMatch('inv-1')

        expect(mockPrisma.mmMatchException.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ varianceType: 'TAX' }),
            }),
        )
    })

    it('currency mismatch → BLOCKED', async () => {
        const inv = makeInvoice({ currencyId: 'cur-OTHER' })
        jest.spyOn(invoices, 'findOne').mockResolvedValue(inv as any)

        await match.runMatch('inv-1')

        expect(mockPrisma.mmMatchException.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ varianceType: 'CURRENCY' }),
            }),
        )
    })

    it('within price tolerance → MATCHED', async () => {
        mockPrisma.mmPoToleranceConfig.findUnique.mockResolvedValue({
            quantityTolerancePct: 0,
            priceTolerancePct: 10,
            absoluteToleranceAmount: 0,
            overDeliveryPct: 0,
            underDeliveryPct: 0,
        })
        const inv = makeInvoice({
            lines: [
                {
                    ...makeInvoice().lines[0],
                    unitPrice: new Decimal(10.5), // 5% over
                },
            ],
        })
        jest.spyOn(invoices, 'findOne').mockResolvedValue(inv as any)

        await match.runMatch('inv-1')

        expect(mockPrisma.mmSupplierInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'MATCHED' }),
            }),
        )
    })

    it('partial invoice vs remaining receivable → PARTIALLY_MATCHED', async () => {
        const inv = makeInvoice({
            lines: [
                {
                    ...makeInvoice().lines[0],
                    invoicedQuantity: new Decimal(40),
                    taxAmount: new Decimal(20), // 40/100 * 50
                    receipts: [
                        {
                            goodsReceiptLineId: 'grl-1',
                            allocatedQuantity: new Decimal(40),
                            goodsReceiptLine: {
                                quantity: new Decimal(98),
                                receipt: {
                                    documentNumber: 'GR-1',
                                    status: 'POSTED',
                                    purchaseOrderId: 'po-1',
                                },
                            },
                        },
                    ],
                },
            ],
        })
        jest.spyOn(invoices, 'findOne').mockResolvedValue(inv as any)

        await match.runMatch('inv-1')

        expect(mockPrisma.mmSupplierInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'PARTIALLY_MATCHED',
                    paymentEligible: true,
                }),
            }),
        )
    })

    it('rejects create without GR allocations', async () => {
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue(po)
        await expect(
            invoices.create({
                companyId: 'co-1',
                supplierId: 'sup-1',
                purchaseOrderId: 'po-1',
                invoiceDate: '2026-09-04',
                lines: [
                    {
                        materialId: 'mat-1',
                        purchaseOrderLineId: 'pol-1',
                        uomId: 'uom-1',
                        invoicedQuantity: 10,
                        unitPrice: 10,
                        receipts: [],
                    },
                ],
            } as any),
        ).rejects.toThrow(BadRequestException)
    })
})
