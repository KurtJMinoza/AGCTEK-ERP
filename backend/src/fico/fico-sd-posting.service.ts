import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoTreasuryPaymentResolutionService } from './fico-treasury-payment-resolution.service'
import {
    companyDefaultForSdRole,
    loadCompanyGlDefaults,
} from './fico-company-gl-defaults'

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
        private readonly treasuryPayment: FicoTreasuryPaymentResolutionService,
    ) {}

    isSdAccountingPayload(payload: MmAccountingDispatchPayload): boolean {
        return (
            payload.sourceModule === 'SD' ||
            payload.eventType.startsWith('Pos') ||
            payload.eventType === 'SdCustomerCollection' ||
            payload.eventType === 'SdSalesReturnCreditMemo'
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
        if (payload.eventType === 'SdCustomerCollection') {
            return this.sdInvoiceCollectionLines(payload)
        }
        if (payload.eventType === 'PosSaleRefunded') {
            return this.posSaleRefundLines(payload)
        }
        if (payload.eventType === 'PosCustomerDepositCompleted') {
            return this.posCustomerDepositLines(payload)
        }
        if (payload.eventType === 'SdSalesReturnCreditMemo') {
            return this.sdSalesReturnCreditMemoLines(payload)
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
            CUSTOMER_ADVANCE: 'CUSTOMER_ADVANCE',
            BANK_CHARGES: 'BANK_CHARGES',
            SALES_RETURN: 'SALES_RETURN',
        }
        return map[transactionType] ?? transactionType
    }

    private async merchantFeeParts(methodCode: string, gross: Prisma.Decimal) {
        const method = await this.prisma.sdPaymentMethod.findUnique({
            where: { code: methodCode },
            select: { merchantFeeRate: true, merchantFeeFlat: true },
        })
        let fee = new Decimal(0)
        if (method?.merchantFeeFlat) {
            fee = fee.plus(method.merchantFeeFlat)
        }
        if (method?.merchantFeeRate) {
            fee = fee.plus(gross.mul(method.merchantFeeRate).div(100))
        }
        fee = fee.toDecimalPlaces(4)
        return { gross, net: gross.minus(fee), fee }
    }

    private async pushTenderSettlementDebits(
        lines: FlatLine[],
        input: {
            companyId: string
            chartId: string
            postingDate: Date
            currency: string
            cashFallbackId: string | null
            label: string
        },
        tender: { method: string; amount: string },
    ) {
        const gross = new Decimal(tender.amount)
        if (gross.lte(0)) return
        const { net, fee } = await this.merchantFeeParts(tender.method, gross)
        const glAccountId = await this.resolvePaymentClearingAccount(
            input.companyId,
            input.chartId,
            tender.method,
            input.postingDate,
            input.currency,
            input.cashFallbackId,
        )
        lines.push({
            glAccountId,
            debit: net,
            credit: new Decimal(0),
            description: `${input.label} · ${tender.method}`,
        })
        if (fee.gt(0)) {
            const feeAccountId = await this.resolveRuleAccount(
                input.companyId,
                input.postingDate,
                input.currency,
                'BANK_CHARGES',
                'DEBIT',
                null,
            )
            lines.push({
                glAccountId: feeAccountId,
                debit: fee,
                credit: new Decimal(0),
                description: `Merchant fee · ${tender.method}`,
            })
        }
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
            if (resolved.glAccountId) return resolved.glAccountId
            if (fallbackAccountId) return fallbackAccountId
            const defaults = await loadCompanyGlDefaults(this.prisma, companyId)
            const companyFallback = companyDefaultForSdRole(
                defaults,
                transactionType as 'ACCOUNTS_RECEIVABLE',
            )
            if (companyFallback) return companyFallback
            throw new BadRequestException(
                `No G/L account could be resolved for SD ${transactionType} (${side}).`,
            )
        } catch (error) {
            if (fallbackAccountId) return fallbackAccountId
            const defaults = await loadCompanyGlDefaults(this.prisma, companyId)
            const companyFallback = companyDefaultForSdRole(
                defaults,
                transactionType as
                    | 'ACCOUNTS_RECEIVABLE'
                    | 'SALES_REVENUE'
                    | 'OUTPUT_TAX'
                    | 'PAYMENT_CLEARING',
            )
            if (companyFallback) return companyFallback
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
        try {
            const resolved = await this.treasuryPayment.resolvePaymentAccount({
                companyId,
                paymentMethodCode: methodCode,
                currencyCode: currency,
                postingDate,
                side: 'DEBIT',
            })
            return resolved.glAccountId
        } catch {
            return this.resolveRuleAccount(
                companyId,
                postingDate,
                currency,
                'PAYMENT_CLEARING',
                'DEBIT',
                cashFallbackId,
            )
        }
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
        const tenderCtx = {
            companyId: payload.companyId,
            chartId: settings.chartOfAccountsId!,
            postingDate,
            currency,
            cashFallbackId: settings.defaultCashAccountId,
            label: `${sale.orderNumber} tender`,
        }
        for (const tender of sale.tenders ?? []) {
            await this.pushTenderSettlementDebits(lines, tenderCtx, tender)
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

        const tenderCtx = {
            companyId: payload.companyId,
            chartId: settings.chartOfAccountsId!,
            postingDate,
            currency,
            cashFallbackId: settings.defaultCashAccountId,
            label: `Collection ${data.collectionNumber}`,
        }
        for (const tender of data.tenders ?? []) {
            await this.pushTenderSettlementDebits(lines, tenderCtx, tender)
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

    private async sdInvoiceCollectionLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const data = payload as MmAccountingDispatchPayload & {
            collectedAmount: string
            invoiceNumber: string
            salesOrderId: string
        }
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode
        const collected = new Decimal(data.collectedAmount)
        const lines: FlatLine[] = []

        const bankAccountId = await this.resolvePaymentClearingAccount(
            payload.companyId,
            settings.chartOfAccountsId!,
            'BANK_TRANSFER',
            postingDate,
            currency,
            settings.defaultCashAccountId,
        )
        lines.push({
            glAccountId: bankAccountId,
            debit: collected,
            credit: new Decimal(0),
            description: `Invoice settlement · ${data.invoiceNumber}`,
        })

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
            description: `AR cleared · ${data.invoiceNumber}`,
        })

        this.assertBalanced(lines, data.invoiceNumber)
        return lines
    }

    private async posSaleRefundLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const data = payload as MmAccountingDispatchPayload & SdSalePayload & {
            refundNumber?: string
            tenders?: Array<{ method: string; amount: string }>
        }
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode
        const refundTotal = new Decimal(data.totalAmount)
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: data.salesOrderId },
            select: {
                totalAmount: true,
                lines: { select: { taxAmount: true } },
            },
        })
        const orderVat =
            order?.lines.reduce(
                (sum, line) => sum.plus(line.taxAmount ?? 0),
                new Decimal(0),
            ) ?? new Decimal(data.taxAmount ?? 0)
        const orderTotal = new Decimal(order?.totalAmount ?? refundTotal)
        const ratio = orderTotal.gt(0) ? refundTotal.div(orderTotal) : new Decimal(1)
        const refundVat = orderVat.mul(ratio).toDecimalPlaces(4)
        const netRefund = refundTotal.minus(refundVat)
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
                debit: new Decimal(0),
                credit: amount,
                description: `Refund ${tender.method} · ${data.orderNumber}`,
            })
        }

        if (netRefund.gt(0)) {
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
                debit: netRefund,
                credit: new Decimal(0),
                description: `Sales return · ${data.orderNumber}`,
            })
        }

        if (refundVat.gt(0)) {
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
                debit: refundVat,
                credit: new Decimal(0),
                description: `Output tax reversal · ${data.orderNumber}`,
            })
        }

        this.assertBalanced(lines, data.refundNumber ?? data.orderNumber)
        return lines
    }

    private async posCustomerDepositLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const data = payload as MmAccountingDispatchPayload & {
            depositAmount: string
            reference: string
            customerId: string
            tenders?: Array<{ method: string; amount: string }>
        }
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode
        const deposit = new Decimal(data.depositAmount)
        const lines: FlatLine[] = []
        const tenderCtx = {
            companyId: payload.companyId,
            chartId: settings.chartOfAccountsId!,
            postingDate,
            currency,
            cashFallbackId: settings.defaultCashAccountId,
            label: `Deposit ${data.reference}`,
        }
        for (const tender of data.tenders ?? []) {
            await this.pushTenderSettlementDebits(lines, tenderCtx, tender)
        }
        const advanceAccountId = await this.resolveRuleAccount(
            payload.companyId,
            postingDate,
            currency,
            'CUSTOMER_ADVANCE',
            'CREDIT',
            null,
        )
        lines.push({
            glAccountId: advanceAccountId,
            debit: new Decimal(0),
            credit: deposit,
            description: `Customer advance · ${data.reference}`,
        })
        this.assertBalanced(lines, data.reference)
        return lines
    }

    private async sdSalesReturnCreditMemoLines(
        payload: MmAccountingDispatchPayload,
    ): Promise<FlatLine[]> {
        const data = payload as MmAccountingDispatchPayload & {
            creditAmount: string
            returnNumber: string
        }
        const settings = await this.loadCompanyAccounts(payload.companyId)
        const postingDate = new Date(payload.postingDate)
        const currency = payload.currencyCode
        const amount = new Decimal(data.creditAmount)
        const salesReturnAccountId = await this.resolveRuleAccount(
            payload.companyId,
            postingDate,
            currency,
            'SALES_RETURN',
            'DEBIT',
            null,
        )
        const arAccountId = await this.resolveRuleAccount(
            payload.companyId,
            postingDate,
            currency,
            'ACCOUNTS_RECEIVABLE',
            'CREDIT',
            settings.defaultReceivableAccountId,
        )
        const lines: FlatLine[] = [
            {
                glAccountId: salesReturnAccountId,
                debit: amount,
                credit: new Decimal(0),
                description: `Sales return · ${data.returnNumber}`,
            },
            {
                glAccountId: arAccountId,
                debit: new Decimal(0),
                credit: amount,
                description: `Customer credit · ${data.returnNumber}`,
            },
        ]
        this.assertBalanced(lines, data.returnNumber)
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