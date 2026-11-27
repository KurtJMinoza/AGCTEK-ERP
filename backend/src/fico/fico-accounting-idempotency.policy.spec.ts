import {
    ficoBuildAccountingIdempotencyKey,
    ficoDerivePostingPurpose,
} from './fico-accounting-idempotency.policy'

describe('fico-accounting-idempotency.policy', () => {
    it('builds stable keys from company scope and posting purpose', () => {
        const key = ficoBuildAccountingIdempotencyKey({
            companyId: 'co-1',
            sourceModule: 'MM',
            sourceDocumentType: 'INVENTORY_TXN',
            sourceDocumentId: 'txn-1',
            postingPurpose: 'GRIR_ACCRUAL|INVENTORY_INCREASE',
            businessOccurrenceId: 'imm-1',
        })
        expect(key).toBe(
            'co-1:MM:INVENTORY_TXN:txn-1:GRIR_ACCRUAL|INVENTORY_INCREASE:imm-1',
        )
        expect(
            ficoBuildAccountingIdempotencyKey({
                companyId: 'co-1',
                sourceModule: 'MM',
                sourceDocumentType: 'INVENTORY_TXN',
                sourceDocumentId: 'txn-1',
                postingPurpose: 'COGS_EXPENSE',
                businessOccurrenceId: 'imm-1',
            }),
        ).not.toBe(key)
    })

    it('derives posting purpose from accounting effects', () => {
        expect(
            ficoDerivePostingPurpose('GoodsReceiptPosted', [
                'GRIR_ACCRUAL',
                'INVENTORY_INCREASE',
            ]),
        ).toBe('GRIR_ACCRUAL|INVENTORY_INCREASE')
    })
})