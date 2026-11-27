import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'

const Decimal = Prisma.Decimal

type FlatLine = {
    glAccountId: string
    debit: Prisma.Decimal
    credit: Prisma.Decimal
    description: string
}

type SdSalePayload = {
    tenders?: Array<{ method: string; amount: string }>
    outstandingBalance?: string
    totalAmount: string
    taxAmount?: string
    orderNumber: string
    receiptNumber?: string
    salesOrderId: string
}

@Injectable()
export class FicoSdPostingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly accountResolution: FicoAccountResolutionService,
    ) {}

    isSdAccountingPayload(payload: MmAccountingDispatchPayload): boolean {
        return (
            payload.sourceModule === 'SD' ||
            payload.eventType.startsWith('Pos') ||
            payload.eventType === 'SdCustomerCollection' ||
            payload.eventType === 'SdSalesReturnRefundPaid'
        )
    }

    async resolveFlatLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        if (payload.eventType === 'PosSaleCompleted') {
            return this.posSaleLines(payload)
        }
        if (payload.eventType === 'PosCollectionCompleted') {
            return this.posCollectionLines(payload)
        }
        if (payload.eventType === 'SdSalesReturnRefundPaid') {
            return this.salesReturnRefundLines(payload)
        }
        throw new BadRequestException(
            `SD automatic posting is not implemented for ${payload.eventType}.`,
        )
    }

    private async loadCompanyAccounts(companyId: string) {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
            where: { companyId, status: 'ACTIVE' },
            select: {
                chartOfAccountsId: true,
                defaultSalesRevenueAccountId: true,
                defaultTaxOutputAccountId: true,
                defaultReceivableAccountId: true,
                defaultCashAccountId: true,
            },
        })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException(
                'Company accounting is not active or chart of accounts is missing.',
            )
        }
        return settings
    }

    private transactionKeyForType(transactionType: string): string {
        const map: Record<string, string> = {
            SALES_REVENUE: 'SALES_REVENUE',
            OUTPUT_TAX: 'OUTPUT_TAX',
            ACCOUNTS_RECEIVABLE: 'CUSTOMER_RECON',
            PAYMENT_CLEARING: 'PAYMENT_CLEARING',
            CUSTOMER_PAYMENT: 'PAYMENT_CLEARING',
        }
        return map[transactionType] ?? transactionType
    }

    private async resolveRuleAccount(
        companyId: string,
        postingDate: Date,
        currency: string,
        transactionType: string,
        side: 'DEBIT' | 'CREDIT',
        fallbackAccountId: string | null,
    ): Promise<string> {
        const transactionKey = this.transactionKeyForType(transactionType)
        try {
            const resolved = await this.accountResolution.resolveDetermination({
                companyId,
                sourceModule: 'SD',
                postingDate,
                currencyCode: currency,
                transactionKey,
                dimensions: {},
            })
            const lines =
                side === 'DEBIT'
                    ? resolved.resolution.debitLines
                    : resolved.resolution.creditLines
            if (lines[0]?.glAccountId) return lines[0].glAccountId
            return resolved.glAccountId
        } catch (error) {
            if (fallbackAccountId) return fallbackAccountId
            const message =
                error instanceof Error
                    ? error.message
                    : `No G/L account could be resolved for SD ${transactionType} (${side}).`
            throw new BadRequestException(message)
        }
    }

    private async resolvePaymentClearingAccount(
        companyId: string,
        chartId: string,
        methodCode: string,
        postingDate: Date,
        currency: string,
        cashFallbackId: string | null,
    ): Promise<string> {
        const method = await this.prisma.sdPaymentMethod.findUnique({
            where: { code: methodCode },
            select: { glAccountCode: true },
        })
        if (method?.glAccountCode) {
            const account = await this.prisma.ficoGlAccount.findFirst({
                where: {
                    chartOfAccountsId: chartId,
                    accountCode: method.glAccountCode,
                    status: 'ACTIVE',
                    isPostingAccount: true,
                },
                select: { id: true },
            })
            if (account) return account.id
        }
        return this.resolveRuleAccount(
            companyId,
            postingDate,
            currency,
            'PAYMENT_CLEARING',
            'DEBIT',
            cashFallbackId,
        )
    }

    private async posSaleLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const sale = payload as MmAccountingDispatchPayload & SdSalePayload
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: sale.salesOrderId },
            select: {
                lines: {
                    select: { taxAmount: true },
                },
            },
        })
        const totalVat =
            order?.lines.reduce(
                (sum, line) => sum.plus(line.taxAmount ?? 0),
                new Decimal(0),
            ) ?? new Decimal(sale.taxAmount ?? 0)
        const totalAmount = new Decimal(sale.totalAmount)
        const netRevenue = totalAmount.minus(totalVat)

        const lines: FlatLine[] = []
        for (const tender of sale.tenders ?? []) {
            const amount = new Decimal(tender.amount)
            if (amount.lte(0)) continue
            const glAccountId = await this.resolvePaymentClearingAccount(
                payload.companyId,
                settings.chartOfAccountsId!,
                tender.method,
                postingDate,
                currency,
                settings.defaultCashAccountId,
            )
            lines.push({
                glAccountId,
                debit: amount,
                credit: new Decimal(0),
                description: `${tender.method} tender · ${sale.orderNumber}`,
            })
        }

        const outstanding = new Decimal(sale.outstandingBalance ?? '0')
        if (outstanding.gt(0)) {
            const arAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'ACCOUNTS_RECEIVABLE',
                'DEBIT',
                settings.defaultReceivableAccountId,
            )
            lines.push({
                glAccountId: arAccountId,
                debit: outstanding,
                credit: new Decimal(0),
                description: `Accounts Receivable · ${sale.orderNumber}`,
            })
        }

        if (netRevenue.gt(0)) {
            const revenueAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'SALES_REVENUE',
                'CREDIT',
                settings.defaultSalesRevenueAccountId,
            )
            lines.push({
                glAccountId: revenueAccountId,
                debit: new Decimal(0),
                credit: netRevenue,
                description: `Sales Revenue · ${sale.orderNumber}`,
            })
        }

        if (totalVat.gt(0)) {
            const taxAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'OUTPUT_TAX',
                'CREDIT',
                settings.defaultTaxOutputAccountId,
            )
            lines.push({
                glAccountId: taxAccountId,
                debit: new Decimal(0),
                credit: totalVat,
                description: `Output tax · ${sale.orderNumber}`,
            })
        }

        this.assertBalanced(lines, sale.orderNumber)
        return lines
    }

    /**
     * Commercial sales-return refund: Dr Revenue (+ output tax) / Cr Cash|AR.
     * Amounts are selling price from the refund — never MM valuation cost.
     */
    private async salesReturnRefundLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const data = payload as MmAccountingDispatchPayload & {
            returnRequestId: string
            requestNumber: string
            refundNumber?: string
            totalAmount: string
            taxAmount?: string
            refundMethod?: string | null
            originalPaymentMethod?: string | null
            orderNumber?: string
        }
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode
        const totalAmount = new Decimal(data.totalAmount)
        const taxAmount = new Decimal(data.taxAmount ?? '0')
        if (totalAmount.lte(0)) {
            throw new BadRequestException(
                `Sales return refund ${data.requestNumber} has no commercial amount to post.`,
            )
        }
        const netRevenue = Decimal.max(totalAmount.minus(taxAmount), new Decimal(0))
        const ref = data.refundNumber ?? data.requestNumber
        const lines: FlatLine[] = []

        if (netRevenue.gt(0)) {
            const revenueAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'SALES_REVENUE',
                'DEBIT',
                settings.defaultSalesRevenueAccountId,
            )
            lines.push({
                glAccountId: revenueAccountId,
                debit: netRevenue,
                credit: new Decimal(0),
                description: `Sales return revenue · ${ref}`,
            })
        }

        if (taxAmount.gt(0)) {
            const taxAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'OUTPUT_TAX',
                'DEBIT',
                settings.defaultTaxOutputAccountId,
            )
            lines.push({
                glAccountId: taxAccountId,
                debit: taxAmount,
                credit: new Decimal(0),
                description: `Sales return output tax · ${ref}`,
            })
        }

        const settlementMethod = this.resolveRefundSettlementMethod(
            data.refundMethod,
            data.originalPaymentMethod,
        )
        if (settlementMethod === 'AR') {
            const arAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'ACCOUNTS_RECEIVABLE',
                'CREDIT',
                settings.defaultReceivableAccountId,
            )
            lines.push({
                glAccountId: arAccountId,
                debit: new Decimal(0),
                credit: totalAmount,
                description: `Sales return AR credit · ${ref}`,
            })
        } else {
            const cashAccountId = await this.resolvePaymentClearingAccount(
                payload.companyId,
                settings.chartOfAccountsId!,
                settlementMethod,
                postingDate,
                currency,
                settings.defaultCashAccountId,
            )
            lines.push({
                glAccountId: cashAccountId,
                debit: new Decimal(0),
                credit: totalAmount,
                description: `Sales return ${settlementMethod} · ${ref}`,
            })
        }

        this.assertBalanced(lines, ref)
        return lines
    }

    private resolveRefundSettlementMethod(
        refundMethod?: string | null,
        originalPaymentMethod?: string | null,
    ): string {
        const refund = (refundMethod ?? '').toUpperCase()
        if (refund === 'CASH_REFUND') return 'CASH'
        if (refund === 'BANK_TRANSFER') return 'BANK_TRANSFER'
        if (refund === 'DIGITAL_WALLET') return 'DIGITAL_WALLET'
        if (refund === 'STORE_CREDIT') return 'AR'

        const original = (originalPaymentMethod ?? '').toUpperCase()
        if (!original) return 'CASH'
        if (
            original === 'COD' ||
            original.includes('CHARGE') ||
            original.includes('AR') ||
            original.includes('RECEIVABLE')
        ) {
            return 'AR'
        }
        if (original.includes('CASH')) return 'CASH'
        if (original.includes('BANK')) return 'BANK_TRANSFER'
        if (
            original.includes('WALLET') ||
            original.includes('GCASH') ||
            original.includes('QR')
        ) {
            return 'DIGITAL_WALLET'
        }
        return original
    }

    private async posCollectionLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const data = payload as MmAccountingDispatchPayload & {
            collectionNumber: string
            orderNumber: string
            collectedAmount: string
            tenders?: Array<{ method: string; amount: string }>
        }
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode
        const lines: FlatLine[] = []

        for (const tender of data.tenders ?? []) {
            const amount = new Decimal(tender.amount)
            if (amount.lte(0)) continue
            const glAccountId = await this.resolvePaymentClearingAccount(
                payload.companyId,
                settings.chartOfAccountsId!,
                tender.method,
                postingDate,
                currency,
                settings.defaultCashAccountId,
            )
            lines.push({
                glAccountId,
                debit: amount,
                credit: new Decimal(0),
                description: `${tender.method} collection · ${data.collectionNumber}`,
            })
        }

        const collected = new Decimal(data.collectedAmount)
        if (collected.gt(0)) {
            const arAccountId = await this.resolveRuleAccount(
                payload.companyId,
                postingDate,
                currency,
                'ACCOUNTS_RECEIVABLE',
                'CREDIT',
                settings.defaultReceivableAccountId,
            )
            lines.push({
                glAccountId: arAccountId,
                debit: new Decimal(0),
                credit: collected,
                description: `AR collection · ${data.orderNumber}`,
            })
        }

        this.assertBalanced(lines, data.collectionNumber)
        return lines
    }

    private assertBalanced(lines: FlatLine[], reference: string) {
        const debit = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0))
        const credit = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0))
        if (!debit.eq(credit)) {
            throw new BadRequestException(
                `Unbalanced SD journal for ${reference}: debit ${debit} ≠ credit ${credit}.`,
            )
        }
        if (lines.length < 2) {
            throw new BadRequestException(
                `SD journal for ${reference} requires at least two lines.`,
            )
        }
    }
}