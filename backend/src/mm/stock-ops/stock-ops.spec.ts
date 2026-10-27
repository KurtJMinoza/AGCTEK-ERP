import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { GoodsReceiptService } from './goods-receipt.service'
import { GoodsReceiptGrIsoService } from './goods-receipt-gr-iso.service'
import { GoodsIssueService } from './goods-issue.service'
import { BinTransferService } from './bin-transfer.service'
import { WarehouseTransferOrderService } from './warehouse-transfer-order.service'
import { AdjustmentService } from './adjustment.service'
import { ReservationService } from '../outbound/reservation.service'
import { AllocationEngineService } from '../inventory/reservation-allocation/allocation-engine.service'
import { ReservationEngineService } from '../inventory/reservation-allocation/reservation-engine.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { QualityInspectionService } from '../inbound/quality-inspection.service'
import { StockTransferOrderService } from '../stock-transfer/stock-transfer-order.service'
import { InspectionLotService } from '../receiving/inspection-lot.service'
import { InspectionLotLifecycleService } from '../quality/inspection-lot-lifecycle.service'
import { InspectionRequirementService } from '../receiving/inspection-requirement.service'
import { MmPostingPeriodGuard } from '../integration/fico/mm-posting-period.guard'

let seq = 0
function nextId() { return `id-${++seq}` }

function makeDoc(overrides: any = {}) {
    return {
        id: nextId(),
        documentNumber: `DOC-${seq}`,
        companyId: 'co-1',
        warehouseId: 'wh-1',
        postingDate: new Date(),
        documentDate: new Date(),
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        stockStatus: 'UNRESTRICTED',
        remarks: null,
        createdBy: null,
        lines: [],
        warehouse: { id: 'wh-1', name: 'Main' },
        ...overrides,
    }
}

function makeGrLine(overrides: any = {}) {
    return {
        id: nextId(),
        receiptId: 'gr-1',
        materialId: 'mat-1',
        quantity: new Decimal(100),
        uomId: 'uom-1',
        storageBinId: null,
        batchId: null,
        serialNumberId: null,
        unitCost: new Decimal(10),
        totalCost: new Decimal(1000),
        remarks: null,
        material: { id: 'mat-1', name: 'Widget' },
        uom: { id: 'uom-1', code: 'EA' },
        storageBin: null,
        ...overrides,
    }
}

const mockPrisma: any = {
    mmGoodsReceipt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmGoodsIssue: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmBinTransfer: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmWarehouseTransferOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmWarehouseTransferOrderLine: {
        update: jest.fn(),
    },
    mmInventoryAdjustment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    mmInventoryTransaction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
    },
    mmAccountingEvent: {
        create: jest.fn(),
    },
    mmMaterial: {
        findUnique: jest.fn(),
    },
    mmInventoryReservation: {
        findUnique: jest.fn(),
    },
    wmPackage: {
        findUnique: jest.fn(),
    },
    wmPickingTask: {
        findUnique: jest.fn(),
    },
    mmExpectedReceiptLine: {
        updateMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
    },
    mmExpectedReceipt: {
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    mmQualityInspection: {
        updateMany: jest.fn(),
    },
    wmPutawayTask: {
        updateMany: jest.fn(),
    },
    wmStorageBin: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
}

const mockPostingService: any = {
    postTransaction: jest.fn().mockResolvedValue({ id: 'txn-1', transactionNumber: 'TXN-1' }),
    reverseTransaction: jest.fn().mockResolvedValue({ id: 'txn-rev-1', transactionNumber: 'TXN-REV-1' }),
}

const mockEvents = { emit: jest.fn() }
const mockReservations: any = {
    fulfill: jest.fn(),
    restoreAfterReversal: jest.fn(),
}
const mockPutaway: any = {
    createFromGoodsReceiptLine: jest.fn(),
}
const mockQi: any = {
    createFromGoodsReceipt: jest.fn(),
}

let grService: GoodsReceiptService
let giService: GoodsIssueService
let btService: BinTransferService
let wtoService: WarehouseTransferOrderService
let adjService: AdjustmentService
let mockDomainEvents: {
    goodsReceiptPosted: jest.Mock
    goodsReceiptReversed: jest.Mock
    goodsIssuePosted: jest.Mock
    goodsIssueReversed: jest.Mock
    inventoryAdjusted: jest.Mock
    inventoryTransferred: jest.Mock
}

