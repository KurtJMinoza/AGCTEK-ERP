import { BadRequestException, NotFoundException } from '@nestjs/common'
import { BarcodeResolveService } from './barcode-resolve.service'
import { ScannerEventService } from './scanner-event.service'

function mockPrisma(overrides: any = {}) {
    return {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
        mmBarcode: { findFirst: jest.fn().mockResolvedValue(null) },
        mmMaterial: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn().mockResolvedValue({
                id: 'mat-1',
                batchManaged: false,
                serialManaged: false,
                baseUomId: 'uom-1',
            }),
        },
        mmSupplierMaterial: { findFirst: jest.fn().mockResolvedValue(null) },
        warehouse: { findFirst: jest.fn().mockResolvedValue(null) },
        wmStorageBin: { findFirst: jest.fn().mockResolvedValue(null) },
        mmBatch: { findFirst: jest.fn().mockResolvedValue(null) },
        mmSerialNumber: { findFirst: jest.fn().mockResolvedValue(null) },
        mmPurchaseOrder: { findFirst: jest.fn().mockResolvedValue(null) },
        mmExpectedReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
        mmExpectedReceiptLine: { findUnique: jest.fn() },
        wmPickingTask: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn(),
        },
        mmInventoryCount: { findFirst: jest.fn().mockResolvedValue(null) },
        mmInventoryCountLine: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn() },
        mmScannerEvent: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest
                .fn()
                .mockImplementation(({ data }) =>
                    Promise.resolve({ id: 'ev-1', ...data }),
                ),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        ...overrides,
    }
}

function buildService(prisma: any, domain: Partial<Record<string, any>> = {}) {
    return new ScannerEventService(
        prisma,
        new BarcodeResolveService(prisma),
        domain.receiving ?? { receive: jest.fn() },
        domain.putaway ?? { confirm: jest.fn() },
        domain.picking ?? { confirmPick: jest.fn() },
        domain.packing ?? { scanItem: jest.fn() },
        domain.count ?? { blindCount: jest.fn() },
        domain.binTransfer ?? { create: jest.fn(), post: jest.fn() },
    )
}

const baseEvent = {
    deviceId: 'd1',
    userId: 'user-1',
    timestamp: new Date().toISOString(),
}

describe('MM-12 Barcode resolve', () => {
    it('resolves material barcode first', async () => {
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'MAT-001',
                        materialName: 'Widget',
                        batchManaged: false,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                }),
            },
        })
        const svc = new BarcodeResolveService(prisma as any)
        const hit = await svc.resolve('BC-123')
        expect(hit.type).toBe('MATERIAL_BARCODE')
        expect(hit.materialId).toBe('mat-1')
    })

    it('resolves document barcodes (PO / ER / pick / count)', async () => {
        const prisma = mockPrisma({
            mmPurchaseOrder: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'po-1',
                    poNumber: 'PO-100',
                    companyId: 'c1',
                    warehouseId: 'wh-1',
                    supplierId: 's1',
                }),
            },
        })
        const svc = new BarcodeResolveService(prisma as any)
        const hit = await svc.resolve('PO-100')
        expect(hit.type).toBe('PURCHASE_ORDER')
        expect(hit.purchaseOrderId).toBe('po-1')
    })

    it('invalid barcode → INVALID_BARCODE', async () => {
        const svc = new BarcodeResolveService(mockPrisma() as any)
        await expect(svc.resolve('NOPE')).rejects.toThrow(/INVALID_BARCODE/)
        await expect(svc.resolve('NOPE')).rejects.toThrow(NotFoundException)
    })
})

