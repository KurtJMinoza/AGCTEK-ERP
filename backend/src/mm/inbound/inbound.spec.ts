import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { ExpectedReceiptService } from './expected-receipt.service'
import { QualityInspectionService } from './quality-inspection.service'
import { ReceivingService } from './receiving.service'
import { GoodsReceiptService } from '../stock-ops/goods-receipt.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'

const mockPrisma: any = {
    mmPurchaseOrder: {
        findUnique: jest.fn(),
    },
    mmExpectedReceipt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmExpectedReceiptLine: {
        update: jest.fn(),
        findUnique: jest.fn(),
    },
    mmAsn: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmQualityInspection: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    },
    mmQualityInspectionLine: {
        update: jest.fn(),
    },
    mmGoodsReceipt: {
        findUnique: jest.fn(),
        create: jest.fn(),
    },
    mmBarcode: {
        findFirst: jest.fn(),
    },
    mmBatch: {
        findUnique: jest.fn(),
    },
    mmSerialNumber: {
        findUnique: jest.fn(),
    },
    wmPutawayTask: {
        create: jest.fn(),
        findFirst: jest.fn(),
    },
    wmStorageBin: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
    mmMaterial: {
        findUnique: jest.fn(),
    },
    mmInventoryBalance: {
        findMany: jest.fn(),
    },
    warehouse: {
        findUnique: jest.fn(),
    },
}

const mockPosting: any = {
    postTransaction: jest.fn(),
    reverseTransaction: jest.fn(),
}

const mockPutaway: any = {
    createFromGoodsReceiptLine: jest.fn(),
    recommendBin: jest.fn(),
}

const mockEvents: any = { emit: jest.fn() }

describe('ExpectedReceiptService', () => {
    let service: ExpectedReceiptService

    beforeEach(async () => {
        jest.resetAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExpectedReceiptService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(ExpectedReceiptService)
        mockPrisma.mmExpectedReceipt.findFirst.mockResolvedValue(null)
    })

    it('creates expected receipt from approved/sent PO with open qty', async () => {
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            id: 'po-1',
            companyId: 'co-1',
            supplierId: 'sup-1',
            warehouseId: 'wh-1',
            status: 'SENT',
            expectedDeliveryDate: new Date(),
            lines: [
                {
                    id: 'pol-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(100),
                    receivedQuantity: new Decimal(20),
                    uomId: 'uom-1',
                },
            ],
        })
        mockPrisma.mmExpectedReceipt.create.mockResolvedValue({
            id: 'er-1',
            documentNumber: 'ER-1',
            status: 'OPEN',
            lines: [],
        })

        const er = await service.createFromPo({ purchaseOrderId: 'po-1' })
        expect(mockPrisma.mmExpectedReceipt.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    sourceType: 'PO',
                    purchaseOrderId: 'po-1',
                    lines: {
                        create: [
                            expect.objectContaining({
                                purchaseOrderLineId: 'pol-1',
                                expectedQuantity: new Decimal(80),
                            }),
                        ],
                    },
                }),
            }),
        )
        expect(er.id).toBe('er-1')
    })

    it('rejects expected receipt from draft PO', async () => {
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            id: 'po-1',
            status: 'DRAFT',
            lines: [],
        })
        await expect(service.createFromPo({ purchaseOrderId: 'po-1' })).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('creates ASN as DRAFT with shipment fields and PO line linkage', async () => {
        mockPrisma.mmAsn.findFirst.mockResolvedValue(null)
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({
            id: 'po-1',
            lines: [{ id: 'pol-1', materialId: 'mat-1', quantity: new Decimal(10), receivedQuantity: new Decimal(0) }],
        })
        mockPrisma.mmAsn.create.mockResolvedValue({
            id: 'asn-1',
            asnNumber: 'ASN-1',
            status: 'DRAFT',
            shipmentNumber: 'SHIP-9',
            lines: [],
        })

        await service.createAsn({
            companyId: 'co-1',
            supplierId: 'sup-1',
            purchaseOrderId: 'po-1',
            warehouseId: 'wh-1',
            shipmentNumber: 'SHIP-9',
            carrier: 'DHL',
            trackingNumber: 'TRK-1',
            lines: [{ materialId: 'mat-1', quantity: 5, uomId: 'uom-1', batchNumber: 'B1' }],
        })

        expect(mockPrisma.mmAsn.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'DRAFT',
                    shipmentNumber: 'SHIP-9',
                    carrier: 'DHL',
                    trackingNumber: 'TRK-1',
                    lines: {
                        create: [
                            expect.objectContaining({
                                purchaseOrderLineId: 'pol-1',
                                batchNumber: 'B1',
                            }),
                        ],
                    },
                }),
            }),
        )
    })

    it('confirmAsn moves DRAFT to CONFIRMED', async () => {
        mockPrisma.mmAsn.findUnique.mockResolvedValue({
            id: 'asn-1',
            status: 'DRAFT',
            lines: [{ id: 'asnl-1' }],
        })
        mockPrisma.mmAsn.update.mockResolvedValue({ id: 'asn-1', status: 'CONFIRMED' })

        const res = await service.confirmAsn('asn-1')
        expect(res.status).toBe('CONFIRMED')
        expect(mockPrisma.mmAsn.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: 'CONFIRMED' } }),
        )
    })

    it('createFromAsn requires CONFIRMED ASN', async () => {
        mockPrisma.mmAsn.findUnique.mockResolvedValue({
            id: 'asn-1',
            status: 'DRAFT',
            lines: [],
        })
        await expect(service.createFromAsn({ asnId: 'asn-1' })).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('createFromAsn builds ER from confirmed ASN', async () => {
        mockPrisma.mmAsn.findUnique.mockResolvedValue({
            id: 'asn-1',
            status: 'CONFIRMED',
            companyId: 'co-1',
            supplierId: 'sup-1',
            purchaseOrderId: 'po-1',
            warehouseId: 'wh-1',
            expectedDate: new Date(),
            lines: [
                {
                    id: 'asnl-1',
                    materialId: 'mat-1',
                    quantity: new Decimal(12),
                    uomId: 'uom-1',
                    purchaseOrderLineId: 'pol-1',
                },
            ],
        })
        mockPrisma.mmExpectedReceipt.findFirst.mockResolvedValue(null)
        mockPrisma.mmExpectedReceipt.create.mockResolvedValue({ id: 'er-asn', documentNumber: 'ER-ASN' })

        await service.createFromAsn({ asnId: 'asn-1' })
        expect(mockPrisma.mmExpectedReceipt.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    sourceType: 'ASN',
                    asnId: 'asn-1',
                    lines: {
                        create: [
                            expect.objectContaining({
                                asnLineId: 'asnl-1',
                                purchaseOrderLineId: 'pol-1',
                                expectedQuantity: new Decimal(12),
                            }),
                        ],
                    },
                }),
            }),
        )
    })
})