beforeEach(async () => {
    seq = 0
    jest.clearAllMocks()

    mockDomainEvents = {
        goodsReceiptPosted: jest.fn(),
        goodsReceiptReversed: jest.fn(),
        goodsIssuePosted: jest.fn(),
        goodsIssueReversed: jest.fn(),
        inventoryAdjusted: jest.fn(),
        inventoryTransferred: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            GoodsReceiptService,
            GoodsIssueService,
            BinTransferService,
            WarehouseTransferOrderService,
            AdjustmentService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: InventoryPostingService, useValue: mockPostingService },
            { provide: EventEmitter2, useValue: mockEvents },
            { provide: ReservationService, useValue: mockReservations },
            { provide: PutawayService, useValue: mockPutaway },
            { provide: QualityInspectionService, useValue: mockQi },
            { provide: MmDomainEventsService, useValue: mockDomainEvents },
            { provide: AllocationEngineService, useValue: { recordIssue: jest.fn() } },
            { provide: ReservationEngineService, useValue: { recordIssue: jest.fn() } },
            {
                provide: InspectionLotService,
                useValue: {
                    createFromGoodsReceipt: jest.fn(),
                    cancelForGoodsReceipt: jest.fn(),
                },
            },
            {
                provide: InspectionLotLifecycleService,
                useValue: {
                    cancelOpenLotsForGr: jest.fn(),
                },
            },
            {
                provide: InspectionRequirementService,
                useValue: {
                    isInspectionRequired: jest.fn().mockResolvedValue(false),
                    resolveInspectionRequirement: jest.fn().mockResolvedValue({
                        action: 'NO_INSPECTION',
                        inspectionRequired: false,
                    }),
                },
            },
            {
                provide: MmPostingPeriodGuard,
                useValue: { assertCanPost: jest.fn().mockResolvedValue(undefined) },
            },
            {
                provide: StockTransferOrderService,
                useValue: {
                    create: jest.fn().mockResolvedValue({ id: 'sto-bridge-1' }),
                    approve: jest.fn(),
                    allocate: jest.fn(),
                    dispatch: jest.fn(),
                    cancel: jest.fn(),
                },
            },
            {
                provide: InspectionLotLifecycleService,
                useValue: {
                    cancelOpenLotsForGr: jest.fn().mockResolvedValue(0),
                    start: jest.fn(),
                    complete: jest.fn(),
                },
            },
            {
                provide: ReservationEngineService,
                useValue: {
                    fulfillReservationLine: jest.fn(),
                    restoreReservationLine: jest.fn(),
                    createReservation: jest.fn(),
                    fulfill: jest.fn(),
                },
            },
            {
                provide: MmPostingPeriodGuard,
                useValue: {
                    assertCanPost: jest.fn().mockResolvedValue(undefined),
                },
            },
            {
                provide: GoodsReceiptGrIsoService,
                useValue: {
                    writeAudit: jest.fn(),
                    syncVariancesAndHoldsFromPostedGr: jest.fn(),
                },
            },
        ],
    }).compile()

    grService = module.get(GoodsReceiptService)
    giService = module.get(GoodsIssueService)
    btService = module.get(BinTransferService)
    wtoService = module.get(WarehouseTransferOrderService)
    adjService = module.get(AdjustmentService)
})

/* ────────── Goods Receipt ────────── */

