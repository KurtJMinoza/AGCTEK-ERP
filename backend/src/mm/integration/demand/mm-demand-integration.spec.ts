/**
 * Phase 3E: Generic MM demand integration contract
 */
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import { DemandIntegrationService } from './demand-integration.service'
import { MmDemandAggregationService } from './mm-demand-aggregation.service'
import { MM_DEMAND_PROVIDERS } from './mm-demand-provider.port'
import { MmDemandRegistryService } from './mm-demand-registry.service'
import { MmDemandSyncService } from './mm-demand-sync.service'
import { MM_DEMAND_MODULES } from './mm-demand.types'
import { buildDemandReferenceKey } from './mm-demand.util'

describe('MM Demand Integration (Phase 3E)', () => {
    const demandStore = new Map<string, any>()

    const mockPrisma: any = {
        mmPlanningDemand: {
            upsert: jest.fn(({ where, create, update }: any) => {
                const key = where.demandReferenceKey
                const existing = demandStore.get(key)
                if (existing) {
                    const row = { ...existing, ...update }
                    demandStore.set(key, row)
                    return Promise.resolve(row)
                }
                const row = { id: `pd-${demandStore.size + 1}`, ...create }
                demandStore.set(key, row)
                return Promise.resolve(row)
            }),
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(demandStore.get(where.demandReferenceKey) ?? null),
            ),
            update: jest.fn(({ where, data }: any) => {
                const row = demandStore.get(where.demandReferenceKey)
                if (!row) return Promise.resolve(null)
                const updated = { ...row, ...data }
                demandStore.set(where.demandReferenceKey, updated)
                return Promise.resolve(updated)
            }),
            updateMany: jest.fn(({ where, data }: any) => {
                let count = 0
                for (const [key, row] of demandStore.entries()) {
                    if (
                        row.sourceModule === where.sourceModule &&
                        row.sourceDocumentType === where.sourceDocumentType &&
                        row.sourceDocumentId === where.sourceDocumentId &&
                        row.status === where.status
                    ) {
                        demandStore.set(key, { ...row, ...data })
                        count++
                    }
                }
                return Promise.resolve({ count })
            }),
            findMany: jest.fn(({ where }: any) => {
                const rows = [...demandStore.values()].filter((row) => {
                    if (where.companyId && row.companyId !== where.companyId)
                        return false
                    if (
                        where.sourceModule &&
                        row.sourceModule !== where.sourceModule
                    )
                        return false
                    if (
                        where.demandReferenceKey === null &&
                        row.demandReferenceKey != null
                    )
                        return false
                    if (where.status?.in && !where.status.in.includes(row.status))
                        return false
                    return true
                })
                return Promise.resolve(
                    rows.map((r) => ({
                        ...r,
                        material: { baseUomId: r.uomId ?? 'uom-1' },
                    })),
                )
            }),
        },
    }

    beforeEach(() => {
        demandStore.clear()
        jest.clearAllMocks()
    })

    describe('buildDemandReferenceKey', () => {
        it('builds stable module:type:doc:line keys', () => {
            expect(
                buildDemandReferenceKey(
                    'SD',
                    'SALES_ORDER',
                    'so-1',
                    'line-1',
                ),
            ).toBe('SD:SALES_ORDER:so-1:line-1')
        })
    })

    describe('MmDemandSyncService', () => {
        let sync: MmDemandSyncService

        beforeEach(async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MmDemandSyncService,
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            sync = module.get(MmDemandSyncService)
        })

        it('upserts idempotently by demandReferenceKey', async () => {
            const input = {
                sourceModule: MM_DEMAND_MODULES.MAINTENANCE,
                sourceDocumentType: 'WORK_ORDER',
                sourceDocumentId: 'wo-1',
                sourceDocumentLineId: 'part-1',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                requiredDate: new Date('2026-10-01'),
                quantity: 5,
                uomId: 'uom-1',
                priority: 80,
                status: 'OPEN' as const,
            }
            await sync.upsertLine(input)
            await sync.upsertLine({ ...input, quantity: 8 })

            expect(demandStore.size).toBe(1)
            expect(
                [...demandStore.values()][0].quantity.toString(),
            ).toBe('8')
        })

        it('cancels by source document', async () => {
            const key = buildDemandReferenceKey(
                MM_DEMAND_MODULES.PROJECTS,
                'PROJECT',
                'prj-1',
                'line-1',
            )
            demandStore.set(key, {
                id: 'pd-1',
                demandReferenceKey: key,
                sourceModule: MM_DEMAND_MODULES.PROJECTS,
                sourceDocumentType: 'PROJECT',
                sourceDocumentId: 'prj-1',
                status: 'OPEN',
            })
            await sync.cancelBySourceDocument(
                MM_DEMAND_MODULES.PROJECTS,
                'PROJECT',
                'prj-1',
            )
            expect(demandStore.get(key).status).toBe('CANCELLED')
        })
    })

    describe('MmDemandRegistryService', () => {
        it('aggregates all registered providers', async () => {
            const providerA = {
                moduleId: 'A',
                listOpenDemand: jest.fn().mockResolvedValue([
                    {
                        sourceModule: 'A',
                        sourceDocumentType: 'DOC',
                        sourceDocumentId: 'd1',
                        companyId: 'co-1',
                        materialId: 'mat-1',
                        requiredDate: new Date('2026-10-05'),
                        quantity: 1,
                        uomId: 'uom-1',
                        priority: 10,
                        status: 'OPEN',
                        demandReferenceKey: 'A:DOC:d1',
                    },
                ]),
            }
            const providerB = {
                moduleId: 'B',
                listOpenDemand: jest.fn().mockResolvedValue([
                    {
                        sourceModule: 'B',
                        sourceDocumentType: 'DOC',
                        sourceDocumentId: 'd2',
                        companyId: 'co-1',
                        materialId: 'mat-2',
                        requiredDate: new Date('2026-10-01'),
                        quantity: 2,
                        uomId: 'uom-1',
                        priority: 50,
                        status: 'OPEN',
                        demandReferenceKey: 'B:DOC:d2',
                    },
                ]),
            }

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MmDemandRegistryService,
                    { provide: MM_DEMAND_PROVIDERS, useValue: [providerA, providerB] },
                ],
            }).compile()
            const registry = module.get(MmDemandRegistryService)

            const lines = await registry.listOpenDemand({
                companyId: 'co-1',
                materialIds: ['mat-1', 'mat-2'],
                warehouseIds: ['wh-1'],
                asOf: new Date('2026-10-01'),
                horizonEnd: new Date('2026-12-31'),
            })

            expect(lines).toHaveLength(2)
            expect(lines[0].sourceModule).toBe('A')
            expect(providerA.listOpenDemand).toHaveBeenCalled()
            expect(providerB.listOpenDemand).toHaveBeenCalled()
        })
    })

    describe('MmDemandAggregationService', () => {
        it('merges provider lines with manual planning demands', async () => {
            const providerLine = {
                sourceModule: MM_DEMAND_MODULES.SD,
                sourceDocumentType: 'SALES_ORDER',
                sourceDocumentId: 'so-1',
                sourceDocumentLineId: 'line-1',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                requiredDate: new Date('2026-10-15'),
                quantity: 10,
                uomId: 'uom-1',
                priority: 50,
                status: 'OPEN' as const,
                demandReferenceKey: 'SD:SALES_ORDER:so-1:line-1',
                sourceType: 'SALES',
            }

            const mockRegistry = {
                listOpenDemand: jest.fn().mockResolvedValue([providerLine]),
            }

            demandStore.set('manual-1', {
                id: 'manual-1',
                companyId: 'co-1',
                materialId: 'mat-2',
                sourceModule: 'MM',
                sourceDocumentType: 'MANUAL',
                sourceDocumentId: null,
                sourceDocumentLineId: null,
                sourceType: 'MANUAL_INTERNAL',
                demandDate: new Date('2026-10-20'),
                quantity: new Decimal(3),
                warehouseId: 'wh-1',
                plantId: null,
                uomId: 'uom-1',
                priority: 100,
                status: 'OPEN',
                demandReferenceKey: null,
            })

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MmDemandAggregationService,
                    { provide: MmDemandRegistryService, useValue: mockRegistry },
                    { provide: PrismaService, useValue: mockPrisma },
                ],
            }).compile()
            const aggregation = module.get(MmDemandAggregationService)

            const rows = await aggregation.loadForMrp({
                companyId: 'co-1',
                materialIds: ['mat-1', 'mat-2'],
                warehouseIds: ['wh-1'],
                asOf: new Date('2026-10-01'),
                horizonEnd: new Date('2026-12-31'),
            })

            expect(rows).toHaveLength(2)
            expect(rows.some((r) => r.sourceModule === MM_DEMAND_MODULES.SD)).toBe(
                true,
            )
            expect(rows.some((r) => r.id === 'manual-1')).toBe(true)
        })
    })

    describe('DemandIntegrationService', () => {
        let service: DemandIntegrationService

        beforeEach(async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    DemandIntegrationService,
                    MmDemandSyncService,
                    MmDemandRegistryService,
                    MmDemandAggregationService,
                    { provide: PrismaService, useValue: mockPrisma },
                    { provide: MM_DEMAND_PROVIDERS, useValue: [] },
                ],
            }).compile()
            service = module.get(DemandIntegrationService)
        })

        it('rejects direct sync for SD (must use provider/events)', () => {
            expect(() =>
                service.assertSyncAllowed(MM_DEMAND_MODULES.SD),
            ).toThrow(BadRequestException)
        })

        it('allows maintenance sync via API', async () => {
            const row = await service.syncLine({
                sourceModule: MM_DEMAND_MODULES.MAINTENANCE,
                sourceDocumentType: 'WORK_ORDER',
                sourceDocumentId: 'wo-99',
                sourceDocumentLineId: 'part-1',
                companyId: 'co-1',
                materialId: 'mat-1',
                warehouseId: 'wh-1',
                requiredDate: '2026-10-01',
                quantity: 4,
                uomId: 'uom-1',
                priority: 70,
            })
            expect(row).not.toBeNull()
            expect(row!.sourceModule).toBe(MM_DEMAND_MODULES.MAINTENANCE)
        })
    })
})
