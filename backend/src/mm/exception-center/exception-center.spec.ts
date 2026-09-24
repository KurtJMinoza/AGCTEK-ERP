/**
 * Phase 5: MM Exception Center — read-only aggregation
 */
import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { ExceptionCenterService } from './exception-center.service'
import { buildExceptionId } from './exception-center.util'

describe('ExceptionCenterService (Phase 5)', () => {
    const mockPrisma: any = {
        mmPurchaseOrder: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 'po-1',
                    poNumber: 'PO-100',
                    status: 'SENT',
                    // Recent overdue date — stale threshold is 90 days
                    expectedDeliveryDate: new Date('2026-08-15'),
                    createdAt: new Date('2026-08-01'),
                    buyerId: 'buyer-1',
                    warehouseId: 'wh-1',
                    companyId: 'co-1',
                },
            ]),
        },
        mmSupplier: { findMany: jest.fn().mockResolvedValue([]) },
        mmMatchException: { findMany: jest.fn().mockResolvedValue([]) },
        mmReceivingVariance: { findMany: jest.fn().mockResolvedValue([]) },
        mmQualityHold: { findMany: jest.fn().mockResolvedValue([]) },
        mmInspectionLot: { findMany: jest.fn().mockResolvedValue([]) },
        mmNonconformance: { findMany: jest.fn().mockResolvedValue([]) },
        mmCorrectiveAction: { findMany: jest.fn().mockResolvedValue([]) },
        mmMrpRun: {
            findFirst: jest.fn().mockResolvedValue({ id: 'run-1', executionTime: new Date() }),
        },
        mmMaterialRequirement: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: 'req-1',
                    companyId: 'co-1',
                    warehouseId: 'wh-1',
                    materialId: 'mat-1',
                    createdAt: new Date(),
                    material: { materialCode: 'MAT-1', materialName: 'Widget' },
                    availableQty: 5,
                    shortage: true,
                    shortageQty: 10,
                },
            ]),
        },
        mmInventoryBalance: { groupBy: jest.fn().mockResolvedValue([]) },
        mmInventoryReservationHeader: { findMany: jest.fn().mockResolvedValue([]) },
        mmInventoryReservationLine: { findMany: jest.fn().mockResolvedValue([]) },
        wmWarehouseTask: { findMany: jest.fn().mockResolvedValue([]) },
        wmPickingTask: { findMany: jest.fn().mockResolvedValue([]) },
        mmCountVariance: { findMany: jest.fn().mockResolvedValue([]) },
        mmStockTransferOrder: { findMany: jest.fn().mockResolvedValue([]) },
        mmStockTransferOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
        mmProcurementSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
        mmDomainEventOutbox: { findMany: jest.fn().mockResolvedValue([]) },
        mmEventConsumerReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    }

    let service: ExceptionCenterService

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExceptionCenterService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(ExceptionCenterService)
    })

    it('aggregates exceptions and counts match list', async () => {
        const list = await service.list({ companyId: 'co-1' })
        const counts = await service.getCounts({ companyId: 'co-1' })

        expect(list.data.length).toBeGreaterThan(0)
        expect(counts.total).toBe(list.meta.counts.total)
        expect(list.data.some((e) => e.type === 'OVERDUE_PO')).toBe(true)
        expect(list.data.some((e) => e.type === 'MRP_SHORTAGE')).toBe(true)
    })

    it('filters by domain and severity', async () => {
        const list = await service.list({
            companyId: 'co-1',
            domain: 'procurement',
            severity: 'HIGH',
        })
        expect(list.data.every((e) => e.domain === 'procurement')).toBe(true)
        expect(list.data.every((e) => e.severity === 'HIGH')).toBe(true)
    })

    it('scopes by warehouse', async () => {
        await service.list({ companyId: 'co-1', warehouseId: 'wh-1' })
        expect(mockPrisma.mmPurchaseOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ warehouseId: 'wh-1' }),
            }),
        )
    })

    it('getOne returns drill-down item with href', async () => {
        const id = buildExceptionId('procurement', 'OVERDUE_PO', 'po-1')
        const item = await service.getOne(id, { companyId: 'co-1' })
        expect(item.id).toBe(id)
        expect(item.href).toContain('purchase-orders')
        expect(item.recommendedAction).toBeTruthy()
    })

    it('denies getOne for wrong company scope', async () => {
        const id = buildExceptionId('procurement', 'OVERDUE_PO', 'po-1')
        await expect(
            service.getOne(id, { companyId: 'co-other' }),
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('hides procurement exceptions when role lacks procurement visibility', async () => {
        const list = await service.list({
            companyId: 'co-1',
            role: 'warehouse_clerk',
            authority: 'mm.warehouse',
        })
        expect(list.data.every((e) => e.domain !== 'procurement')).toBe(true)
    })

    it('marks stale exceptions and excludes by default', async () => {
        mockPrisma.mmPurchaseOrder.findMany.mockImplementation(async (args: any) => {
            if (args?.where?.status?.in) {
                return [
                    {
                        id: 'po-old',
                        poNumber: 'PO-OLD',
                        status: 'SENT',
                        expectedDeliveryDate: new Date('2020-01-01'),
                        createdAt: new Date('2020-01-01'),
                        buyerId: null,
                        warehouseId: 'wh-1',
                        companyId: 'co-1',
                    },
                ]
            }
            return []
        })
        mockPrisma.mmMrpRun.findFirst.mockResolvedValue(null)
        mockPrisma.mmMaterialRequirement.findMany.mockResolvedValue([])

        const withoutStale = await service.list({ companyId: 'co-1' })
        const withStale = await service.list({
            companyId: 'co-1',
            includeStale: true,
        })
        expect(withStale.data.some((e) => e.stale)).toBe(true)
        expect(withoutStale.data.some((e) => e.id.includes('po-old'))).toBe(false)
    })

    it('throws for invalid exception id', async () => {
        await expect(
            service.getOne('bad-id', { companyId: 'co-1' }),
        ).rejects.toBeInstanceOf(NotFoundException)
    })
})