describe('GoodsReceiptService', () => {
    it('post without VERIFIED status is rejected', async () => {
        const grLine = makeGrLine()
        const doc = makeDoc({ id: 'gr-draft', status: 'DRAFT', lines: [grLine] })
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(doc)
        await expect(grService.post('gr-draft')).rejects.toThrow('VERIFIED')
    })

    it('create + post: DRAFT -> POSTED, ledger RECEIPT created, balance incremented', async () => {
        const grLine = makeGrLine()
        const doc = makeDoc({ id: 'gr-1', status: 'VERIFIED', lines: [grLine] })

        mockPrisma.mmGoodsReceipt.findFirst.mockResolvedValue(null)
        mockPrisma.mmGoodsReceipt.create.mockResolvedValue(doc)
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(doc)
        mockPrisma.mmGoodsReceipt.update.mockResolvedValue({ ...doc, status: 'POSTED' })
        mockPrisma.wmStorageBin.findFirst.mockResolvedValue({ id: 'bin-recv' })

        const posted = await grService.post('gr-1')

        expect(posted.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledTimes(1)
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'RECEIPT',
                sourceDocumentType: 'GOODS_RECEIPT',
                sourceModule: 'STOCK_OPS',
            }),
        )
        expect(mockDomainEvents.goodsReceiptPosted).toHaveBeenCalled()
    })

    it('a receipt line without a storage bin lands in the warehouse receiving bin (pickable, not warehouse limbo)', async () => {
        const grLine = makeGrLine({ storageBinId: null })
        const doc = makeDoc({ id: 'gr-1b', status: 'VERIFIED', lines: [grLine] })

        mockPrisma.mmGoodsReceipt.findFirst.mockResolvedValue(null)
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(doc)
        mockPrisma.mmGoodsReceipt.update.mockResolvedValue({ ...doc, status: 'POSTED' })
        mockPrisma.wmStorageBin.findFirst.mockResolvedValue({ id: 'bin-recv' })

        await grService.post('gr-1b')

        expect(mockPrisma.wmStorageBin.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: 'ACTIVE',
                    storageSection: {
                        storageType: {
                            warehouseId: 'wh-1',
                            receivingAllowed: true,
                        },
                    },
                }),
            }),
        )
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'RECEIPT',
                storageBinId: 'bin-recv',
            }),
        )
    })

    it('a receipt line carries its scanned storage bin when one is given', async () => {
        const grLine = makeGrLine({ storageBinId: 'bin-scan' })
        const doc = makeDoc({ id: 'gr-1c', status: 'VERIFIED', lines: [grLine] })

        mockPrisma.mmGoodsReceipt.findFirst.mockResolvedValue(null)
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(doc)
        mockPrisma.mmGoodsReceipt.update.mockResolvedValue({ ...doc, status: 'POSTED' })

        await grService.post('gr-1c')

        expect(mockPrisma.wmStorageBin.findFirst).not.toHaveBeenCalled()
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'RECEIPT',
                storageBinId: 'bin-scan',
            }),
        )
    })

    it('reverse: POSTED -> REVERSED, ledger + ER + QI + accounting', async () => {
        const grLine = makeGrLine({
            expectedReceiptLineId: 'erl-1',
            purchaseOrderLineId: 'pol-1',
            quantity: new Decimal(50),
            damagedQuantity: new Decimal(0),
            rejectedQuantity: new Decimal(0),
        })
        const doc = makeDoc({
            id: 'gr-2',
            status: 'POSTED',
            purchaseOrderId: 'po-1',
            expectedReceiptId: 'er-1',
            lines: [grLine],
        })
        const ledgerTxn = { id: 'txn-100', transactionNumber: 'TXN-100' }

        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryTransaction.findMany.mockResolvedValue([ledgerTxn])
        mockPrisma.mmInventoryTransaction.findFirst.mockResolvedValue(null)
        mockPrisma.mmPurchaseOrderLine = {
            findUnique: jest.fn().mockResolvedValue({
                id: 'pol-1',
                receivedQuantity: new Decimal(50),
                quantity: new Decimal(100),
            }),
            update: jest.fn(),
        }
        mockPrisma.mmPurchaseOrder = {
            findUnique: jest.fn().mockResolvedValue({
                id: 'po-1',
                lines: [{ receivedQuantity: new Decimal(0), quantity: new Decimal(100) }],
            }),
            update: jest.fn(),
        }
        mockPrisma.mmExpectedReceiptLine.findUnique.mockResolvedValue({
            id: 'erl-1',
            receivedQuantity: new Decimal(50),
            damagedQuantity: new Decimal(0),
            rejectedQuantity: new Decimal(0),
            expectedQuantity: new Decimal(100),
        })
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue({
            id: 'er-1',
            lines: [{ receivedQuantity: new Decimal(0) }],
        })
        mockPrisma.mmAccountingEvent.create.mockResolvedValue({})
        mockPrisma.mmGoodsReceipt.update.mockResolvedValue({ ...doc, status: 'REVERSED' })

        const reversed = await grService.reverse('gr-2')

        expect(reversed.status).toBe('REVERSED')
        expect(mockPostingService.reverseTransaction).toHaveBeenCalledWith('txn-100', expect.anything())
        expect(mockPrisma.mmExpectedReceiptLine.update).toHaveBeenCalled()
        expect(mockPrisma.mmQualityInspection.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ goodsReceiptId: 'gr-2', status: 'PENDING' }),
                data: { status: 'CANCELLED' },
            }),
        )
        expect(mockDomainEvents.goodsReceiptReversed).toHaveBeenCalledWith(
            expect.objectContaining({ goodsReceiptId: 'gr-2' }),
        )
    })
})

