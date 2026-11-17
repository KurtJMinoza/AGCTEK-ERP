import { allocateTenders, allocatePartialTenders } from './pos-tender'

describe('POS tender allocation', () => {
    it('rejects a sale without tenders', () => {
        expect(() => allocateTenders(1000, [])).toThrow(
            'Add at least one payment method',
        )
    })

    it('rejects tenders that do not cover the amount due', () => {
        expect(() =>
            allocateTenders(5000, [{ method: 'CASH', amount: 2000 }]),
        ).toThrow('The tenders cover 2000 of 5000')
    })

    it('rejects a tender that exceeds the remaining balance', () => {
        expect(() =>
            allocateTenders(3000, [
                { method: 'CASH', amount: 2000 },
                { method: 'CASH', amount: 2000 },
            ]),
        ).toThrow('only 1000 is still due')
    })

    it('returns cash change when the customer hands over more', () => {
        const result = allocateTenders(2450, [
            { method: 'CASH', amount: 2450, tenderAmount: 3000 },
        ])
        expect(result.change).toBe(550)
        expect(result.totalTendered).toBe(3000)
        expect(result.tenders[0].status).toBe('Paid')
        expect(result.tenders[0].verificationStatus).toBe('VERIFIED')
    })

    it('rejects cash received below the amount it covers', () => {
        expect(() =>
            allocateTenders(2450, [
                { method: 'CASH', amount: 2450, tenderAmount: 2000 },
            ]),
        ).toThrow('cash received is less than the amount it covers')
    })

    it('splits a sale across cash, GCash and bank transfer', () => {
        const result = allocateTenders(5000, [
            { method: 'CASH', amount: 2000 },
            {
                method: 'GCASH',
                amount: 2000,
                referenceNumber: 'GC-9911',
                verifiedBy: 'cashier-1',
            },
            {
                method: 'BANK_TRANSFER',
                amount: 1000,
                referenceNumber: 'BT-2211',
                bankName: 'BDO',
                transactionDate: '2026-11-12',
                verifiedBy: 'cashier-1',
            },
        ])
        expect(result.totalApplied).toBe(5000)
        expect(result.change).toBe(0)
        expect(result.tenders).toHaveLength(3)
    })

    it('requires a GCash reference number', () => {
        expect(() =>
            allocateTenders(1000, [{ method: 'GCASH', amount: 1000 }]),
        ).toThrow('GCash reference number is required')
    })

    it('keeps an unverified e-wallet tender pending', () => {
        const result = allocateTenders(1000, [
            { method: 'GCASH', amount: 1000, referenceNumber: 'GC-1' },
        ])
        expect(result.tenders[0].status).toBe('Pending Verification')
        expect(result.tenders[0].verificationStatus).toBe('PENDING')
    })

    it('requires bank name and transaction date for a bank transfer', () => {
        expect(() =>
            allocateTenders(1000, [
                {
                    method: 'BANK_TRANSFER',
                    amount: 1000,
                    referenceNumber: 'BT-1',
                },
            ]),
        ).toThrow('a bank name is required')
        expect(() =>
            allocateTenders(1000, [
                {
                    method: 'BANK_TRANSFER',
                    amount: 1000,
                    referenceNumber: 'BT-1',
                    bankName: 'BDO',
                },
            ]),
        ).toThrow('the transaction date is required')
    })

    it('treats a salary deduction as a receivable, not cash', () => {
        const result = allocateTenders(1000, [
            {
                method: 'SALARY_LOAN',
                amount: 1000,
                employeeNumber: 'EMP-001',
                payrollReference: 'PR-2026-11',
            },
        ])
        expect(result.tenders[0].status).toBe('Authorized')
        expect(result.tenders[0].verificationStatus).toBe('RECEIVABLE')
        expect(result.tenders[0].paidAt).toBeNull()
    })

    it('rejects an unsupported payment method', () => {
        expect(() =>
            allocateTenders(1000, [{ method: 'CRYPTO', amount: 1000 }]),
        ).toThrow('is not a supported payment method')
    })
})

describe('POS partial tender allocation', () => {
    it('allows a 50% down payment', () => {
        const result = allocatePartialTenders(10000, 5000, [
            { method: 'CASH', amount: 5000 },
        ])
        expect(result.totalApplied).toBe(5000)
        expect(result.outstandingBalance).toBe(5000)
        expect(result.change).toBe(0)
    })

    it('allows a 30% down payment with split tenders', () => {
        const result = allocatePartialTenders(10000, 3000, [
            { method: 'CASH', amount: 1500 },
            { method: 'GCASH', amount: 1500, referenceNumber: 'GC-1', verifiedBy: 'cashier' },
        ])
        expect(result.totalApplied).toBe(3000)
        expect(result.outstandingBalance).toBe(7000)
    })

    it('allows a custom ₱2,500 down payment on ₱8,500 order', () => {
        const result = allocatePartialTenders(8500, 2500, [
            { method: 'CASH', amount: 2500 },
        ])
        expect(result.totalApplied).toBe(2500)
        expect(result.outstandingBalance).toBe(6000)
    })

    it('100% down payment resolves to zero outstanding', () => {
        const result = allocatePartialTenders(10000, 10000, [
            { method: 'CASH', amount: 10000 },
        ])
        expect(result.outstandingBalance).toBe(0)
    })

    it('rejects zero down payment', () => {
        expect(() =>
            allocatePartialTenders(10000, 0, [{ method: 'CASH', amount: 0 }]),
        ).toThrow('greater than zero')
    })

    it('rejects down payment exceeding the total', () => {
        expect(() =>
            allocatePartialTenders(5000, 6000, [{ method: 'CASH', amount: 6000 }]),
        ).toThrow('cannot exceed the order total')
    })

    it('rejects negative down payment', () => {
        expect(() =>
            allocatePartialTenders(5000, -100, [{ method: 'CASH', amount: -100 }]),
        ).toThrow('greater than zero')
    })

    it('returns change on a cash down payment', () => {
        const result = allocatePartialTenders(10000, 5000, [
            { method: 'CASH', amount: 5000, tenderAmount: 6000 },
        ])
        expect(result.change).toBe(1000)
        expect(result.outstandingBalance).toBe(5000)
    })
})
