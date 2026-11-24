import { collectionPaymentBucket } from './monthly-collection.service'

describe('collectionPaymentBucket', () => {
    it('maps tender codes to Excel columns', () => {
        expect(collectionPaymentBucket('CASH')).toBe('cash')
        expect(collectionPaymentBucket('GCASH')).toBe('gcash')
        expect(collectionPaymentBucket('BANK_TRANSFER')).toBe('bankTransfer')
        expect(collectionPaymentBucket('CHEQUE')).toBe('cheque')
        expect(collectionPaymentBucket('SALARY_LOAN')).toBe('others')
    })
})