/* ────────── Goods Issue ────────── */

describe('GoodsIssueService', () => {
    it('create + post: DRAFT -> POSTED, ledger ISSUE, balance decremented', async () => {
        const giLine = makeGrLine({ issueId: 'gi-1', storageBinId: 'bin-1' })
        const doc = makeDoc({
            id: 'gi-1',
            status: 'DRAFT',
            lines: [giLine],
            reservationId: null,
            packageId: null,
            issuePurpose: 'INTERNAL',
            supervisorVerifiedAt: new Date(),
            supervisorVerifiedBy: 'Supervisor',
            verifiedSourceReference: 'DOC-1',
        })

        mockPrisma.mmGoodsIssue.findFirst.mockResolvedValue(null)
        mockPrisma.mmGoodsIssue.findUnique.mockResolvedValue(doc)
        mockPrisma.mmGoodsIssue.update.mockResolvedValue({ ...doc, status: 'POSTED' })
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ batchManaged: false, serialManaged: false })
        mockPrisma.mmAccountingEvent.create.mockResolvedValue({})

        const posted = await giService.post('gi-1')

        expect(posted.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'ISSUE', sourceDocumentType: 'GOODS_ISSUE' }),
        )
        expect(mockDomainEvents.goodsIssuePosted).toHaveBeenCalled()
    })

    it('post without supervisor verification is rejected', async () => {
        const giLine = makeGrLine({ issueId: 'gi-x', storageBinId: 'bin-1' })
        const doc = makeDoc({
            id: 'gi-x',
            status: 'DRAFT',
            lines: [giLine],
            reservationId: null,
            packageId: null,
            supervisorVerifiedAt: null,
        })
        mockPrisma.mmGoodsIssue.findUnique.mockResolvedValue(doc)
        await expect(giService.post('gi-x')).rejects.toThrow(
            'Supervisor verification required',
        )
    })

    it('GI insufficient stock: rejects when posting service throws', async () => {
        const giLine = makeGrLine({ issueId: 'gi-2', storageBinId: 'bin-1' })
        const doc = makeDoc({
            id: 'gi-2',
            status: 'DRAFT',
            lines: [giLine],
            reservationId: null,
            packageId: null,
            supervisorVerifiedAt: new Date(),
        })

        mockPrisma.mmGoodsIssue.findUnique.mockResolvedValue(doc)
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ batchManaged: false, serialManaged: false })
        mockPostingService.postTransaction.mockRejectedValueOnce(
            new BadRequestException('Insufficient stock'),
        )

        await expect(giService.post('gi-2')).rejects.toThrow('Insufficient stock')
    })

    it('createFromPackage: released package is a valid SALES source (SCM trip start)', async () => {
        mockPrisma.wmPackage.findUnique.mockResolvedValue({
            id: 'pkg-1',
            status: 'READY_FOR_DISPATCH',
            warehouseId: 'wh-1',
            companyId: 'co-1',
            reservationId: 'res-1',
            packingListNumber: 'PL-20260101-00001',
            orderNumber: 'SO-100',
            pickingTaskId: null,
            pickingTask: { sourceBinId: 'bin-1', status: 'COMPLETED' },
            items: [
                {
                    materialId: 'mat-1',
                    scannedQty: new Decimal(5),
                    expectedQty: new Decimal(5),
                    batchId: null,
                    serialId: null,
                },
            ],
        })
        mockPrisma.mmInventoryReservation.findUnique.mockResolvedValue({
            id: 'res-1',
            status: 'OPEN',
            quantity: new Decimal(10),
            fulfilledQuantity: new Decimal(0),
        })
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({
            id: 'mat-1',
            baseUomId: 'uom-1',
            batchManaged: false,
            serialManaged: false,
        })
        mockPrisma.mmGoodsIssue.findFirst.mockResolvedValue(null)
        mockPrisma.mmGoodsIssue.create.mockResolvedValue({ id: 'gi-pkg', status: 'DRAFT' })

        await expect(
            giService.createFromPackage('pkg-1', {
                companyId: 'co-1',
                postingDate: '2026-01-01',
                documentDate: '2026-01-01',
            }),
        ).resolves.toMatchObject({ id: 'gi-pkg', status: 'DRAFT' })
        expect(mockPrisma.mmGoodsIssue.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    issuePurpose: 'SALES',
                    sourceDocumentType: 'PACKAGE',
                    packageId: 'pkg-1',
                }),
            }),
        )
    })

    it('reverse goods issue: stock restored', async () => {
        const giLine = makeGrLine({ storageBinId: 'bin-1' })
        const doc = makeDoc({ id: 'gi-3', status: 'POSTED', lines: [giLine], reservationId: null })
        const ledgerTxn = { id: 'txn-200', quantity: new Decimal(100) }

        mockPrisma.mmGoodsIssue.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryTransaction.findMany.mockResolvedValue([ledgerTxn])
        mockPrisma.mmGoodsIssue.update.mockResolvedValue({ ...doc, status: 'REVERSED' })
        mockPrisma.mmAccountingEvent.create.mockResolvedValue({})

        const reversed = await giService.reverse('gi-3')

        expect(reversed.status).toBe('REVERSED')
        expect(mockPostingService.reverseTransaction).toHaveBeenCalledWith('txn-200', expect.anything())
    })
})

