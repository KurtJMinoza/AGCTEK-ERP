/**
 * Phase 10: Advanced MRP and Replenishment engine scenarios
 * MRP produces planning output only — never posts inventory.
 */
import { Decimal } from '@prisma/client/runtime/library'
import {
    computeNetting,
    suggestionReason,
    buildSuggestionExplanation,
    canonicalizeDemandSource,
} from './mrp-engine.service'
import { NullBomProvider } from './bom-provider'

describe('Advanced MRP Engine (Phase 10)', () => {
    const asOf = new Date('2026-09-11T00:00:00.000Z')
    const base = {
        unrestrictedQty: new Decimal(100),
        reservedQty: new Decimal(0),
        qualityQty: new Decimal(0),
        blockedQty: new Decimal(0),
        incomingQty: new Decimal(0),
        plannedSupplyQty: new Decimal(0),
        productionSupplyQty: new Decimal(0),
        demandQty: new Decimal(0),
        safetyStock: new Decimal(0),
        reorderPoint: new Decimal(0),
        reorderQuantity: new Decimal(0),
        minimumOrderQuantity: new Decimal(0),
        lotSize: new Decimal(0),
        minStock: new Decimal(0),
        maxStock: new Decimal(0),
        leadTimeDays: 0,
        includeOpenReceipts: true,
        asOf,
        procurementType: 'BUY',
    }

    it('1) simple reorder below ROP', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(8),
            reorderPoint: new Decimal(20),
            reorderQuantity: new Decimal(40),
            safetyStock: new Decimal(5),
        })
        expect(r.belowReorderPoint).toBe(true)
        expect(Number(r.recommendedQty)).toBe(40)
        expect(r.recommendedAction).toBe('CREATE_PR')
        expect(suggestionReason(r)).toBe('BELOW_REORDER_POINT')
    })

    it('2) safety stock shortage', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(10),
            safetyStock: new Decimal(25),
            demandQty: new Decimal(0),
        })
        expect(r.shortage).toBe(true)
        expect(Number(r.netRequirement)).toBe(15)
        expect(Number(r.shortageQty)).toBe(15)
        expect(Number(r.grossDemand)).toBe(0)
        expect(Number(r.projectedAvailable)).toBe(10)
    })

    it('3) existing open PO / incoming reduces net', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(50),
            safetyStock: new Decimal(10),
            incomingQty: new Decimal(40),
            includeOpenReceipts: true,
        })
        // need 60, cover 40 → net 20
        expect(Number(r.projectedAvailable)).toBe(40)
        expect(Number(r.netRequirement)).toBe(20)
        expect(Number(r.recommendedQty)).toBe(20)
    })

    it('4) reservation lowers available without double-counting demand', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(50),
            reservedQty: new Decimal(15),
            demandQty: new Decimal(40),
        })
        expect(Number(r.availableQty)).toBe(35)
        expect(Number(r.netRequirement)).toBe(5)
        // If reserved were also in demand: demand 55 → net 20
        expect(Number(r.netRequirement)).not.toBe(20)
    })

    it('5) MOQ floors recommended quantity', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(3),
            minimumOrderQuantity: new Decimal(25),
        })
        expect(Number(r.netRequirement)).toBe(3)
        expect(Number(r.recommendedQty)).toBe(25)
    })

    it('6) lot size rounds recommended quantity up', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(12),
            lotSize: new Decimal(10),
            minimumOrderQuantity: new Decimal(0),
        })
        expect(Number(r.netRequirement)).toBe(12)
        expect(Number(r.recommendedQty)).toBe(20)
    })

    it('7) lead time drives expected procurement date', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(5),
            leadTimeDays: 14,
        })
        expect(r.expectedProcurementDate).toBeTruthy()
        const days =
            (r.expectedProcurementDate!.getTime() - asOf.getTime()) /
            (24 * 60 * 60 * 1000)
        expect(Math.round(days)).toBe(14)
    })

    it('8) multiple warehouses are independent (netting per WH snapshot)', () => {
        const whA = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(100),
            demandQty: new Decimal(10),
        })
        const whB = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(10),
        })
        expect(Number(whA.netRequirement)).toBe(0)
        expect(Number(whB.netRequirement)).toBe(10)
        expect(whA.shortage).toBe(false)
        expect(whB.shortage).toBe(true)
    })

    it('9) multiple demands aggregate as gross demand; cancelled demand excluded by caller', () => {
        // Engine snapshot sums OPEN demands only; cancelled qty is never passed in.
        const openOnly = new Decimal(30).plus(20) // two OPEN demands
        const cancelledIgnored = new Decimal(0) // CANCELLED not included
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: openOnly.plus(cancelledIgnored),
        })
        expect(Number(r.grossDemand)).toBe(50)
        expect(Number(r.netRequirement)).toBe(50)
        expect(canonicalizeDemandSource('SALES_ORDER')).toBe('SALES')
    })

    it('10) MRP rerun idempotency of netting + planned supply not double-counted', () => {
        // First run creates planned supply of 40; second run must count it once as plannedSupply
        const first = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(40),
            plannedSupplyQty: new Decimal(0),
        })
        expect(Number(first.recommendedQty)).toBe(40)

        const afterPriorPlanned = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(40),
            plannedSupplyQty: new Decimal(40), // prior OPEN supply proposal
        })
        expect(Number(afterPriorPlanned.netRequirement)).toBe(0)
        expect(Number(afterPriorPlanned.recommendedQty)).toBe(0)

        // Same inputs always yield same outputs (pure function idempotency)
        const again = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(40),
            plannedSupplyQty: new Decimal(40),
        })
        expect(Number(again.netRequirement)).toBe(
            Number(afterPriorPlanned.netRequirement),
        )
        expect(again.recommendedAction).toBe('NONE')
    })

    it('suggestion explanation includes demand source, MOQ, lead time, warehouse', () => {
        const text = buildSuggestionExplanation({
            demandSource: 'SALES',
            reason: 'SHORTAGE',
            requiredDate: asOf,
            quantity: new Decimal(25),
            leadTimeDays: 7,
            moq: new Decimal(10),
            warehouseId: 'wh-1',
            preferredSupplierId: 'sup-1',
        })
        expect(text).toContain('Demand source: SALES')
        expect(text).toContain('Shortage reason: SHORTAGE')
        expect(text).toContain('MOQ: 10')
        expect(text).toContain('Lead time: 7')
        expect(text).toContain('Target warehouse: wh-1')
        expect(text).toContain('Suggested supplier: sup-1')
    })

    it('BOMProvider stub returns no components (no duplicate Production BOM)', async () => {
        const bom = new NullBomProvider()
        const result = await bom.explode({
            companyId: 'co-1',
            materialId: 'mat-1',
            quantity: 10,
        })
        expect(result.source).toBe('NONE')
        expect(result.components).toEqual([])
    })

    it('MAKE procurement recommends planned production action', () => {
        const r = computeNetting({
            ...base,
            unrestrictedQty: new Decimal(0),
            demandQty: new Decimal(5),
            procurementType: 'MAKE',
        })
        expect(r.recommendedAction).toBe('CREATE_PLANNED_PRODUCTION')
    })

    it('engine source does not import inventory posting', () => {
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