describe('ReceivingService variances', () => {
    let service: ReceivingService
    const mockGr: any = { create: jest.fn(), findOne: jest.fn() }

    beforeEach(async () => {
        jest.resetAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReceivingService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: GoodsReceiptService, useValue: mockGr },
            ],
        }).compile()
        service = module.get(ReceivingService)
        mockGr.create.mockResolvedValue({ id: 'gr-draft', documentNumber: 'GR-D', lines: [] })
        mockGr.findOne.mockResolvedValue({ id: 'gr-draft', documentNumber: 'GR-D', lines: [] })
    })

    function erBase(lineOverrides: any = {}) {
        return {
            id: 'er-1',
            status: 'OPEN',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            purchaseOrderId: 'po-1',
            supplierId: 'sup-1',
            purchaseOrder: null,
            lines: [
                {
                    id: 'erl-1',
                    materialId: 'mat-1',
                    expectedQuantity: new Decimal(100),
                    receivedQuantity: new Decimal(0),
                    uomId: 'uom-1',
                    purchaseOrderLineId: 'pol-1',
                    material: {
                        materialCode: 'M1',
                        batchManaged: false,
                        serialManaged: false,
                        qualityInspectionRequired: false,
                    },
                    ...lineOverrides,
                },
            ],
        }
    }

    it('partial receipt flags SHORTAGE', async () => {
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue(erBase())
        await service.receive({
            expectedReceiptId: 'er-1',
            lines: [{ expectedReceiptLineId: 'erl-1', receivedQuantity: 40 }],
        })
        expect(mockGr.create).toHaveBeenCalledWith(
            expect.objectContaining({
                lines: [
                    expect.objectContaining({
                        quantity: 40,
                        shortageQuantity: 60,
                        discrepancyFlag: 'SHORTAGE',
                    }),
                ],
            }),
        )
    })

    it('overage flags OVERAGE', async () => {
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue(erBase())
        await service.receive({
            expectedReceiptId: 'er-1',
            lines: [{ expectedReceiptLineId: 'erl-1', receivedQuantity: 110 }],
        })
        expect(mockGr.create).toHaveBeenCalledWith(
            expect.objectContaining({
                lines: [
                    expect.objectContaining({
                        overageQuantity: 10,
                        discrepancyFlag: 'OVERAGE',
                    }),
                ],
            }),
        )
    })

    it('records REJECTED and DAMAGE flags with rejected qty', async () => {
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue(erBase())
        await service.receive({
            expectedReceiptId: 'er-1',
            lines: [
                {
                    expectedReceiptLineId: 'erl-1',
                    receivedQuantity: 50,
                    damagedQuantity: 5,
                    rejectedQuantity: 3,
                },
            ],
        })
        expect(mockGr.create).toHaveBeenCalledWith(
            expect.objectContaining({
                lines: [
                    expect.objectContaining({
                        damagedQuantity: 5,
                        rejectedQuantity: 3,
                        discrepancyFlag: expect.stringMatching(/DAMAGE/),
                    }),
                ],
            }),
        )
        const flag = mockGr.create.mock.calls[0][0].lines[0].discrepancyFlag as string
        expect(flag).toContain('REJECTED')
        expect(flag).toContain('SHORTAGE')
    })

    it('wrong material still creates GR with WRONG_MATERIAL', async () => {
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue(erBase())
        await service.receive({
            expectedReceiptId: 'er-1',
            lines: [
                {
                    expectedReceiptLineId: 'erl-1',
                    receivedQuantity: 10,
                    materialId: 'mat-other',
                },
            ],
        })
        expect(mockGr.create).toHaveBeenCalledWith(
            expect.objectContaining({
                lines: [
                    expect.objectContaining({
                        discrepancyFlag: expect.stringContaining('WRONG_MATERIAL'),
                        rejectedQuantity: 10,
                    }),
                ],
            }),
        )
    })

    it('batch-managed material requires batch', async () => {
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue(
            erBase({
                material: {
                    materialCode: 'M1',
                    batchManaged: true,
                    serialManaged: false,
                    qualityInspectionRequired: false,
                },
            }),
        )
        await expect(
            service.receive({
                expectedReceiptId: 'er-1',
                lines: [{ expectedReceiptLineId: 'erl-1', receivedQuantity: 5 }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})

describe('QualityInspectionService', () => {
    let service: QualityInspectionService

    beforeEach(async () => {
        jest.resetAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                QualityInspectionService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: InventoryPostingService, useValue: mockPosting },
                { provide: PutawayService, useValue: mockPutaway },
                { provide: EventEmitter2, useValue: mockEvents },
            ],
        }).compile()
        service = module.get(QualityInspectionService)
        mockPosting.postTransaction.mockResolvedValue({})
        mockPutaway.createFromGoodsReceiptLine.mockResolvedValue({})
    })

    it('PASS moves QI stock to UNRESTRICTED and creates putaway', async () => {
        mockPrisma.mmQualityInspection.findUnique.mockResolvedValue({
            id: 'qi-1',
            status: 'PENDING',
            goodsReceiptId: 'gr-1',
            lines: [
                {
                    id: 'qil-1',
                    goodsReceiptLineId: 'grl-1',
                    quantity: new Decimal(10),
                },
            ],
        })
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
            id: 'gr-1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            documentNumber: 'GR-1',
            postingDate: new Date(),
            documentDate: new Date(),
            lines: [
                {
                    id: 'grl-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: new Decimal(5),
                    storageBinId: null,
                    batchId: null,
                    serialNumberId: null,
                    material: {},
                    uom: {},
                },
            ],
        })
        mockPrisma.mmQualityInspectionLine.update.mockResolvedValue({})
        mockPrisma.mmQualityInspection.update.mockResolvedValue({
            id: 'qi-1',
            status: 'COMPLETED',
            result: 'PASS',
        })

        const result = await service.decide('qi-1', {
            inspectedBy: 'qa-1',
            lines: [{ lineId: 'qil-1', passQuantity: 10, failQuantity: 0 }],
        })

        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                stockStatus: 'QUALITY_INSPECTION',
                movementType: 'TRANSFER_OUT',
                quantity: 10,
            }),
        )
        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                stockStatus: 'UNRESTRICTED',
                movementType: 'TRANSFER_IN',
                quantity: 10,
            }),
        )
        expect(mockPutaway.createFromGoodsReceiptLine).toHaveBeenCalled()
        expect(result.result).toBe('PASS')
    })

    it('FAIL moves QI stock to BLOCKED without putaway', async () => {
        mockPrisma.mmQualityInspection.findUnique.mockResolvedValue({
            id: 'qi-1',
            status: 'PENDING',
            goodsReceiptId: 'gr-1',
            lines: [{ id: 'qil-1', goodsReceiptLineId: 'grl-1', quantity: new Decimal(5) }],
        })
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
            id: 'gr-1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            documentNumber: 'GR-1',
            postingDate: new Date(),
            documentDate: new Date(),
            lines: [
                {
                    id: 'grl-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: new Decimal(1),
                    storageBinId: null,
                    batchId: null,
                    serialNumberId: null,
                    material: {},
                    uom: {},
                },
            ],
        })
        mockPrisma.mmQualityInspectionLine.update.mockResolvedValue({})
        mockPrisma.mmQualityInspection.update.mockResolvedValue({
            id: 'qi-1',
            status: 'COMPLETED',
            result: 'FAIL',
        })

        await service.decide('qi-1', {
            lines: [{ lineId: 'qil-1', passQuantity: 0, failQuantity: 5 }],
        })

        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ stockStatus: 'BLOCKED', movementType: 'TRANSFER_IN' }),
        )
        expect(mockPutaway.createFromGoodsReceiptLine).not.toHaveBeenCalled()
    })

    it('PARTIAL_PASS splits pass → UNRESTRICTED and fail → BLOCKED', async () => {
        mockPrisma.mmQualityInspection.findUnique.mockResolvedValue({
            id: 'qi-1',
            status: 'PENDING',
            goodsReceiptId: 'gr-1',
            lines: [{ id: 'qil-1', goodsReceiptLineId: 'grl-1', quantity: new Decimal(10) }],
        })
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue({
            id: 'gr-1',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            documentNumber: 'GR-1',
            postingDate: new Date(),
            documentDate: new Date(),
            lines: [
                {
                    id: 'grl-1',
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    unitCost: new Decimal(2),
                    storageBinId: null,
                    batchId: null,
                    serialNumberId: null,
                    material: {},
                    uom: {},
                },
            ],
        })
        mockPrisma.mmQualityInspectionLine.update.mockResolvedValue({})
        mockPrisma.mmQualityInspection.update.mockResolvedValue({
            id: 'qi-1',
            status: 'COMPLETED',
            result: 'PARTIAL_PASS',
        })

        const result = await service.decide('qi-1', {
            lines: [{ lineId: 'qil-1', passQuantity: 7, failQuantity: 3 }],
        })

        expect(result.result).toBe('PARTIAL_PASS')
        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                stockStatus: 'UNRESTRICTED',
                movementType: 'TRANSFER_IN',
                quantity: 7,
            }),
        )
        expect(mockPosting.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                stockStatus: 'BLOCKED',
                movementType: 'TRANSFER_IN',
                quantity: 3,
            }),
        )
        expect(mockPutaway.createFromGoodsReceiptLine).toHaveBeenCalled()
        expect(mockEvents.emit).toHaveBeenCalledWith(
            'quality.inspection.completed',
            expect.objectContaining({
                result: 'PARTIAL_PASS',
                statusSplit: { unrestrictedQty: 7, blockedQty: 3 },
            }),
        )
    })
})

