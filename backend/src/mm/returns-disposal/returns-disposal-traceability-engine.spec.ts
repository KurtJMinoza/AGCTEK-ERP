/**
 * Phase 8: Returns, Disposal, Traceability engine scenarios
 */
import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { SupplierReturnService } from './supplier-return.service'
import { DisposalService } from './disposal.service'
import { CustomerReturnService } from './customer-return.service'
import { DamagedExpiredQueryService } from './damaged-expired-query.service'
import { ReturnsDisposalConfigService } from './returns-disposal-config.service'
import { ExpiryControlService } from './expiry-control.service'
import { TraceabilityService } from '../traceability/traceability.service'
import { FefoAllocationStrategy } from '../inventory/reservation-allocation/strategies/fefo-allocation.strategy'
import { Decimal as Dec } from '@prisma/client/runtime/library'

function mockPrisma() {
    return {
        mmReturnsDisposalConfig: { findUnique: jest.fn(), upsert: jest.fn() },
        mmSupplierReturn: {
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmSupplierReturnLine: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
            update: jest.fn(),
        },
        mmSupplierReturnAudit: { create: jest.fn() },
        mmDisposal: {
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmDisposalLine: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
        mmDisposalAudit: { create: jest.fn() },
        mmScrapTransaction: { upsert: jest.fn().mockResolvedValue({ id: 'scrap-1' }) },
        mmCustomerReturn: {
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
        },
        mmCustomerReturnLine: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
        },
        mmCustomerReturnAudit: { create: jest.fn() },
        mmCustomerReturnIntake: { upsert: jest.fn().mockResolvedValue({}) },
        mmReturnInspection: {
            create: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        mmReturnDisposition: {
            create: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        mmInventoryTransaction: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            findFirst: jest.fn(),
        },
        mmInventoryBalance: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
        mmAccountingEvent: { create: jest.fn() },
        mmMaterial: {
            findMany: jest.fn().mockResolvedValue([
                { id: 'mat-1', batchManaged: false, serialManaged: false },
            ]),
            findFirst: jest.fn(),
        },
        mmBatch: { findFirst: jest.fn(), findMany: jest.fn() },
        mmSerialNumber: { findFirst: jest.fn() },
    }
}

function makeLine(overrides: any = {}) {
    return {
        id: 'line-1',
        materialId: 'mat-1',
        uomId: 'uom-1',
        storageBinId: null,
        batchId: null,
        serialNumberId: null,
        quantity: new Decimal(10),
        unitCost: new Decimal(50),
        reason: 'DAMAGE',
        stockStatus: 'BLOCKED',
        ...overrides,
    }
}

describe('Returns / Disposal / Traceability Engine (Phase 8)', () => {
    let prisma: any
    let postingService: any
    let returnService: SupplierReturnService
    let disposalService: DisposalService
    let customerReturnService: CustomerReturnService
    let damagedExpired: DamagedExpiredQueryService
    let expiryControl: ExpiryControlService
    let traceability: TraceabilityService
    let configService: ReturnsDisposalConfigService
    let events: EventEmitter2
    let domainEvents: { supplierReturnPosted: jest.Mock }

    beforeEach(() => {
        prisma = mockPrisma()
        postingService = {
            postTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
            reverseTransaction: jest.fn().mockResolvedValue({ id: 'txn-rev' }),
        }
        events = new EventEmitter2()
        domainEvents = { supplierReturnPosted: jest.fn() }
        configService = new ReturnsDisposalConfigService(prisma)
        returnService = new SupplierReturnService(
            prisma,
            postingService,
            configService,
            events,
            domainEvents as any,
        )
        disposalService = new DisposalService(
            prisma,
            postingService,
            configService,
            events,
        )
        customerReturnService = new CustomerReturnService(
            prisma,
            postingService,
            configService,
            disposalService,
            events,
        )
        damagedExpired = new DamagedExpiredQueryService(
            prisma,
            postingService,
            returnService,
            disposalService,
        )
        expiryControl = new ExpiryControlService(prisma, postingService)
        traceability = new TraceabilityService(prisma, expiryControl)
    })

    it('1) supplier return from QI (draft create path)', async () => {
        prisma.mmSupplierReturn.findFirst.mockResolvedValue(null)
        prisma.mmSupplierReturn.create.mockResolvedValue({
            id: 'ret-qi',
            returnNumber: 'RET-QI',
            status: 'DRAFT',
            lines: [makeLine({ reason: 'QUALITY_RETURN', stockStatus: 'QUARANTINE' })],
            supplier: {},
            warehouse: {},
            goodsReceipt: {},
            audits: [],
        })
        const doc = await returnService.create({
            companyId: 'c1',
            supplierId: 's1',
            warehouseId: 'w1',
            goodsReceiptId: 'gr-1',
            reason: 'Quality inspection return',
            lines: [
                {
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    quantity: 5,
                    unitCost: 10,
                    reason: 'QUALITY_FAILURE',
                    stockStatus: 'QUARANTINE',
                    goodsReceiptLineId: 'grl-1',
                },
            ],
        })
        expect(doc.status).toBe('DRAFT')
        expect(prisma.mmSupplierReturn.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    goodsReceiptId: 'gr-1',
                    status: 'DRAFT',
                }),
            }),
        )
    })

    it('2) supplier return from blocked stock (from-balances)', async () => {
        prisma.mmSupplierReturn.findFirst.mockResolvedValue(null)
        prisma.mmSupplierReturn.create.mockResolvedValue({
            id: 'ret-blk',
            status: 'DRAFT',
            lines: [],
            supplier: {},
            warehouse: {},
            goodsReceipt: {},
            audits: [],
        })
        const doc = await damagedExpired.createSupplierReturnFromBalances({
            companyId: 'c1',
            warehouseId: 'w1',
            supplierId: 's1',
            reason: 'DAMAGE',
            lines: [
                {
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    quantity: 2,
                    unitCost: 8,
                    stockStatus: 'BLOCKED',
                },
            ],
        })
        expect(doc.status).toBe('DRAFT')
        expect(prisma.mmSupplierReturn.create).toHaveBeenCalled()
    })

    it('3) customer restock posts RETURN_IN UNRESTRICTED', async () => {
        const base = {
            id: 'crt-1',
            returnNumber: 'CRT-1',
            companyId: 'c1',
            warehouseId: 'w1',
            estimatedValue: new Decimal(100),
            totalQuantity: new Decimal(2),
            status: 'APPROVED',
            lines: [
                makeLine({
                    id: 'crl-1',
                    quantity: new Decimal(2),
                    disposition: 'RESTOCK',
                    dispositionStatus: 'PENDING',
                }),
            ],
        }
        prisma.mmCustomerReturn.findUnique.mockResolvedValue(base)
        prisma.mmCustomerReturn.updateMany.mockResolvedValue({ count: 1 })
        prisma.mmCustomerReturn.update.mockResolvedValue({ ...base, status: 'CLOSED' })
        prisma.mmCustomerReturnLine.update.mockResolvedValue({})
        await customerReturnService.complete('crt-1')
        expect(postingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'RETURN_IN',
                stockStatus: 'UNRESTRICTED',
                reasonCode: 'RESTOCK',
            }),
        )
    })

    it('4) customer scrap → disposal/scrap → SCRAP', async () => {
        const base = {
            id: 'crt-2',
            returnNumber: 'CRT-2',
            companyId: 'c1',
            warehouseId: 'w1',
            estimatedValue: new Decimal(100),
            totalQuantity: new Decimal(1),
            status: 'APPROVED',
            lines: [
                makeLine({
                    id: 'crl-2',
                    quantity: new Decimal(1),
                    unitCost: new Decimal(100),
                    disposition: 'SCRAP',
                    dispositionStatus: 'PENDING',
                }),
            ],
        }
        const disposalDoc: any = {
            id: 'dsp-scrap',
            disposalNumber: 'SCR-001',
            companyId: 'c1',
            warehouseId: 'w1',
            disposalType: 'SCRAP',
            estimatedValue: new Decimal(100),
            totalQuantity: new Decimal(1),
            status: 'DRAFT',
            lines: [makeLine({ quantity: new Decimal(1), unitCost: new Decimal(100) })],
            warehouse: {},
            audits: [],
        }

        prisma.mmCustomerReturn.findUnique.mockResolvedValue(base)
        prisma.mmCustomerReturn.updateMany.mockResolvedValue({ count: 1 })
        prisma.mmCustomerReturn.update.mockResolvedValue({ ...base, status: 'CLOSED' })
        prisma.mmCustomerReturnLine.update.mockResolvedValue({})
        prisma.mmDisposal.findFirst.mockResolvedValue(null)
        prisma.mmDisposal.create.mockImplementation(({ data }: any) => {
            Object.assign(disposalDoc, data, { id: 'dsp-scrap', lines: disposalDoc.lines })
            disposalDoc.status = 'DRAFT'
            return Promise.resolve({ ...disposalDoc })
        })
        prisma.mmReturnsDisposalConfig.findUnique.mockResolvedValue({
            approvalAmountThreshold: new Decimal(10000),
            approvalQuantityThreshold: new Decimal(0),
        })
        prisma.mmDisposal.findUnique.mockImplementation(() =>
            Promise.resolve({ ...disposalDoc }),
        )
        prisma.mmDisposal.update.mockImplementation(({ data }: any) => {
            Object.assign(disposalDoc, data)
            return Promise.resolve({ ...disposalDoc })
        })
        prisma.mmDisposal.updateMany.mockImplementation(({ data }: any) => {
            Object.assign(disposalDoc, data)
            return Promise.resolve({ count: 1 })
        })

        await customerReturnService.complete('crt-2')

        expect(postingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'RETURN_IN', reasonCode: 'SCRAP' }),
        )
        expect(postingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ movementType: 'SCRAP' }),
        )
        expect(prisma.mmScrapTransaction.upsert).toHaveBeenCalled()
    })

    it('5) expired stock auto-block path', async () => {
        const past = new Date(Date.now() - 86400000)
        prisma.mmReturnsDisposalConfig.findUnique.mockResolvedValue({
            autoBlockExpired: true,
            expiredBlockStockStatus: 'EXPIRED',
        })
        prisma.mmInventoryBalance.findMany.mockResolvedValue([
            {
                id: 'bal-1',
                companyId: 'c1',
                warehouseId: 'w1',
                materialId: 'mat-1',
                batchId: 'batch-1',
                serialNumberId: null,
                storageBinId: null,
                quantity: new Decimal(4),
                uomId: 'uom-1',
                unitCost: new Decimal(2),
                batch: { expiryDate: past },
                material: { id: 'mat-1', autoBlockExpired: false, expiryManaged: true, baseUomId: 'uom-1', standardCost: new Decimal(2) },
            },
        ])
        const result = await expiryControl.blockExpiredStock('c1')
        expect(result.blockedCount).toBe(1)
        expect(postingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_OUT',
                stockStatus: 'UNRESTRICTED',
            }),
        )
        expect(postingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_IN',
                stockStatus: 'EXPIRED',
            }),
        )
    })

    it('6) damaged stock identify → disposal', async () => {
        await damagedExpired.identifyDamage({
            companyId: 'c1',
            warehouseId: 'w1',
            materialId: 'mat-1',
            uomId: 'uom-1',
            quantity: 3,
            unitCost: 5,
        })
        prisma.mmDisposal.findFirst.mockResolvedValue(null)
        prisma.mmDisposal.create.mockResolvedValue({
            id: 'dsp-dmg',
            status: 'DRAFT',
            lines: [],
        })
        await damagedExpired.createDisposalFromBalances({
            companyId: 'c1',
            warehouseId: 'w1',
            disposalType: 'SCRAP',
            reason: 'DAMAGE',
            lines: [
                {
                    materialId: 'mat-1',
                    uomId: 'uom-1',
                    quantity: 3,
                    unitCost: 5,
                    stockStatus: 'BLOCKED',
                },
            ],
        })
        expect(postingService.postTransaction).toHaveBeenCalledWith(
            expect.objectContaining({
                movementType: 'TRANSFER_IN',
                stockStatus: 'BLOCKED',
            }),
        )
        expect(prisma.mmDisposal.create).toHaveBeenCalled()
    })

    it('7) batch forward trace', async () => {
        prisma.mmBatch.findFirst.mockResolvedValue({ id: 'batch-1', deletedAt: null })
        prisma.mmInventoryTransaction.findMany.mockResolvedValue([
            {
                id: 't1',
                transactionNumber: 'TXN-1',
                postingDate: new Date('2026-01-01'),
                movementType: 'RECEIPT',
                quantity: new Decimal(10),
                signedQuantity: new Decimal(10),
                stockStatus: 'UNRESTRICTED',
                sourceDocumentType: 'GOODS_RECEIPT',
                sourceDocumentId: 'gr-1',
                warehouse: { code: 'WH1' },
                material: { materialCode: 'M1' },
                batch: { id: 'batch-1', batchNumber: 'B1' },
                serialNumber: null,
                storageBin: null,
                uom: { code: 'EA' },
            },
            {
                id: 't2',
                transactionNumber: 'TXN-2',
                postingDate: new Date('2026-02-01'),
                movementType: 'ISSUE',
                quantity: new Decimal(4),
                signedQuantity: new Decimal(-4),
                stockStatus: 'UNRESTRICTED',
                sourceDocumentType: 'GOODS_ISSUE',
                sourceDocumentId: 'gi-1',
                warehouse: { code: 'WH1' },
                material: { materialCode: 'M1' },
                batch: { id: 'batch-1', batchNumber: 'B1' },
                serialNumber: null,
                storageBin: null,
                uom: { code: 'EA' },
            },
        ])
        const fwd = await traceability.batchForward('batch-1')
        expect(fwd.direction).toBe('forward')
        expect(fwd.chain).toHaveLength(2)
        expect(fwd.chain[0].movementType).toBe('RECEIPT')
        expect(fwd.chain[1].movementType).toBe('ISSUE')
    })

    it('8) batch backward trace', async () => {
        prisma.mmBatch.findFirst.mockResolvedValue({ id: 'batch-1', deletedAt: null })
        prisma.mmInventoryTransaction.findMany.mockResolvedValue([
            {
                id: 't1',
                transactionNumber: 'TXN-1',
                postingDate: new Date('2026-01-01'),
                movementType: 'RECEIPT',
                quantity: new Decimal(10),
                signedQuantity: new Decimal(10),
                stockStatus: 'UNRESTRICTED',
                sourceDocumentType: 'GOODS_RECEIPT',
                sourceDocumentId: 'gr-1',
                warehouse: {},
                material: {},
                batch: { id: 'batch-1', batchNumber: 'B1' },
                serialNumber: null,
                storageBin: null,
                uom: {},
            },
        ])
        const bwd = await traceability.batchBackward('batch-1')
        expect(bwd.direction).toBe('backward')
        expect(bwd.chain[0].sourceDocumentType).toBe('GOODS_RECEIPT')
    })

    it('9) serial history', async () => {
        prisma.mmSerialNumber.findFirst.mockResolvedValue({
            id: 'ser-1',
            serialNumber: 'SN-001',
            deletedAt: null,
            material: { materialCode: 'M1' },
            batch: null,
            currentWarehouse: null,
            currentBin: null,
        })
        prisma.mmInventoryTransaction.findMany.mockResolvedValue([
            {
                id: 't1',
                transactionNumber: 'TXN-S1',
                postingDate: new Date('2026-01-01'),
                movementType: 'RECEIPT',
                quantity: new Decimal(1),
                signedQuantity: new Decimal(1),
                stockStatus: 'UNRESTRICTED',
                sourceDocumentType: 'GOODS_RECEIPT',
                sourceDocumentId: 'gr-1',
                warehouse: {},
                material: {},
                batch: null,
                serialNumber: { id: 'ser-1', serialNumber: 'SN-001' },
                storageBin: null,
                uom: {},
            },
        ])
        const hist = await traceability.getSerial('ser-1')
        expect(hist.history).toHaveLength(1)
        expect(hist.history[0].movementType).toBe('RECEIPT')
    })

    it('10) duplicate return posting blocked', async () => {
        prisma.mmSupplierReturn.findUnique.mockResolvedValue({
            id: 'ret-dup',
            status: 'APPROVED',
            companyId: 'c1',
            warehouseId: 'w1',
            supplierId: 's1',
            returnNumber: 'RET-DUP',
            lines: [makeLine()],
        })
        prisma.mmSupplierReturn.updateMany.mockResolvedValue({ count: 0 })
        await expect(returnService.post('ret-dup')).rejects.toThrow(BadRequestException)
        await expect(returnService.post('ret-dup')).rejects.toThrow(
            /Duplicate return posting/,
        )
        expect(postingService.postTransaction).not.toHaveBeenCalled()
    })

    it('FEFO drops past-expiry candidates', () => {
        const strategy = new FefoAllocationStrategy()
        const past = new Date('2020-01-01')
        const future = new Date('2030-01-01')
        const plan = strategy.plan(
            {
                companyId: 'c1',
                warehouseId: 'w1',
                materialId: 'mat-1',
                quantity: new Dec(5),
            },
            [
                {
                    storageBinId: 'bin-old',
                    batchId: 'b-old',
                    serialNumberId: null,
                    availableQuantity: new Dec(10),
                    batchExpiry: past,
                    binCode: 'A1',
                },
                {
                    storageBinId: 'bin-new',
                    batchId: 'b-new',
                    serialNumberId: null,
                    availableQuantity: new Dec(10),
                    batchExpiry: future,
                    binCode: 'A2',
                },
            ],
        )
        expect(plan.every((p) => p.batchId === 'b-new')).toBe(true)
    })
})