/* ────────── Bin Transfer ────────── */

describe('BinTransferService', () => {
    it('post: TRANSFER_OUT + TRANSFER_IN pair, source decremented, dest incremented', async () => {
        const btLine = {
            id: 'btl-1',
            materialId: 'mat-1',
            quantity: new Decimal(50),
            uomId: 'uom-1',
            sourceBinId: 'bin-1',
            destinationBinId: 'bin-2',
            batchId: null,
            serialNumberId: null,
            material: { id: 'mat-1', name: 'Widget' },
            uom: { id: 'uom-1', code: 'EA' },
            sourceBin: { id: 'bin-1', code: 'A01' },
            destinationBin: { id: 'bin-2', code: 'B01' },
        }
        const doc = makeDoc({ id: 'bt-1', status: 'DRAFT', lines: [btLine] })

        mockPrisma.mmBinTransfer.findFirst.mockResolvedValue(null)
        mockPrisma.mmBinTransfer.findUnique.mockResolvedValue(doc)
        mockPrisma.mmBinTransfer.update.mockResolvedValue({ ...doc, status: 'POSTED' })

        const posted = await btService.post('bt-1')

        expect(posted.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledTimes(2)
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'TRANSFER_OUT', storageBinId: 'bin-1' }),
        )
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'TRANSFER_IN', storageBinId: 'bin-2' }),
        )
    })

    it('supports a null source bin: warehouse-level (unassigned) stock moves into the destination bin', async () => {
        const btLine = {
            id: 'btl-2',
            materialId: 'mat-1',
            quantity: new Decimal(90),
            uomId: 'uom-1',
            sourceBinId: null,
            destinationBinId: 'bin-2',
            batchId: null,
            serialNumberId: null,
            material: { id: 'mat-1', name: 'Widget' },
            uom: { id: 'uom-1', code: 'EA' },
            sourceBin: null,
            destinationBin: { id: 'bin-2', code: 'B01' },
        }
        const doc = makeDoc({ id: 'bt-2', status: 'DRAFT', lines: [btLine] })

        mockPrisma.mmBinTransfer.findFirst.mockResolvedValue(null)
        mockPrisma.mmBinTransfer.findUnique.mockResolvedValue(doc)
        mockPrisma.mmBinTransfer.update.mockResolvedValue({ ...doc, status: 'POSTED' })

        const posted = await btService.post('bt-2')

        expect(posted.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_OUT',
                storageBinId: undefined,
            }),
        )
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_IN',
                storageBinId: 'bin-2',
            }),
        )
    })

    it('create: an omitted source bin is stored as null', async () => {
        mockPrisma.mmBinTransfer.findFirst.mockResolvedValue(null)
        mockPrisma.mmBinTransfer.create.mockImplementation((args: {
            data: Record<string, unknown>
        }) => Promise.resolve({ id: 'bt-3', ...args.data }))

        await btService.create({
            companyId: 'co-1',
            warehouseId: 'wh-1',
            postingDate: new Date().toISOString(),
            lines: [
                {
                    materialId: 'mat-1',
                    quantity: 5,
                    uomId: 'uom-1',
                    destinationBinId: 'bin-2',
                },
            ],
        })

        expect(mockPrisma.mmBinTransfer.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    lines: {
                        create: [
                            expect.objectContaining({ sourceBinId: null }),
                        ],
                    },
                }),
            }),
        )
    })
})

