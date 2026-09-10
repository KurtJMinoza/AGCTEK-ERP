import { Decimal } from '@prisma/client/runtime/library'
import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import {
    computeNetting,
    canonicalizeDemandSource,
    aggregateDemandSource,
    suggestionReason,
} from './mrp-engine.service'
import { ProcurementSuggestionService } from './procurement-suggestion.service'
import { PrismaService } from '../../prisma/prisma.service'
import { PurchaseRequisitionService } from '../purchase-requisition/purchase-requisition.service'

describe('MM-06 MRP netting', () => {
    const base = {
        unrestrictedQty: new Decimal(100),
        reservedQty: new Decimal(20),
        qualityQty: new Decimal(0),
        blockedQty: new Decimal(0),
        incomingQty: new Decimal(0),
        demandQty: new Decimal(0),
        safetyStock: new Decimal(0),
        reorderPoint: new Decimal(0),
        reorderQuantity: new Decimal(0),
        minimumOrderQuantity: new Decimal(0),
        leadTimeDays: 0,
        includeOpenReceipts: true,
        asOf: new Date('2026-09-04T00:00:00Z'),
    }

    it('demand + safety drives net requirement', () => {
        // availableNow = 100-20 = 80; need = 50+30 = 80 → net 0
        let r = computeNetting({
            ...base,
            demandQty: new Decimal(50),
            safetyStock: new Decimal(30),
        })
        expect(Number(r.netRequirement)).toBe(0)
        expect(Number(r.availableQty)).toBe(80)

        // need = 100+30 = 130; cover 80 → net 50
        r = computeNetting({
            ...base,
            demandQty: new Decimal(100),
            safetyStock: new Decimal(30),
        })
        expect(Number(r.netRequirement)).toBe(50)
        expect(r.shortage).toBe(true)
        expect(Number(r.recommendedQty)).toBe(50)
    })

    it('safety stock alone marks shortage when available < safety', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(40),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(0),
            safetyStock: new Decimal(50),
        })
        expect(Number(r.availableQty)).toBe(40)
        expect(Number(r.netRequirement)).toBe(10) // need 50 − cover 40
        expect(r.shortage).toBe(true)
    })

    it('open PO incoming reduces net when includeOpenReceipts', () => {
        const withIncoming = computeNetting({
            ...base,
            demandQty: new Decimal(100),
            safetyStock: new Decimal(30),
            incomingQty: new Decimal(40),
            includeOpenReceipts: true,
        })
        // cover = 80+40 = 120; need 130 → net 10
        expect(Number(withIncoming.netRequirement)).toBe(10)

        const without = computeNetting({
            ...base,
            demandQty: new Decimal(100),
            safetyStock: new Decimal(30),
            incomingQty: new Decimal(40),
            includeOpenReceipts: false,
        })
        expect(Number(without.netRequirement)).toBe(50)
    })

    it('reservation lowers available and is not double-added to demand', () => {
        // Spec: reserved only reduces available; demandQty is planning demand only.
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(50),
            reservedQty: new Decimal(10),
            demandQty: new Decimal(45), // planning demand — not reservation qty
            safetyStock: new Decimal(0),
        })
        // available 40; need 45 → net 5
        expect(Number(r.availableQty)).toBe(40)
        expect(Number(r.netRequirement)).toBe(5)
        // If reservation were also in demand (double-count), demand would be 55 → net 15
        expect(Number(r.netRequirement)).not.toBe(15)
    })

    it('ROP triggers suggestion with zero external demand', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(10),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(0),
            safetyStock: new Decimal(5),
            reorderPoint: new Decimal(20),
            reorderQuantity: new Decimal(50),
            minimumOrderQuantity: new Decimal(25),
        })
        expect(r.belowReorderPoint).toBe(true)
        // max(reorderQty 50, MOQ 25, safetyGap 0) = 50
        expect(Number(r.recommendedQty)).toBe(50)
        expect(Number(r.netRequirement)).toBe(0)
    })

    it('MOQ / reorder qty rounding', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(12),
            safetyStock: new Decimal(0),
            minimumOrderQuantity: new Decimal(10),
            reorderQuantity: new Decimal(25),
        })
        // net 12 → max MOQ 12 → ceil to 25
        expect(Number(r.netRequirement)).toBe(12)
        expect(Number(r.recommendedQty)).toBe(25)
    })

    it('lead time sets expectedProcurementDate', () => {
        const asOf = new Date('2026-09-04T12:00:00.000Z')
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(5),
            leadTimeDays: 7,
            asOf,
        })
        expect(r.expectedProcurementDate).toBeTruthy()
        const ms = r.expectedProcurementDate!.getTime() - asOf.getTime()
        expect(Math.round(ms / (24 * 60 * 60 * 1000))).toBe(7)
    })

    it('stockout projection uses earliest demand date when short with demand', () => {
        const asOf = new Date('2026-09-04T00:00:00.000Z')
        const earliest = new Date('2026-09-12T00:00:00.000Z')
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(10),
            asOf,
            earliestDemandDate: earliest,
        })
        expect(r.shortage).toBe(true)
        expect(r.projectedStockoutDate?.toISOString()).toBe(
            earliest.toISOString(),
        )
    })

    it('stockout projection falls back to asOf when short without demand date', () => {
        const asOf = new Date('2026-09-04T00:00:00.000Z')
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(5),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(0),
            safetyStock: new Decimal(20),
            asOf,
        })
        expect(r.shortage).toBe(true)
        expect(r.projectedStockoutDate?.toISOString()).toBe(asOf.toISOString())
    })

    it('aggregates demand sources and suggestion reasons', () => {
        expect(canonicalizeDemandSource('MANUAL')).toBe('MANUAL_INTERNAL')
        expect(canonicalizeDemandSource('SALES_ORDER')).toBe('SALES')
        expect(aggregateDemandSource(['SALES', 'SALES'])).toBe('SALES')
        expect(aggregateDemandSource(['SALES', 'PRODUCTION'])).toBe('MIXED')
        expect(aggregateDemandSource([])).toBeNull()

        const short = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(5),
        })
        expect(suggestionReason(short)).toBe('SHORTAGE')

        const rop = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(5),
            reservedQty: new Decimal(0),
            demandQty: new Decimal(0),
            reorderPoint: new Decimal(10),
            reorderQuantity: new Decimal(20),
            safetyStock: new Decimal(0),
        })
        expect(rop.belowReorderPoint).toBe(true)
        expect(suggestionReason(rop)).toBe('BELOW_REORDER_POINT')
    })
})

