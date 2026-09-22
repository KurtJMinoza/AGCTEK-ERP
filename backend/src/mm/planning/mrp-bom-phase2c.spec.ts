/**
 * Phase 2C: Multi-level BOM integration for MRP
 */
import { Decimal } from '@prisma/client/runtime/library'
import { Test, TestingModule } from '@nestjs/testing'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NullBomProvider } from './bom-provider'
import {
    InMemoryBomProvider,
    type InMemoryBomEntry,
} from './in-memory-bom.provider'
import {
    computeComponentQuantityPure,
    DefaultBomQuantityCalculator,
} from './bom-quantity.calculator'
import {
    aggregateDependentDemands,
    isBomHeaderActive,
    isComponentLineActive,
    walkBomExplosion,
} from './bom-explosion.pure'
import { BomExplosionService } from './bom-explosion.service'
import { computeNetting } from './mrp-netting.pure'
import { PrismaService } from '../../prisma/prisma.service'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'

describe('MRP BOM Phase 2C', () => {
    const asOf = new Date('2026-09-15T00:00:00.000Z')
    const demandDate = new Date('2026-09-20T00:00:00.000Z')

    const materialCodes = new Map([
        ['fg-1', 'FG-001'],
        ['rm-1', 'RM-001'],
        ['rm-2', 'RM-002'],
        ['sa-1', 'SA-001'],
    ])
    const materialBaseUom = new Map([
        ['fg-1', 'uom-ea'],
        ['rm-1', 'uom-ea'],
        ['rm-2', 'uom-ea'],
        ['sa-1', 'uom-ea'],
    ])
    const knownMaterialIds = new Set(['fg-1', 'rm-1', 'rm-2', 'sa-1'])

    function singleLevelBom(): InMemoryBomProvider {
        const entries: InMemoryBomEntry[] = [
            {
                header: {
                    bomId: 'bom-fg',
                    parentMaterialId: 'fg-1',
                    status: 'ACTIVE',
                    yieldFactor: 1,
                },
                components: [
                    {
                        lineId: 'l1',
                        componentMaterialId: 'rm-1',
                        quantityPer: 2,
                        uomId: 'uom-ea',
                    },
                    {
                        lineId: 'l2',
                        componentMaterialId: 'rm-2',
                        quantityPer: 3,
                        uomId: 'uom-ea',
                    },
                ],
            },
        ]
        return InMemoryBomProvider.fromEntries(entries)
    }

    function multiLevelBom(): InMemoryBomProvider {
        return InMemoryBomProvider.fromEntries([
            {
                header: {
                    bomId: 'bom-fg',
                    parentMaterialId: 'fg-1',
                    status: 'ACTIVE',
                },
                components: [
                    {
                        lineId: 'l1',
                        componentMaterialId: 'sa-1',
                        quantityPer: 2,
                        uomId: 'uom-ea',
                    },
                ],
            },
            {
                header: {
                    bomId: 'bom-sa',
                    parentMaterialId: 'sa-1',
                    status: 'ACTIVE',
                },
                components: [
                    {
                        lineId: 'l2',
                        componentMaterialId: 'rm-1',
                        quantityPer: 4,
                        uomId: 'uom-ea',
                    },
                ],
            },
        ])
    }

    async function explodeWithProvider(
        provider: InMemoryBomProvider,
        parentQty: number,
        mode: 'singleLevel' | 'multiLevel' = 'multiLevel',
    ) {
        const bomMap = new Map<string, InMemoryBomEntry>()
        for (const id of ['fg-1', 'sa-1']) {
            const h = await provider.getBomHeader({
                companyId: 'co-1',
                materialId: id,
            })
            const c = await provider.listComponents({
                companyId: 'co-1',
                materialId: id,
            })
            if (h) bomMap.set(id, { header: h, components: c })
        }

        return walkBomExplosion({
            parentMaterialId: 'fg-1',
            parentMaterialCode: 'FG-001',
            parentQuantity: new Decimal(parentQty),
            warehouseId: 'wh-1',
            demandDate,
            level: 1,
            asOf,
            mode,
            visitedPath: [],
            materialCodes,
            materialBaseUom,
            knownMaterialIds,
            convertUom: async (_m, from, to, qty) =>
                from === to ? qty : qty,
            getBom: async (materialId) => {
                const entry = bomMap.get(materialId)
                if (entry) return entry
                const h = await provider.getBomHeader({
                    companyId: 'co-1',
                    materialId,
                })
                const c = await provider.listComponents({
                    companyId: 'co-1',
                    materialId,
                })
                return { header: h, components: c }
            },
        })
    }

    it('single-level BOM: FG-001 demand 100 → RM-001=200, RM-002=300', async () => {
        const { lines } = await explodeWithProvider(
            singleLevelBom(),
            100,
            'singleLevel',
        )
        const rm1 = lines.find((l) => l.componentMaterialId === 'rm-1')
        const rm2 = lines.find((l) => l.componentMaterialId === 'rm-2')
        expect(Number(rm1?.grossComponentQty)).toBe(200)
        expect(Number(rm2?.grossComponentQty)).toBe(300)
        expect(rm1?.explosionReason).toContain('FG-001')
    })

    it('multi-level BOM: FG → SA → RM', async () => {
        const { lines } = await explodeWithProvider(multiLevelBom(), 10)
        const sa = lines.find(
            (l) => l.componentMaterialId === 'sa-1' && l.level === 1,
        )
        const rm = lines.find(
            (l) => l.componentMaterialId === 'rm-1' && l.level === 2,
        )
        expect(Number(sa?.grossComponentQty)).toBe(20)
        expect(Number(rm?.grossComponentQty)).toBe(80)
    })

    it('component shortage nets positive requirement', () => {
        const net = computeNetting({
            unrestrictedQty: new Decimal(50),
            reservedQty: new Decimal(0),
            qualityQty: new Decimal(0),
            blockedQty: new Decimal(0),
            incomingQty: new Decimal(0),
            demandQty: new Decimal(200),
            safetyStock: new Decimal(0),
            reorderPoint: new Decimal(0),
            reorderQuantity: new Decimal(0),
            minimumOrderQuantity: new Decimal(0),
            leadTimeDays: 0,
            includeOpenReceipts: true,
        })
        expect(Number(net.netRequirement)).toBe(150)
        expect(net.shortage).toBe(true)
    })

    it('component open PO offsets net requirement', () => {
        const net = computeNetting({
            unrestrictedQty: new Decimal(50),
            reservedQty: new Decimal(0),
            qualityQty: new Decimal(0),
            blockedQty: new Decimal(0),
            incomingQty: new Decimal(100),
            demandQty: new Decimal(200),
            safetyStock: new Decimal(0),
            reorderPoint: new Decimal(0),
            reorderQuantity: new Decimal(0),
            minimumOrderQuantity: new Decimal(0),
            leadTimeDays: 0,
            includeOpenReceipts: true,
        })
        expect(Number(net.netRequirement)).toBe(50)
    })

    it('yield factor increases gross component qty', () => {
        const base = computeComponentQuantityPure({
            parentQuantity: new Decimal(100),
            quantityPer: new Decimal(2),
            bomYieldFactor: new Decimal(1),
        })
        const withYield = computeComponentQuantityPure({
            parentQuantity: new Decimal(100),
            quantityPer: new Decimal(2),
            bomYieldFactor: new Decimal(0.9),
        })
        expect(Number(withYield)).toBeGreaterThan(Number(base))
        expect(Number(withYield)).toBeCloseTo(222.22, 1)
    })

    it('scrap factor increases gross component qty', () => {
        const base = computeComponentQuantityPure({
            parentQuantity: new Decimal(100),
            quantityPer: new Decimal(2),
        })
        const withScrap = computeComponentQuantityPure({
            parentQuantity: new Decimal(100),
            quantityPer: new Decimal(2),
            componentScrapFactor: new Decimal(0.05),
        })
        expect(Number(withScrap)).toBe(210)
        expect(Number(withScrap)).toBeGreaterThan(Number(base))
    })

    it('inactive BOM produces no lines', async () => {
        const provider = InMemoryBomProvider.fromEntries([
            {
                header: {
                    bomId: 'bom-fg',
                    parentMaterialId: 'fg-1',
                    status: 'INACTIVE',
                },
                components: [
                    {
                        lineId: 'l1',
                        componentMaterialId: 'rm-1',
                        quantityPer: 2,
                        uomId: 'uom-ea',
                    },
                ],
            },
        ])
        const { lines, warnings } = await explodeWithProvider(
            provider,
            100,
            'singleLevel',
        )
        expect(lines).toHaveLength(0)
        expect(warnings.some((w) => w.code === 'INACTIVE_BOM')).toBe(true)
    })

    it('effective date outside asOf skips BOM', () => {
        expect(
            isBomHeaderActive(
                {
                    bomId: 'b1',
                    parentMaterialId: 'fg-1',
                    status: 'ACTIVE',
                    effectiveFrom: new Date('2027-01-01'),
                },
                asOf,
            ),
        ).toBe(false)
    })

    it('circular BOM detected', async () => {
        const provider = InMemoryBomProvider.fromEntries([
            {
                header: {
                    bomId: 'bom-a',
                    parentMaterialId: 'fg-1',
                    status: 'ACTIVE',
                },
                components: [
                    {
                        lineId: 'l1',
                        componentMaterialId: 'rm-1',
                        quantityPer: 1,
                        uomId: 'uom-ea',
                    },
                ],
            },
            {
                header: {
                    bomId: 'bom-b',
                    parentMaterialId: 'rm-1',
                    status: 'ACTIVE',
                },
                components: [
                    {
                        lineId: 'l2',
                        componentMaterialId: 'fg-1',
                        quantityPer: 1,
                        uomId: 'uom-ea',
                    },
                ],
            },
        ])
        const { warnings } = await walkBomExplosion({
            parentMaterialId: 'fg-1',
            parentMaterialCode: 'FG-001',
            parentQuantity: new Decimal(10),
            warehouseId: 'wh-1',
            demandDate,
            level: 1,
            asOf,
            mode: 'multiLevel',
            visitedPath: [],
            materialCodes,
            materialBaseUom,
            knownMaterialIds: new Set(['fg-1', 'rm-1']),
            convertUom: async (_m, _f, _t, qty) => qty,
            getBom: async (materialId) => {
                const h = await provider.getBomHeader({
                    companyId: 'co-1',
                    materialId,
                })
                const c = await provider.listComponents({
                    companyId: 'co-1',
                    materialId,
                })
                return { header: h, components: c }
            },
        })
        expect(warnings.some((w) => w.code === 'CIRCULAR_BOM')).toBe(true)
    })

    it('missing material skipped with warning', async () => {
        const provider = singleLevelBom()
        const { lines, warnings } = await walkBomExplosion({
            parentMaterialId: 'fg-1',
            parentMaterialCode: 'FG-001',
            parentQuantity: new Decimal(100),
            warehouseId: 'wh-1',
            demandDate,
            level: 1,
            asOf,
            mode: 'singleLevel',
            visitedPath: [],
            materialCodes,
            materialBaseUom,
            knownMaterialIds: new Set(['fg-1']),
            convertUom: async (_m, _f, _t, qty) => qty,
            getBom: async (materialId) => ({
                header: await provider.getBomHeader({
                    companyId: 'co-1',
                    materialId,
                }),
                components: await provider.listComponents({
                    companyId: 'co-1',
                    materialId,
                }),
            }),
        })
        expect(lines).toHaveLength(0)
        expect(warnings.some((w) => w.code === 'MISSING_MATERIAL')).toBe(true)
    })

    it('UOM conversion applied via service', async () => {
        const convertUom = jest
            .fn()
            .mockImplementation(async (_m, from, to, qty) => {
                if (from === 'uom-box' && to === 'uom-ea') {
                    return new Decimal(qty).mul(12)
                }
                return qty
            })

        const provider = InMemoryBomProvider.fromEntries([
            {
                header: {
                    bomId: 'bom-fg',
                    parentMaterialId: 'fg-1',
                    status: 'ACTIVE',
                },
                components: [
                    {
                        lineId: 'l1',
                        componentMaterialId: 'rm-1',
                        quantityPer: 2,
                        uomId: 'uom-box',
                    },
                ],
            },
        ])

        const { lines } = await walkBomExplosion({
            parentMaterialId: 'fg-1',
            parentMaterialCode: 'FG-001',
            parentQuantity: new Decimal(10),
            warehouseId: 'wh-1',
            demandDate,
            level: 1,
            asOf,
            mode: 'singleLevel',
            visitedPath: [],
            materialCodes,
            materialBaseUom,
            knownMaterialIds,
            convertUom,
            getBom: async (materialId) => ({
                header: await provider.getBomHeader({
                    companyId: 'co-1',
                    materialId,
                }),
                components: await provider.listComponents({
                    companyId: 'co-1',
                    materialId,
                }),
            }),
        })
        expect(convertUom).toHaveBeenCalled()
        expect(Number(lines[0]?.grossComponentQty)).toBe(240)
    })

    it('aggregateDependentDemands sums by pair', () => {
        const lines = [
            {
                parentMaterialId: 'fg-1',
                componentMaterialId: 'rm-1',
                warehouseId: 'wh-1',
                demandDate,
                level: 1,
                parentDemandQty: new Decimal(100),
                quantityPer: new Decimal(2),
                grossComponentQty: new Decimal(200),
                uomId: 'uom-ea',
                explosionReason: 'test',
            },
        ]
        const map = aggregateDependentDemands(lines)
        const key = 'wh-1:rm-1'
        expect(map.get(key)?.[0].quantity.toString()).toBe('200')
    })

    it('NullBomProvider returns empty explosion from service', async () => {
        const prisma = {
            mmMaterial: { findMany: jest.fn().mockResolvedValue([]) },
        }
        const uom = { convertQuantity: jest.fn() }
        const service = new BomExplosionService(
            prisma as unknown as PrismaService,
            uom as unknown as UomConversionsService,
            new NullBomProvider(),
        )
        const result = await service.explodeFromDemands({
            companyId: 'co-1',
            warehouseIds: ['wh-1'],
            demands: [],
            asOf,
        })
        expect(result.lines).toHaveLength(0)
        expect(result.componentMaterialIds).toHaveLength(0)
    })

    it('DefaultBomQuantityCalculator matches pure helper', () => {
        const calc = new DefaultBomQuantityCalculator()
        const input = {
            parentQuantity: new Decimal(100),
            quantityPer: new Decimal(2),
            componentScrapFactor: new Decimal(0.05),
        }
        expect(calc.computeComponentQuantity(input).toString()).toBe(
            computeComponentQuantityPure(input).toString(),
        )
    })

    it('MRP engine does not import InventoryPostingService', () => {
        const src = readFileSync(
            join(__dirname, 'mrp-engine.service.ts'),
            'utf8',
        )
        expect(src).not.toMatch(/InventoryPostingService/)
    })

    it('inactive component line skipped', () => {
        expect(
            isComponentLineActive(
                {
                    lineId: 'l1',
                    componentMaterialId: 'rm-1',
                    quantityPer: 1,
                    uomId: 'uom-ea',
                    status: 'INACTIVE',
                },
                asOf,
            ),
        ).toBe(false)
    })
})