/* ────────── Warehouse Transfer Order ────────── */

describe('WarehouseTransferOrderService', () => {
    it('full lifecycle: DRAFT -> APPROVED -> PICKED -> IN_TRANSIT -> COMPLETED', async () => {
        const wtoLine = {
            id: 'wtol-1',
            materialId: 'mat-1',
            quantity: new Decimal(100),
            uomId: 'uom-1',
            sourceBinId: null,
            destinationBinId: null,
            batchId: null,
            serialNumberId: null,
            dispatchedQty: new Decimal(0),
            receivedQty: new Decimal(0),
            status: 'PENDING',
            material: { id: 'mat-1', name: 'Widget' },
            uom: { id: 'uom-1', code: 'EA' },
            sourceBin: null,
            destinationBin: null,
        }
        const baseTx = {
            id: 'wto-1',
            documentNumber: 'WTO-1',
            companyId: 'co-1',
            sourceWarehouseId: 'wh-1',
            destinationWarehouseId: 'wh-2',
            postingDate: new Date(),
            requestedBy: null,
            approvedBy: null,
            dispatchedAt: null,
            receivedAt: null,
            notes: null,
            legacyStoId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceWarehouse: { id: 'wh-1', name: 'Source' },
            destinationWarehouse: { id: 'wh-2', name: 'Dest' },
        }

        mockPrisma.mmWarehouseTransferOrder.findUnique
            .mockResolvedValueOnce({ ...baseTx, status: 'DRAFT', lines: [wtoLine] })
            .mockResolvedValueOnce({ ...baseTx, status: 'APPROVED', lines: [wtoLine] })
            .mockResolvedValueOnce({ ...baseTx, status: 'PICKED', lines: [wtoLine] })
            .mockResolvedValue({
                ...baseTx,
                status: 'IN_TRANSIT',
                lines: [{ ...wtoLine, dispatchedQty: new Decimal(100), receivedQty: new Decimal(0) }],
            })

        mockPrisma.mmWarehouseTransferOrder.update
            .mockResolvedValueOnce({ ...baseTx, status: 'APPROVED', lines: [wtoLine] })
            .mockResolvedValueOnce({ ...baseTx, status: 'PICKED', lines: [wtoLine] })
            .mockResolvedValueOnce({ ...baseTx, status: 'IN_TRANSIT', lines: [wtoLine] })
            .mockResolvedValue({ ...baseTx, status: 'COMPLETED', lines: [wtoLine] })

        mockPrisma.mmWarehouseTransferOrderLine.update.mockResolvedValue({
            ...wtoLine,
            dispatchedQty: new Decimal(100),
            receivedQty: new Decimal(100),
            status: 'RECEIVED',
        })
        mockPrisma.mmWarehouseTransferOrderLine.findMany = jest
            .fn()
            .mockResolvedValue([
                { ...wtoLine, dispatchedQty: new Decimal(100), receivedQty: new Decimal(100) },
            ])

        const approved = await wtoService.approve('wto-1')
        expect(approved.status).toBe('APPROVED')

        const picked = await wtoService.pick('wto-1')
        expect(picked.status).toBe('PICKED')

        const dispatched = await wtoService.dispatch('wto-1')
        expect(dispatched.status).toBe('IN_TRANSIT')
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_OUT',
                warehouseId: 'wh-1',
                stockStatus: 'UNRESTRICTED',
            }),
        )
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_IN',
                warehouseId: 'wh-2',
                stockStatus: 'IN_TRANSIT',
            }),
        )

        mockPostingService.postTransaction.mockClear()
        const completed = await wtoService.complete('wto-1')
        expect(completed.status).toBe('COMPLETED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_OUT',
                stockStatus: 'IN_TRANSIT',
            }),
        )
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_IN',
                stockStatus: 'UNRESTRICTED',
            }),
        )
    })

    it('cancel from DRAFT: no ledger impact', async () => {
        const doc = {
            id: 'wto-c',
            status: 'DRAFT',
            lines: [],
            legacyStoId: null,
            sourceWarehouse: { id: 'wh-1', name: 'S' },
            destinationWarehouse: { id: 'wh-2', name: 'D' },
        }
        mockPrisma.mmWarehouseTransferOrder.findUnique.mockResolvedValue(doc)
        mockPrisma.mmWarehouseTransferOrder.update.mockResolvedValue({ ...doc, status: 'CANCELLED' })

        const cancelled = await wtoService.cancel('wto-c')
        expect(cancelled.status).toBe('CANCELLED')
        expect(mockPostingService.postTransaction).not.toHaveBeenCalled()
    })

    it('create dual-writes canonical STO via bridge', async () => {
        mockPrisma.mmWarehouseTransferOrder.findFirst.mockResolvedValue(null)
        mockPrisma.mmWarehouseTransferOrder.create.mockResolvedValue({
            id: 'wto-new',
            documentNumber: 'WTO-NEW',
            status: 'DRAFT',
            legacyStoId: 'sto-bridge-1',
            lines: [],
        })
        const created = await wtoService.create({
            companyId: 'co-1',
            sourceWarehouseId: 'wh-1',
            destinationWarehouseId: 'wh-2',
            postingDate: new Date().toISOString(),
            lines: [{ materialId: 'mat-1', quantity: 5, uomId: 'uom-1' }],
        } as any)
        expect(created.legacyStoId).toBe('sto-bridge-1')
        expect((wtoService as any).sto.create).toHaveBeenCalled()
    })
})