describe('MM-12 ScannerEventService', () => {
    it('duplicate scan → DUPLICATE without domain call', async () => {
        const receive = jest.fn()
        const prisma = mockPrisma({
            mmScannerEvent: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'ev-old',
                    status: 'SUCCESS',
                    result: { goodsReceiptId: 'gr-1' },
                    idempotencyKey: 'idem-1',
                }),
                create: jest.fn(),
            },
        })
        const svc = buildService(prisma, { receiving: { receive } })
        const res = await svc.processEvent({
            ...baseEvent,
            operation: 'RECEIVING',
            barcode: 'BC',
            quantity: 1,
            idempotencyKey: 'idem-1',
            expectedReceiptId: 'er-1',
            expectedReceiptLineId: 'erl-1',
        } as any)
        expect(res.status).toBe('DUPLICATE')
        expect(receive).not.toHaveBeenCalled()
    })

    it('wrong bin on picking → WRONG_BIN, no confirmPick', async () => {
        const confirmPick = jest.fn()
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'M',
                        materialName: 'M',
                        batchManaged: false,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                }),
            },
            wmStorageBin: {
                findFirst: jest.fn().mockResolvedValue({ id: 'bin-wrong', code: 'B2' }),
            },
            wmPickingTask: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'pick-1',
                    sourceBinId: 'bin-ok',
                    materialId: 'mat-1',
                    batchId: null,
                    serialId: null,
                }),
            },
        })
        const svc = buildService(prisma, { picking: { confirmPick } })
        await expect(
            svc.processEvent({
                ...baseEvent,
                operation: 'PICKING',
                barcode: 'MAT-BC',
                quantity: 1,
                bin: 'B2',
                idempotencyKey: 'k-wrong-bin',
                pickingTaskId: 'pick-1',
            } as any),
        ).rejects.toThrow(/WRONG_BIN/)
        expect(confirmPick).not.toHaveBeenCalled()
    })

    it('wrong batch when task expects batch → WRONG_BATCH', async () => {
        const confirmPick = jest.fn()
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'M',
                        materialName: 'M',
                        batchManaged: true,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                }),
            },
            wmStorageBin: {
                findFirst: jest.fn().mockResolvedValue({ id: 'bin-ok', code: 'B1' }),
            },
            mmBatch: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'batch-wrong',
                    batchNumber: 'LOT-X',
                    materialId: 'mat-1',
                }),
            },
            wmPickingTask: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'pick-1',
                    sourceBinId: 'bin-ok',
                    materialId: 'mat-1',
                    batchId: 'batch-expected',
                    serialId: null,
                }),
            },
        })
        const svc = buildService(prisma, { picking: { confirmPick } })
        await expect(
            svc.processEvent({
                ...baseEvent,
                operation: 'PICKING',
                barcode: 'MAT-BC',
                quantity: 1,
                bin: 'B1',
                batch: 'LOT-X',
                idempotencyKey: 'k-wrong-batch',
                pickingTaskId: 'pick-1',
            } as any),
        ).rejects.toThrow(/WRONG_BATCH/)
        expect(confirmPick).not.toHaveBeenCalled()
    })

    it('wrong serial when task expects serial → WRONG_SERIAL', async () => {
        const confirmPick = jest.fn()
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'M',
                        materialName: 'M',
                        batchManaged: false,
                        serialManaged: true,
                        baseUomId: 'uom-1',
                    },
                }),
            },
            wmStorageBin: {
                findFirst: jest.fn().mockResolvedValue({ id: 'bin-ok', code: 'B1' }),
            },
            mmSerialNumber: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'ser-wrong',
                    serialNumber: 'SN-X',
                    materialId: 'mat-1',
                }),
            },
            wmPickingTask: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'pick-1',
                    sourceBinId: 'bin-ok',
                    materialId: 'mat-1',
                    batchId: null,
                    serialId: 'ser-expected',
                }),
            },
        })
        const svc = buildService(prisma, { picking: { confirmPick } })
        await expect(
            svc.processEvent({
                ...baseEvent,
                operation: 'PICKING',
                barcode: 'MAT-BC',
                quantity: 1,
                bin: 'B1',
                serial: 'SN-X',
                idempotencyKey: 'k-wrong-ser',
                pickingTaskId: 'pick-1',
            } as any),
        ).rejects.toThrow(/WRONG_SERIAL/)
        expect(confirmPick).not.toHaveBeenCalled()
    })

    it('valid receiving → ReceivingService.receive once', async () => {
        const receive = jest.fn().mockResolvedValue({
            id: 'gr-1',
            companyId: 'c1',
            warehouseId: 'wh-1',
            documentNumber: 'GR-1',
            status: 'DRAFT',
        })
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'M',
                        materialName: 'M',
                        batchManaged: false,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                }),
            },
            mmExpectedReceiptLine: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'erl-1',
                    materialId: 'mat-1',
                }),
            },
        })
        const svc = buildService(prisma, { receiving: { receive } })
        const res = await svc.processEvent({
            ...baseEvent,
            operation: 'RECEIVING',
            barcode: 'MAT-BC',
            quantity: 2,
            idempotencyKey: 'k-recv',
            expectedReceiptId: 'er-1',
            expectedReceiptLineId: 'erl-1',
        } as any)
        expect(receive).toHaveBeenCalledTimes(1)
        expect(res.status).toBe('SUCCESS')
        expect(res.documentType).toBe('GOODS_RECEIPT')
    })

    it('valid picking → confirmPick once', async () => {
        const confirmPick = jest.fn().mockResolvedValue({
            id: 'pick-1',
            status: 'COMPLETED',
            companyId: 'c1',
            warehouseId: 'wh-1',
        })
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'M',
                        materialName: 'M',
                        batchManaged: false,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                }),
            },
            wmStorageBin: {
                findFirst: jest.fn().mockResolvedValue({ id: 'bin-ok', code: 'B1' }),
            },
            wmPickingTask: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'pick-1',
                    sourceBinId: 'bin-ok',
                    materialId: 'mat-1',
                    batchId: null,
                    serialId: null,
                }),
            },
        })
        const svc = buildService(prisma, { picking: { confirmPick } })
        const res = await svc.processEvent({
            ...baseEvent,
            operation: 'PICKING',
            barcode: 'MAT-BC',
            quantity: 1,
            bin: 'B1',
            idempotencyKey: 'k-pick',
            pickingTaskId: 'pick-1',
        } as any)
        expect(confirmPick).toHaveBeenCalledTimes(1)
        expect(res.status).toBe('SUCCESS')
    })

    it('valid counting → blindCount once', async () => {
        const blindCount = jest.fn().mockResolvedValue({
            id: 'line-1',
            materialId: 'mat-1',
            countedQuantity: 5,
        })
        const prisma = mockPrisma({
            mmInventoryCountLine: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'line-1',
                    materialId: 'mat-1',
                    storageBinId: null,
                }),
            },
        })
        const svc = buildService(prisma, { count: { blindCount } })
        const res = await svc.processEvent({
            ...baseEvent,
            operation: 'COUNTING',
            barcode: 'MANUAL',
            quantity: 5,
            idempotencyKey: 'k-count',
            countLineId: 'line-1',
        } as any)
        expect(blindCount).toHaveBeenCalledTimes(1)
        expect(res.status).toBe('SUCCESS')
    })

    it('batch ingest processes each event with own idempotency', async () => {
        const blindCount = jest.fn().mockResolvedValue({
            id: 'line-1',
            materialId: 'mat-1',
            countedQuantity: 1,
        })
        const prisma = mockPrisma({
            mmInventoryCountLine: {
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'line-1',
                    materialId: 'mat-1',
                    storageBinId: null,
                }),
            },
        })
        const svc = buildService(prisma, { count: { blindCount } })
        const out = await svc.processBatch([
            {
                ...baseEvent,
                operation: 'COUNTING',
                barcode: 'MANUAL',
                quantity: 1,
                idempotencyKey: 'batch-a',
                countLineId: 'line-1',
            } as any,
            {
                ...baseEvent,
                operation: 'COUNTING',
                barcode: 'MANUAL',
                quantity: 2,
                idempotencyKey: 'batch-b',
                countLineId: 'line-1',
            } as any,
        ])
        expect(out.processed).toBe(2)
        expect(out.results.every((r: any) => r.status === 'SUCCESS')).toBe(true)
        expect(blindCount).toHaveBeenCalledTimes(2)
    })

    it('rejects unknown user', async () => {
        const prisma = mockPrisma({
            user: { findUnique: jest.fn().mockResolvedValue(null) },
        })
        const svc = buildService(prisma)
        await expect(
            svc.processEvent({
                ...baseEvent,
                userId: 'missing',
                operation: 'COUNTING',
                barcode: 'X',
                quantity: 1,
                idempotencyKey: 'k1',
                countLineId: 'line-1',
            } as any),
        ).rejects.toThrow(BadRequestException)
    })
})
