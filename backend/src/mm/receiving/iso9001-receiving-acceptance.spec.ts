/**
 * ISO 9001 manual acceptance scenario (Step 23) — orchestration contract tests with mocks.
 * Validates quantity reconciliation logic without claiming organizational certification.
 */
import { BadRequestException } from '@nestjs/common'
import { QualityDecisionService } from './quality-decision.service'

describe('ISO 9001 receiving acceptance (quantity reconciliation)', () => {
    it('partial pass splits accepted and rejected without exceeding lot quantity', async () => {
        const posting = { postTransaction: jest.fn().mockResolvedValue({ id: 'txn' }) }
        const prisma: any = {
            mmQualityDecision: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(({ data }) => ({ id: 'd1', ...data })),
            },
            mmGoodsReceipt: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'gr1',
                    companyId: 'co',
                    warehouseId: 'wh',
                    supplierId: 'sup',
                    postingDate: new Date(),
                    documentDate: new Date(),
                    lines: [
                        {
                            id: 'grl1',
                            materialId: 'mat',
                            uomId: 'uom',
                            storageBinId: 'bin',
                            unitCost: 1,
                            material: { batchManaged: false, serialManaged: false },
                        },
                    ],
                }),
            },
            mmInspectionLot: {
                findUnique: jest.fn(),
                update: jest.fn().mockImplementation(({ data }) => ({ id: 'lot1', ...data })),
            },
            mmQualityInspection: { update: jest.fn() },
        }
        const svc = new QualityDecisionService(
            prisma,
            posting as any,
            { emit: jest.fn() } as any,
            {
                emit: jest.fn(),
                goodsIssuePosted: jest.fn(),
                qualityDecisionMade: jest.fn(),
            } as any,
            { create: jest.fn() } as any,
            { create: jest.fn() } as any,
            { requireApprovalIfConfigured: jest.fn().mockResolvedValue(null) } as any,
        )

        const lot = {
            id: 'lot1',
            companyId: 'co',
            warehouseId: 'wh',
            goodsReceiptId: 'gr1',
            goodsReceiptLineId: 'grl1',
            materialId: 'mat',
            quantity: 95,
            decidedQuantity: 0,
        }

        await svc.applyPartialPass(lot, {
            acceptedQuantity: 90,
            rejectedQuantity: 5,
            decidedBy: 'QA Inspector',
            idempotencyKey: 'acc-scenario',
        })

        expect(posting.postTransaction).toHaveBeenCalled()
        expect(prisma.mmQualityDecision.create).toHaveBeenCalled()
    })

    it('rejects partial pass when quantities exceed lot', async () => {
        const svc = new QualityDecisionService(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            { requireApprovalIfConfigured: jest.fn() } as any,
        )
        await expect(
            svc.applyPartialPass(
                {
                    id: 'lot1',
                    companyId: 'co',
                    warehouseId: 'wh',
                    goodsReceiptId: 'gr1',
                    goodsReceiptLineId: 'grl1',
                    materialId: 'mat',
                    quantity: 10,
                    decidedQuantity: 0,
                },
                { acceptedQuantity: 8, rejectedQuantity: 5 },
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