/* ────────── Adjustment ────────── */

describe('AdjustmentService', () => {
    it('submit (below threshold): immediate POSTED', async () => {
        const adjLine = {
            id: 'al-1',
            materialId: 'mat-1',
            quantity: new Decimal(5),
            uomId: 'uom-1',
            storageBinId: null,
            batchId: null,
            serialNumberId: null,
            unitCost: new Decimal(10),
            remarks: null,
            material: { id: 'mat-1', name: 'Widget' },
            uom: { id: 'uom-1', code: 'EA' },
            storageBin: null,
        }
        const doc = makeDoc({
            id: 'adj-1',
            status: 'DRAFT',
            adjustmentReason: 'COUNT_VARIANCE',
            approvalThreshold: new Decimal(10000),
            lines: [adjLine],
        })

        mockPrisma.mmInventoryAdjustment.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryAdjustment.update.mockResolvedValue({ ...doc, status: 'POSTED' })

        const posted = await adjService.submit('adj-1')

        expect(posted.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'ADJUSTMENT_IN', sourceDocumentType: 'ADJUSTMENT' }),
        )
    })

    it('submit (above threshold): PENDING_APPROVAL, then approve -> POSTED', async () => {
        const adjLine = {
            id: 'al-2',
            materialId: 'mat-1',
            quantity: new Decimal(500),
            uomId: 'uom-1',
            storageBinId: null,
            batchId: null,
            serialNumberId: null,
            unitCost: new Decimal(100),
            remarks: null,
            material: { id: 'mat-1', name: 'Widget' },
            uom: { id: 'uom-1', code: 'EA' },
            storageBin: null,
        }
        const doc = makeDoc({
            id: 'adj-2',
            status: 'DRAFT',
            adjustmentReason: 'DAMAGE',
            approvalThreshold: new Decimal(10000),
            lines: [adjLine],
        })

        mockPrisma.mmInventoryAdjustment.findUnique
            .mockResolvedValueOnce(doc)
            .mockResolvedValueOnce({ ...doc, status: 'PENDING_APPROVAL' })

        mockPrisma.mmInventoryAdjustment.update
            .mockResolvedValueOnce({ ...doc, status: 'PENDING_APPROVAL' })
            .mockResolvedValueOnce({ ...doc, status: 'POSTED' })

        const pending = await adjService.submit('adj-2')
        expect(pending.status).toBe('PENDING_APPROVAL')
        expect(mockPostingService.postTransaction).not.toHaveBeenCalled()

        const approved = await adjService.approve('adj-2', 'admin')
        expect(approved.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledTimes(1)
    })

    it('submit count-sourced below threshold: COUNT_GAIN / COUNT_LOSS', async () => {
        const adjLine = {
            id: 'al-cnt',
            materialId: 'mat-1',
            quantity: new Decimal(-3),
            uomId: 'uom-1',
            storageBinId: 'bin-1',
            batchId: null,
            serialNumberId: null,
            unitCost: new Decimal(10),
            remarks: null,
            material: { id: 'mat-1', name: 'Widget' },
            uom: { id: 'uom-1', code: 'EA' },
            storageBin: null,
        }
        const doc = makeDoc({
            id: 'adj-cnt-post',
            status: 'DRAFT',
            sourceCountId: 'cnt-1',
            adjustmentReason: 'COUNT_VARIANCE',
            approvalThreshold: new Decimal(10000),
            lines: [adjLine],
        })

        mockPrisma.mmInventoryAdjustment.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryAdjustment.update.mockResolvedValue({
            ...doc,
            status: 'POSTED',
        })
        mockPrisma.mmAccountingEvent.create.mockResolvedValue({})

        const posted = await adjService.submit('adj-cnt-post')

        expect(posted.status).toBe('POSTED')
        expect(mockPostingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'COUNT_LOSS',
                sourceDocumentType: 'INVENTORY_COUNT_ADJUSTMENT',
            }),
        )
    })

    it('reject: PENDING_APPROVAL -> REJECTED', async () => {
        const doc = makeDoc({
            id: 'adj-3',
            status: 'PENDING_APPROVAL',
            adjustmentReason: 'LOSS',
            approvalThreshold: new Decimal(10000),
            lines: [],
        })

        mockPrisma.mmInventoryAdjustment.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryAdjustment.update.mockResolvedValue({ ...doc, status: 'REJECTED', rejectionReason: 'Not justified' })

        const rejected = await adjService.reject('adj-3', 'Not justified')

        expect(rejected.status).toBe('REJECTED')
        expect(mockPostingService.postTransaction).not.toHaveBeenCalled()
    })

    it('reverse count adjustment: matches INVENTORY_COUNT_ADJUSTMENT source docs', async () => {
        const doc = makeDoc({
            id: 'adj-count-1',
            status: 'POSTED',
            sourceCountId: 'cnt-1',
            documentNumber: 'ADJ-CNT-1',
            lines: [],
        })
        mockPrisma.mmInventoryAdjustment.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryTransaction.findMany.mockResolvedValue([
            { id: 'txn-cnt-1', sourceDocumentType: 'INVENTORY_COUNT_ADJUSTMENT' },
        ])
        mockPrisma.mmInventoryAdjustment.update.mockResolvedValue({
            ...doc,
            status: 'REVERSED',
        })

        const reversed = await adjService.reverse('adj-count-1', 'user')

        expect(mockPrisma.mmInventoryTransaction.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    sourceDocumentId: 'adj-count-1',
                    sourceDocumentType: {
                        in: ['ADJUSTMENT', 'INVENTORY_COUNT_ADJUSTMENT'],
                    },
                }),
            }),
        )
        expect(mockPostingService.reverseTransaction).toHaveBeenCalledWith(
            'txn-cnt-1',
            expect.anything(),
        )
        expect(reversed.status).toBe('REVERSED')
    })

    it('cancel from DRAFT: no ledger impact', async () => {
        const doc = makeDoc({ id: 'adj-4', status: 'DRAFT', lines: [] })

        mockPrisma.mmInventoryAdjustment.findUnique.mockResolvedValue(doc)
        mockPrisma.mmInventoryAdjustment.update.mockResolvedValue({ ...doc, status: 'CANCELLED' })

        const cancelled = await adjService.cancel('adj-4')

        expect(cancelled.status).toBe('CANCELLED')
        expect(mockPostingService.postTransaction).not.toHaveBeenCalled()
    })
})
