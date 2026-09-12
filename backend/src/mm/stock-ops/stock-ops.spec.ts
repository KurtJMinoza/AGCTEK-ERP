import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'
import { GoodsReceiptService } from './goods-receipt.service'
import { GoodsIssueService } from './goods-issue.service'
import { BinTransferService } from './bin-transfer.service'
import { WarehouseTransferOrderService } from './warehouse-transfer-order.service'
import { AdjustmentService } from './adjustment.service'
import { ReservationService } from '../outbound/reservation.service'
import { AllocationEngineService } from '../inventory/reservation-allocation/allocation-engine.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { QualityInspectionService } from '../inbound/quality-inspection.service'
import { StockTransferOrderService } from '../stock-transfer/stock-transfer-order.service'
import { InspectionLotService } from '../receiving/inspection-lot.service'
import { InspectionRequirementService } from '../receiving/inspection-requirement.service'

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
    goodsIssuePosted: jest.Mock
    inventoryAdjusted: jest.Mock
}

beforeEach(async () => {
    seq = 0
    jest.clearAllMocks()

    mockDomainEvents = {
        goodsReceiptPosted: jest.fn(),
        goodsIssuePosted: jest.fn(),
        inventoryAdjusted: jest.fn(),
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
            {
                provide: InspectionLotService,
                useValue: {
                    createFromGoodsReceipt: jest.fn(),
                    cancelForGoodsReceipt: jest.fn(),
                },
            },
            {
                provide: InspectionRequirementService,
                useValue: { isInspectionRequired: jest.fn().mockResolvedValue(false) },
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
    it('create + post: DRAFT -> POSTED, ledger RECEIPT created, balance incremented', async () => {
        const grLine = makeGrLine()
        const doc = makeDoc({ id: 'gr-1', status: 'DRAFT', lines: [grLine] })

        mockPrisma.mmGoodsReceipt.findFirst.mockResolvedValue(null)
        mockPrisma.mmGoodsReceipt.create.mockResolvedValue(doc)
        mockPrisma.mmGoodsReceipt.findUnique.mockResolvedValue(doc)
        mockPrisma.mmGoodsReceipt.update.mockResolvedValue({ ...doc, status: 'POSTED' })

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
        expect(mockPrisma.mmAccountingEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ eventType: 'GOODS_RECEIPT_REVERSED' }),
            }),
        )
        expect(mockEvents.emit).toHaveBeenCalledWith(
            'accounting.entry.requested',
            expect.objectContaining({ eventType: 'GOODS_RECEIPT_REVERSED' }),
        )
    })
})

/* ────────── Goods Issue ────────── */

describe('GoodsIssueService', () => {
    it('create + post: DRAFT -> POSTED, ledger ISSUE, balance decremented', async () => {
        const giLine = makeGrLine({ issueId: 'gi-1', storageBinId: 'bin-1' })
        const doc = makeDoc({ id: 'gi-1', status: 'DRAFT', lines: [giLine], reservationId: null, packageId: null, issuePurpose: 'INTERNAL' })

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

    it('GI insufficient stock: rejects when posting service throws', async () => {
        const giLine = makeGrLine({ issueId: 'gi-2', storageBinId: 'bin-1' })
        const doc = makeDoc({ id: 'gi-2', status: 'DRAFT', lines: [giLine], reservationId: null, packageId: null })

        mockPrisma.mmGoodsIssue.findUnique.mockResolvedValue(doc)
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ batchManaged: false, serialManaged: false })
        mockPostingService.postTransaction.mockRejectedValueOnce(
            new BadRequestException('Insufficient stock'),
        )

        await expect(giService.post('gi-2')).rejects.toThrow('Insufficient stock')
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
