import { Injectable, Logger } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { FicoJournalService } from './fico-journal.service'
import type { SdReturnRefundPaidPayload } from '../sd/sd-event.types'

/**
 * Phase 2 sales-return commercial leg: reverse revenue / VAT and credit cash (or AR)
 * when an SD refund is marked PAID. Account codes are resolved inside FICO from the
 * company chart — SD never passes G/L numbers.
 *
 * Journal shape (cash refund of a paid sale):
 *   Dr Sales Revenue (4000) — net
 *   Dr Output VAT (2040) — tax portion when present
 *   Cr Cash / tender / AR — gross refund
 */
@Injectable()
export class FicoSalesReturnRefundService {
    private readonly logger = new Logger(FicoSalesReturnRefundService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly journal: FicoJournalService,
    ) {}

    async postFromRefundPaid(
        event: SdReturnRefundPaidPayload,
    ): Promise<{ created: boolean; duplicate: boolean; journalEntryId?: string }> {
        const idempotencyKey =
            event.idempotencyKey || `sd-return-refund:${event.refundId}`

        const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
            where: { companyId: event.companyId, status: 'ACTIVE' },
            select: { chartOfAccountsId: true },
        })
        if (!settings?.chartOfAccountsId) {
            this.logger.debug(
                `Skipping sales-return refund posting for ${event.requestNumber}: no active accounting settings`,
            )
            return { created: false, duplicate: false }
        }

        const glAccounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                status: 'ACTIVE',
                isPostingAccount: true,
            },
            select: { id: true, accountCode: true },
        })
        const glByCode = new Map(glAccounts.map((a) => [a.accountCode, a.id]))

        const revenueAccountId = glByCode.get('4000')
        if (!revenueAccountId) {
            this.logger.warn(
                `Skipping sales-return refund posting for ${event.requestNumber}: G/L 4000 (Sales Revenue) not found`,
            )
            return { created: false, duplicate: false }
        }

        const vatAccountId =
            glByCode.get('2040') ?? glByCode.get('2200') ?? glByCode.get('2150') ?? null

        const settlementCode = this.settlementAccountCode(
            event.refundMethod,
            event.paymentMethod,
        )
        const settlementAccountId =
            glByCode.get(settlementCode) ??
            glByCode.get('1000') ??
            glByCode.get('1100')
        if (!settlementAccountId) {
            this.logger.warn(
                `Skipping sales-return refund posting for ${event.requestNumber}: no cash/AR settlement account`,
            )
            return { created: false, duplicate: false }
        }

        const gross = new Decimal(event.refundAmount)
        if (gross.lte(0)) {
            this.logger.debug(
                `Skipping sales-return refund posting for ${event.requestNumber}: zero amount`,
            )
            return { created: false, duplicate: false }
        }

        const taxAmount = new Decimal(event.taxAmount ?? '0')
        const vatPortion =
            taxAmount.gt(0) && vatAccountId
                ? taxAmount.toDecimalPlaces(2)
                : new Decimal(0)
        const netRevenue = gross.minus(vatPortion).toDecimalPlaces(2)
        if (netRevenue.lte(0) && vatPortion.lte(0)) {
            return { created: false, duplicate: false }
        }

        const orderLabel = event.orderNumber || event.requestNumber
        const invoiceLabel = event.invoiceNumber?.trim() || null
        const reference = [orderLabel, invoiceLabel].filter(Boolean).join(' / ')
        const headerText = [
            'Sales return refund',
            event.refundNumber,
            orderLabel,
            invoiceLabel,
        ]
            .filter(Boolean)
            .join(' · ')

        const lines: Array<{
            glAccountId: string
            debitAmount: number
            creditAmount: number
            description: string
        }> = []

        if (netRevenue.gt(0)) {
            lines.push({
                glAccountId: revenueAccountId,
                debitAmount: Number(netRevenue),
                creditAmount: 0,
                description: `SALES_RETURN_REFUND · Revenue · ${orderLabel}`,
            })
        }
        if (vatPortion.gt(0) && vatAccountId) {
            lines.push({
                glAccountId: vatAccountId,
                debitAmount: Number(vatPortion),
                creditAmount: 0,
                description: `SALES_RETURN_REFUND · Output VAT · ${orderLabel}`,
            })
        }
        lines.push({
            glAccountId: settlementAccountId,
            debitAmount: 0,
            creditAmount: Number(gross.toDecimalPlaces(2)),
            description: `SALES_RETURN_REFUND · ${event.refundMethod ?? 'CASH_REFUND'} · ${orderLabel}`,
        })

        return this.journal.createAutomatedEntry({
            idempotencyKey,
            companyId: event.companyId,
            postingDate: new Date(event.paidAt),
            currencyCode: event.currency || 'PHP',
            documentType: 'SD_REVERSAL',
            sourceModule: 'SD',
            sourceDocumentType: 'SD_REFUND',
            sourceDocumentId: event.refundId,
            reference,
            headerText,
            postedBy: event.paidBy ?? null,
            metadata: {
                eventType: 'ReturnRefundPaid',
                transactionKey: 'SALES_RETURN_REFUND',
                returnRequestId: event.returnRequestId,
                refundId: event.refundId,
                refundNumber: event.refundNumber,
                orderNumber: event.orderNumber,
                invoiceNumber: event.invoiceNumber ?? null,
            },
            lines,
        })
    }

    private settlementAccountCode(
        refundMethod?: string | null,
        paymentMethod?: string | null,
    ): string {
        const method = (refundMethod || paymentMethod || 'CASH_REFUND').toUpperCase()
        if (
            method.includes('STORE_CREDIT') ||
            method.includes('AR') ||
            method.includes('RECEIVABLE')
        ) {
            return '1100'
        }
        if (method.includes('GCASH') || method.includes('WALLET')) {
            return '1000'
        }
        if (method.includes('CARD')) {
            return '1000'
        }
        if (method.includes('BANK')) {
            return '1000'
        }
        return '1000'
    }
}