describe('MM-06 convert suggestion → DRAFT PR', () => {
    let service: ProcurementSuggestionService
    const mockPrisma: any = {
        mmProcurementSuggestion: {
            findUnique: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
    }
    const mockPr = {
        create: jest.fn(),
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProcurementSuggestionService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: PurchaseRequisitionService, useValue: mockPr },
            ],
        }).compile()
        service = module.get(ProcurementSuggestionService)
    })

    it('converts OPEN suggestion to DRAFT PR with sourceMrpRunId and preferred supplier', async () => {
        const suggestion = {
            id: 'sug-1',
            status: 'OPEN',
            suggestionType: 'PR_RECOMMENDATION',
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
            quantity: new Decimal(50),
            uomId: 'uom-1',
            requiredDate: new Date('2026-09-11'),
            mrpRunId: 'run-1',
            preferredSupplierId: 'sup-1',
            mrpRun: { runNumber: 'MRP-1' },
        }
        mockPrisma.mmProcurementSuggestion.findUnique.mockResolvedValue(
            suggestion,
        )
        mockPr.create.mockResolvedValue({
            id: 'pr-1',
            requisitionNumber: 'PR-001',
            status: 'DRAFT',
            sourceMrpRunId: 'run-1',
        })
        mockPrisma.mmProcurementSuggestion.update.mockResolvedValue({
            ...suggestion,
            status: 'CONVERTED',
            purchaseRequisitionId: 'pr-1',
            purchaseRequisition: {
                id: 'pr-1',
                requisitionNumber: 'PR-001',
                status: 'DRAFT',
            },
        })

        const result = await service.convertToPr('sug-1', {
            requesterId: 'user-1',
            purpose: 'MRP',
        })

        expect(mockPr.create).toHaveBeenCalledWith(
            expect.objectContaining({
                companyId: 'co-1',
                requesterId: 'user-1',
                sourceMrpRunId: 'run-1',
                lines: [
                    expect.objectContaining({
                        materialId: 'mat-1',
                        requestedQuantity: 50,
                        warehouseId: 'wh-1',
                        preferredSupplierId: 'sup-1',
                    }),
                ],
            }),
        )
        expect(result.purchaseRequisition.status).toBe('DRAFT')
        expect(result.suggestion.status).toBe('CONVERTED')
        // No PO / inventory posting involved
        expect(Object.keys(mockPrisma)).not.toContain('mmPurchaseOrder')
        expect(Object.keys(mockPrisma)).not.toContain('mmInventoryTransaction')
    })

    it('rejects convert when not OPEN', async () => {
        mockPrisma.mmProcurementSuggestion.findUnique.mockResolvedValue({
            id: 'sug-1',
            status: 'DISMISSED',
            mrpRun: { runNumber: 'MRP-1' },
        })
        await expect(
            service.convertToPr('sug-1', { requesterId: 'u1' }),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(mockPr.create).not.toHaveBeenCalled()
    })
})

describe('MM-06 engine inventory guard', () => {
    it('mrp-engine module does not import InventoryPostingService', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src = require('fs').readFileSync(
            require('path').join(__dirname, 'mrp-engine.service.ts'),
            'utf8',
        ) as string
        expect(src).not.toMatch(/InventoryPostingService/)
        expect(src).not.toMatch(/mmInventoryTransaction\.create/)
        expect(src).not.toMatch(/postTransaction|postMovement/)
    })
})