describe('PutawayService recommendBin', () => {
    let service: PutawayService

    beforeEach(async () => {
        jest.resetAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PutawayService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: InventoryPostingService, useValue: mockPosting },
            ],
        }).compile()
        service = module.get(PutawayService)
    })

    it('prefers bins that already hold the material when capacity allows', async () => {
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            id: 'mat-1',
            weight: null,
            volume: null,
        })
        mockPrisma.wmStorageBin.findMany.mockResolvedValue([
            {
                id: 'bin-empty',
                capacityQuantity: new Decimal(100),
                capacityWeight: new Decimal(0),
                capacityVolume: new Decimal(0),
                storageSection: { storageType: { warehouseId: 'wh-1' } },
            },
            {
                id: 'bin-same',
                capacityQuantity: new Decimal(100),
                capacityWeight: new Decimal(0),
                capacityVolume: new Decimal(0),
                storageSection: { storageType: { warehouseId: 'wh-1' } },
            },
        ])
        mockPrisma.mmInventoryBalance.findMany.mockResolvedValue([
            { storageBinId: 'bin-same', materialId: 'mat-1', quantity: new Decimal(10) },
        ])

        const binId = await service.recommendBin('wh-1', 'mat-1', 5)
        expect(binId).toBe('bin-same')
    })
})
