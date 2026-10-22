/**
 * The ledger shows a "Reference" column instead of raw source ids, so the
 * resolver must map a posting's origin pointer onto the business number of
 * the document that caused it — and must never break the ledger when it
 * cannot.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { InventorySourceReferenceResolver } from './inventory-source-reference.resolver'
import { PrismaService } from '../../prisma/prisma.service'

describe('InventorySourceReferenceResolver', () => {
    let resolver: InventorySourceReferenceResolver
    let mockPrisma: Record<string, unknown>

    const rows = (
        list: { id: string; value: string | null }[],
        field: string,
    ) =>
        list.map((r) => ({
            id: r.id,
            [field]: r.value,
        }))

    beforeEach(async () => {
        mockPrisma = {
            mmGoodsReceipt: {
                findMany: jest.fn().mockResolvedValue(
                    rows(
                        [{ id: 'gr-1', value: 'GR-2026-00012' }],
                        'documentNumber',
                    ),
                ),
            },
            sdSalesOrder: {
                findMany: jest.fn().mockResolvedValue(
                    rows(
                        [{ id: 'so-1', value: 'SO-000045' }],
                        'orderNumber',
                    ),
                ),
            },
            mmMaterial: {
                findMany: jest.fn().mockResolvedValue(
                    rows(
                        [{ id: 'mat-1', value: 'MAT-000010' }],
                        'materialCode',
                    ),
                ),
            },
        }

        const testingModule: TestingModule = await Test.createTestingModule({
            providers: [
                InventorySourceReferenceResolver,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()

        resolver = testingModule.get(InventorySourceReferenceResolver)
    })

    it('resolves a goods receipt to its document number', async () => {
        const map = await resolver.resolve([
            { sourceDocumentType: 'GOODS_RECEIPT', sourceDocumentId: 'gr-1' },
        ])

        expect(map.get('GOODS_RECEIPT::gr-1')).toBe('GR-2026-00012')
    })

    it('resolves a sales order to its order number', async () => {
        const map = await resolver.resolve([
            { sourceDocumentType: 'SALES_ORDER', sourceDocumentId: 'so-1' },
        ])

        expect(map.get('SALES_ORDER::so-1')).toBe('SO-000045')
    })

    it('resolves a stock level edit to the material code', async () => {
        const map = await resolver.resolve([
            {
                sourceDocumentType: 'MATERIAL_STOCK_THRESHOLD',
                sourceDocumentId: 'mat-1',
            },
        ])

        expect(map.get('MATERIAL_STOCK_THRESHOLD::mat-1')).toBe('MAT-000010')
    })

    it('skips pointers it cannot map and never throws', async () => {
        const map = await resolver.resolve([
            { sourceDocumentType: 'MANUAL', sourceDocumentId: 'anything' },
            { sourceDocumentType: null, sourceDocumentId: null },
            { sourceDocumentType: 'GOODS_RECEIPT', sourceDocumentId: null },
        ])

        expect(map.size).toBe(0)
    })

    it('does not fail the ledger when a source table is unavailable', async () => {
        ;(mockPrisma.mmGoodsReceipt as { findMany: jest.Mock }).findMany.mockRejectedValue(
            new Error('relation is down'),
        )

        await expect(
            resolver.resolve([
                {
                    sourceDocumentType: 'GOODS_RECEIPT',
                    sourceDocumentId: 'gr-1',
                },
            ]),
        ).resolves.toBeInstanceOf(Map)
    })
})
