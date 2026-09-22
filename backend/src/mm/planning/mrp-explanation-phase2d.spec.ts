/**
 * Phase 2D: Structured MRP explainability
 */
import { Decimal } from '@prisma/client/runtime/library'
import {
    buildBomDemandLines,
    buildIndependentDemandLines,
    buildMrpExplanation,
    demandLineLabel,
    renderExplanationSummary,
    resolveReasonSummary,
} from './mrp-explanation.builder'
import type { BomExplosionLine } from './bom-explosion.pure'
import type { PairSnapshot } from './mrp-scope-loader.service'
import type { ResolvedPlanningParams } from './reorder-rule.service'
import { computeNetting } from './mrp-netting.pure'
import { MRP_EXPLANATION_VERSION } from './mrp-explanation.types'

describe('MRP Explainability Phase 2D', () => {
    const baseParams: ResolvedPlanningParams = {
        reorderPoint: new Decimal(0),
        safetyStock: new Decimal(100),
        reorderQuantity: new Decimal(0),
        minimumOrderQuantity: new Decimal(25),
        minStock: new Decimal(0),
        maxStock: new Decimal(0),
        lotSize: new Decimal(10),
        reviewPeriodDays: 0,
        planningHorizonDays: null,
        planningStrategy: 'REORDER_POINT',
        procurementType: 'BUY',
        leadTimeDays: 7,
        source: 'RULE',
    }

    function buildCanonicalSnap(): PairSnapshot {
        return {
            unrestrictedQty: new Decimal(150),
            reservedQty: new Decimal(0),
            qualityQty: new Decimal(0),
            blockedQty: new Decimal(0),
            openingAvailable: new Decimal(150),
            demandQty: new Decimal(300),
            independentDemandQty: new Decimal(300),
            bomDependentDemandQty: new Decimal(0),
            incomingQty: new Decimal(50),
            plannedSupplyQty: new Decimal(0),
            productionSupplyQty: new Decimal(0),
            earliestDemandDate: new Date('2026-09-25T00:00:00.000Z'),
            demandSourceTypes: ['SALES', 'PRODUCTION'],
            demandIds: ['d1', 'd2'],
            independentDemandLines: [
                {
                    id: 'd1',
                    sourceType: 'SALES',
                    sourceDocumentId: 'SO-1001',
                    demandDate: new Date('2026-09-25T00:00:00.000Z'),
                    quantity: new Decimal(200),
                    warehouseId: 'wh-1',
                },
                {
                    id: 'd2',
                    sourceType: 'PRODUCTION',
                    sourceDocumentId: null,
                    demandDate: new Date('2026-09-25T00:00:00.000Z'),
                    quantity: new Decimal(100),
                    warehouseId: 'wh-1',
                },
            ],
            demandEvents: [
                {
                    date: new Date('2026-09-25T00:00:00.000Z'),
                    quantity: new Decimal(300),
                },
            ],
            supplyEvents: [],
            reservationEvents: [],
        }
    }

    it('canonical RM-001 example — gross 300, net 200, recommended 200', () => {
        const snap = buildCanonicalSnap()
        const net = computeNetting({
            unrestrictedQty: snap.unrestrictedQty,
            reservedQty: snap.reservedQty,
            qualityQty: snap.qualityQty,
            blockedQty: snap.blockedQty,
            demandQty: snap.demandQty,
            incomingQty: snap.incomingQty,
            plannedSupplyQty: snap.plannedSupplyQty,
            productionSupplyQty: snap.productionSupplyQty,
            safetyStock: baseParams.safetyStock,
            reorderPoint: baseParams.reorderPoint,
            minimumOrderQuantity: baseParams.minimumOrderQuantity,
            lotSize: baseParams.lotSize,
            reorderQuantity: baseParams.reorderQuantity,
            leadTimeDays: baseParams.leadTimeDays,
            includeOpenReceipts: true,
            asOf: new Date('2026-09-11T00:00:00.000Z'),
        })

        const explanation = buildMrpExplanation({
            materialCode: 'RM-001',
            materialName: 'Raw Material 001',
            warehouseCode: 'WH-01',
            warehouseId: 'wh-1',
            snap,
            net,
            params: baseParams,
            reasonCode: 'SHORTAGE',
            demandSource: 'MIXED',
            planningDate: new Date('2026-09-25T00:00:00.000Z'),
            independentDemandLines: snap.independentDemandLines,
        })

        expect(explanation.version).toBe(MRP_EXPLANATION_VERSION)
        expect(explanation.materialCode).toBe('RM-001')
        expect(explanation.grossDemand).toBe('300')
        expect(explanation.netRequirement).toBe('200')
        expect(explanation.recommendedQuantity).toBe('200')
        expect(explanation.demandLines).toHaveLength(2)
        expect(explanation.demandLines[0].label).toBe('SO-1001')
        expect(explanation.demandLines[0].quantity).toBe('200')
        expect(explanation.demandLines[1].label).toBe('Production')
        expect(explanation.demandLines[1].quantity).toBe('100')
        expect(explanation.sourceDemandReferences).toEqual(
            expect.arrayContaining(['SO-1001', 'Production']),
        )
    })

    it('demand line labels prefer sourceDocumentId over source type', () => {
        expect(demandLineLabel('SALES', 'SO-1001')).toBe('SO-1001')
        expect(demandLineLabel('PRODUCTION', null)).toBe('Production')
        expect(demandLineLabel('CUSTOM', null)).toBe('CUSTOM')
    })

    it('buildIndependentDemandLines maps warehouse-scoped rows', () => {
        const lines = buildIndependentDemandLines([
            {
                sourceType: 'SALES',
                sourceDocumentId: 'SO-1001',
                demandDate: new Date('2026-09-25T00:00:00.000Z'),
                quantity: new Decimal(200),
            },
        ])
        expect(lines[0]).toEqual({
            sourceType: 'SALES',
            label: 'SO-1001',
            sourceDocumentId: 'SO-1001',
            demandDate: '2026-09-25',
            quantity: '200',
        })
    })

    it('BOM demand lines include parent material code', () => {
        const bomLine: BomExplosionLine = {
            parentMaterialId: 'fg-1',
            componentMaterialId: 'rm-1',
            warehouseId: 'wh-1',
            level: 1,
            demandDate: new Date('2026-09-25T00:00:00.000Z'),
            parentDemandQty: new Decimal(10),
            quantityPer: new Decimal(2),
            grossComponentQty: new Decimal(20),
            uomId: 'uom-1',
            explosionReason: 'FG-001 demand 10 × 2',
        }
        const lines = buildBomDemandLines([bomLine], new Map([['fg-1', 'FG-001']]))
        expect(lines).toHaveLength(1)
        expect(lines[0].sourceType).toBe('BOM_EXPLOSION')
        expect(lines[0].label).toBe('FG-001 via BOM')
        expect(lines[0].quantity).toBe('20')
    })

    it('reason summaries map SHORTAGE/TIME_PHASED to safety stock message', () => {
        expect(resolveReasonSummary('SHORTAGE', 'TIME_PHASED')).toBe(
            'Projected availability falls below safety stock.',
        )
        expect(resolveReasonSummary('SHORTAGE', 'REORDER_POINT')).toBe(
            'Projected availability falls below gross demand.',
        )
        expect(resolveReasonSummary('BELOW_REORDER_POINT', 'REORDER_POINT')).toBe(
            'Available quantity falls below reorder point.',
        )
        expect(resolveReasonSummary('NET_REQUIREMENT', 'REORDER_POINT')).toBe(
            'Net requirement after supply netting.',
        )
    })

    it('renderExplanationSummary produces backward-compatible pipe-delimited prose', () => {
        const snap = buildCanonicalSnap()
        const net = computeNetting({
            unrestrictedQty: snap.unrestrictedQty,
            reservedQty: snap.reservedQty,
            qualityQty: snap.qualityQty,
            blockedQty: snap.blockedQty,
            demandQty: snap.demandQty,
            incomingQty: snap.incomingQty,
            plannedSupplyQty: snap.plannedSupplyQty,
            productionSupplyQty: snap.productionSupplyQty,
            safetyStock: baseParams.safetyStock,
            reorderPoint: baseParams.reorderPoint,
            minimumOrderQuantity: baseParams.minimumOrderQuantity,
            lotSize: baseParams.lotSize,
            reorderQuantity: baseParams.reorderQuantity,
            leadTimeDays: baseParams.leadTimeDays,
            includeOpenReceipts: true,
            asOf: new Date('2026-09-11T00:00:00.000Z'),
        })
        const explanation = buildMrpExplanation({
            materialCode: 'RM-001',
            warehouseId: 'wh-1',
            snap,
            net,
            params: baseParams,
            reasonCode: 'SHORTAGE',
            demandSource: 'MIXED',
            planningDate: new Date('2026-09-25T00:00:00.000Z'),
            independentDemandLines: snap.independentDemandLines,
            timePhased: {
                violationDate: new Date('2026-09-25T00:00:00.000Z'),
                projectedClosing: new Decimal(70),
                safetyStockViolation: new Decimal(30),
            },
        })
        const summary = renderExplanationSummary(explanation)
        expect(summary).toContain('Material: RM-001')
        expect(summary).toContain('SO-1001 = 200')
        expect(summary).toContain('Gross demand: 300')
        expect(summary).toContain('Recommended quantity: 200')
        expect(summary).toContain('Violation date: 2026-09-25')
        expect(summary).toContain('Projected closing: 70')
        expect(summary).toContain('Safety deficit: 30')
        expect(summary).toContain('|')
    })
})
