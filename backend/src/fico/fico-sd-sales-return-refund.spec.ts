import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FicoSdPostingService } from './fico-sd-posting.service'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'

const Decimal = Prisma.Decimal

describe('FicoSdPostingService sales return refund', () => {
    const settings = {
        chartOfAccountsId: 'coa-1',
        defaultSalesRevenueAccountId: 'rev-1',
        defaultTaxOutputAccountId: 'tax-1',
        defaultReceivableAccountId: 'ar-1',
        defaultCashAccountId: 'cash-1',
    }

    function buildService(overrides: {
        resolveDetermination?: jest.Mock
        paymentMethod?: { glAccountCode: string } | null
        cashGl?: { id: string } | null
    } = {}) {
        const prisma = {
            ficoCompanyAccountingSettings: {
                findFirst: jest.fn().mockResolvedValue(settings),
            },
            sdPaymentMethod: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue(
                        overrides.paymentMethod === undefined
                            ? null
                            : overrides.paymentMethod,
                    ),
            },
            ficoGlAccount: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue(
                        overrides.cashGl === undefined
                            ? { id: 'cash-gl-1' }
                            : overrides.cashGl,
                    ),
            },
        }
        const accountResolution = {
            resolveDetermination: overrides.resolveDetermination ??
                jest.fn().mockRejectedValue(new Error('no rule')),
        }
        return new FicoSdPostingService(
            prisma as never,
            accountResolution as never,
        )
    }

    const basePayload = {
        schemaVersion: 'v2' as const,
        eventType: 'SdSalesReturnRefundPaid',
        companyId: 'co-1',
        postingDate: '2026-11-01T00:00:00.000Z',
        transactionDate: '2026-11-01T00:00:00.000Z',
        currencyCode: 'PHP',
        documentType: 'RETURN_REQUEST',
        documentId: 'rr-1',
        sourceModule: 'SD',
        accountingEffects: [],
        lines: [],
        financiallyRelevant: true,
        idempotencyKey: 'sales-return-refund:rr-1:ref-1',
        returnRequestId: 'rr-1',
        requestNumber: 'RR-1',
        refundNumber: 'REF-1',
        totalAmount: '112',
        taxAmount: '12',
        refundMethod: 'CASH_REFUND',
        originalPaymentMethod: 'CASH',
    } satisfies MmAccountingDispatchPayload & Record<string, unknown>

    it('is recognized as an SD accounting payload', () => {
        const service = buildService()
        expect(service.isSdAccountingPayload(basePayload)).toBe(true)
    })

    it('posts Dr Revenue + Dr Tax / Cr Cash at commercial amounts', async () => {
        const service = buildService()
        const lines = await service.resolveFlatLines(basePayload)
        const debit = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0))
        const credit = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0))
        expect(debit.toString()).toBe('112')
        expect(credit.toString()).toBe('112')
        expect(lines).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    glAccountId: 'rev-1',
                    debit: expect.any(Decimal),
                    credit: expect.any(Decimal),
                }),
                expect.objectContaining({
                    glAccountId: 'tax-1',
                    debit: expect.any(Decimal),
                }),
                expect.objectContaining({
                    credit: expect.any(Decimal),
                }),
            ]),
        )
        const revenue = lines.find((l) => l.glAccountId === 'rev-1')!
        expect(revenue.debit.toString()).toBe('100')
        expect(revenue.credit.toString()).toBe('0')
    })

    it('credits AR for store-credit / charge settlement', async () => {
        const service = buildService()
        const lines = await service.resolveFlatLines({
            ...basePayload,
            taxAmount: '0',
            totalAmount: '200',
            refundMethod: 'STORE_CREDIT',
        })
        expect(lines).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    glAccountId: 'rev-1',
                    debit: expect.any(Decimal),
                }),
                expect.objectContaining({
                    glAccountId: 'ar-1',
                    credit: expect.any(Decimal),
                }),
            ]),
        )
    })

    it('rejects zero commercial amount', async () => {
        const service = buildService()
        await expect(
            service.resolveFlatLines({
                ...basePayload,
                totalAmount: '0',
                taxAmount: '0',
            }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('credits bank clearing for BANK_TRANSFER refunds', async () => {
        const service = buildService({
            paymentMethod: { glAccountCode: '1100' },
            cashGl: { id: 'bank-1100' },
        })
        const lines = await service.resolveFlatLines({
            ...basePayload,
            taxAmount: '0',
            totalAmount: '150',
            refundMethod: 'BANK_TRANSFER',
        })
        const credit = lines.find((l) => l.credit.gt(0))!
        expect(credit.glAccountId).toBe('bank-1100')
        expect(credit.credit.toString()).toBe('150')
    })

    it('credits AR when original tender was COD/charge', async () => {
        const service = buildService()
        const lines = await service.resolveFlatLines({
            ...basePayload,
            taxAmount: '0',
            totalAmount: '90',
            refundMethod: null,
            originalPaymentMethod: 'COD',
        })
        expect(lines).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    glAccountId: 'ar-1',
                    credit: expect.any(Decimal),
                }),
            ]),
        )
    })
})
