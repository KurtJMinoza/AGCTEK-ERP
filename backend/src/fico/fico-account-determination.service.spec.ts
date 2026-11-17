import { BadRequestException } from '@nestjs/common'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { FicoAccountDeterminationService } from './fico-account-determination.service'

const payload: MmAccountingDispatchPayload = {
    schemaVersion: 'v2',
    eventType: 'GoodsReceiptPosted',
    companyId: 'company-1',
    postingDate: '2026-09-15T00:00:00.000Z',
    transactionDate: '2026-09-15T00:00:00.000Z',
    currencyCode: 'PHP',
    documentType: 'GOODS_RECEIPT',
    documentId: 'gr-1',
    sourceModule: 'MM',
    accountingEffects: ['INVENTORY_INCREASE', 'GRIR_ACCRUAL'],
    lines: [
        {
            materialId: 'material-1',
            valuationClassId: 'valuation-1',
            movementType: 'RECEIPT',
            quantity: 2,
            unitCost: 12.5,
            totalCost: 25,
        },
    ],
    financiallyRelevant: true,
}

describe('FicoAccountDeterminationService', () => {
    const postingValidation = {
        validate: jest.fn().mockResolvedValue({}),
    }
    const prisma = {
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn(),
        },
        ficoMmAccountMapping: {
            findMany: jest.fn(),
        },
    }
    let service: FicoAccountDeterminationService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new FicoAccountDeterminationService(
            prisma as never,
            postingValidation as never,
        )
    })

    it('keeps the documented legacy bridge for companies without FICO settings', async () => {
        prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue(null)

        await expect(service.resolveMmPosting(payload)).resolves.toBeNull()
        expect(prisma.ficoMmAccountMapping.findMany).not.toHaveBeenCalled()
    })

    it('rejects an inactive company accounting configuration', async () => {
        prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue({
            status: 'DRAFT',
            chartOfAccountsId: 'coa-1',
            chartOfAccounts: { id: 'coa-1', status: 'ACTIVE' },
            accountDeterminationProfileId: 'profile-1',
            accountDeterminationProfile: { id: 'profile-1', status: 'ACTIVE' },
        })

        await expect(service.resolveMmPosting(payload)).rejects.toBeInstanceOf(
            BadRequestException,
        )
    })

    it('uses valuation-specific mappings and validates both company accounts', async () => {
        prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue({
            status: 'ACTIVE',
            chartOfAccountsId: 'coa-1',
            chartOfAccounts: { id: 'coa-1', status: 'ACTIVE' },
            accountDeterminationProfileId: 'profile-1',
            accountDeterminationProfile: { id: 'profile-1', status: 'ACTIVE' },
        })
        prisma.ficoMmAccountMapping.findMany.mockResolvedValue([
            {
                valuationClassId: null,
                valuationScopeKey: '*',
                debitAccountId: 'inventory',
                creditAccountId: 'grir',
            },
            {
                valuationClassId: 'valuation-1',
                valuationScopeKey: 'TRADING',
                debitAccountId: 'specific-inventory',
                creditAccountId: 'specific-grir',
            },
        ])

        await expect(service.resolveMmPosting(payload)).resolves.toMatchObject([
            {
                debitAccountId: 'specific-inventory',
                creditAccountId: 'specific-grir',
                transactionKey: 'GR_IR',
            },
        ])
        expect(postingValidation.validate).toHaveBeenCalledWith(
            expect.objectContaining({ source: 'AUTOMATIC', companyId: 'company-1' }),
        )
    })
})
