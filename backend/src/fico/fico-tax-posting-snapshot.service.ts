import { Injectable, Logger } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'

const TAX_EVENTS = new Set([
    'PosSaleCompleted',
    'SdSalesInvoicePosted',
    'SdSalesReturnCreditMemo',
])

@Injectable()
export class FicoTaxPostingSnapshotService {
    private readonly logger = new Logger(FicoTaxPostingSnapshotService.name)

    constructor(private readonly prisma: PrismaService) {}

    async captureFromDispatch(
        payload: MmAccountingDispatchPayload,
        journalEntryId: string,
    ) {
        if (!TAX_EVENTS.has(payload.eventType)) {
            return { written: 0 }
        }

        const salesOrderId =
            (payload as MmAccountingDispatchPayload & { salesOrderId?: string })
                .salesOrderId ??
            (payload as MmAccountingDispatchPayload & { sourceSalesOrderId?: string })
                .sourceSalesOrderId

        const salesInvoiceId =
            payload.eventType === 'SdSalesInvoicePosted'
                ? payload.documentId
                : undefined

        let orderId = salesOrderId
        if (!orderId && salesInvoiceId) {
            const invoice = await this.prisma.sdSalesInvoice.findUnique({
                where: { id: salesInvoiceId },
                select: { salesOrderId: true },
            })
            orderId = invoice?.salesOrderId ?? undefined
        }

        if (!orderId) {
            return { written: 0 }
        }

        const postingDate = new Date(payload.postingDate)
        const sourceDocumentType =
            payload.eventType === 'SdSalesReturnCreditMemo'
                ? 'SD_CREDIT_MEMO'
                : payload.documentType
        const sourceDocumentId = payload.documentId

        const lines = await this.prisma.sdSalesOrderLine.findMany({
            where: { salesOrderId: orderId },
            select: {
                taxCode: true,
                taxAmount: true,
                taxableAmount: true,
                lineTotal: true,
                taxRate: true,
                taxTreatment: true,
            },
        })

        const grouped = new Map<
            string,
            {
                taxAmount: Decimal
                netAmount: Decimal
                grossAmount: Decimal
                taxRate: Decimal | null
                taxTreatment: string | null
            }
        >()

        for (const line of lines) {
            const code = line.taxCode?.trim()
            if (!code) continue
            const taxAmount = new Decimal(line.taxAmount ?? 0)
            if (taxAmount.isZero()) continue
            const bucket = grouped.get(code) ?? {
                taxAmount: new Decimal(0),
                netAmount: new Decimal(0),
                grossAmount: new Decimal(0),
                taxRate: line.taxRate ? new Decimal(line.taxRate) : null,
                taxTreatment: line.taxTreatment,
            }
            bucket.taxAmount = bucket.taxAmount.plus(taxAmount)
            const net = line.taxableAmount
                ? new Decimal(line.taxableAmount)
                : new Decimal(line.lineTotal ?? 0).minus(taxAmount)
            bucket.netAmount = bucket.netAmount.plus(net)
            bucket.grossAmount = bucket.grossAmount.plus(line.lineTotal ?? net.plus(taxAmount))
            grouped.set(code, bucket)
        }

        if (!grouped.size) {
            return { written: 0 }
        }

        const taxCodes = await this.prisma.ficoTaxCode.findMany({
            where: {
                code: { in: [...grouped.keys()] },
                OR: [{ companyId: payload.companyId }, { companyId: null }],
            },
            select: {
                id: true,
                code: true,
                taxType: true,
                calculationMethod: true,
                rateUnit: true,
                isRecoverable: true,
            },
        })
        const codeByKey = new Map(taxCodes.map((row) => [row.code, row]))

        let written = 0
        for (const [code, amounts] of grouped) {
            const taxCode = codeByKey.get(code)
            if (!taxCode) continue
            const sign =
                payload.eventType === 'SdSalesReturnCreditMemo'
                    ? new Decimal(-1)
                    : new Decimal(1)
            const taxAmount = amounts.taxAmount.mul(sign)
            const netAmount = amounts.netAmount.mul(sign)
            const grossAmount = amounts.grossAmount.mul(sign)
            const recoverable = taxCode.isRecoverable
                ? taxAmount
                : new Decimal(0)
            const nonRecoverable = taxCode.isRecoverable
                ? new Decimal(0)
                : taxAmount
            const withholdingPayable =
                taxCode.taxType === 'WITHHOLDING_TAX' && taxAmount.gt(0)
                    ? taxAmount
                    : new Decimal(0)
            const withholdingReceivable =
                taxCode.taxType === 'WITHHOLDING_TAX' && taxAmount.lt(0)
                    ? taxAmount.abs()
                    : new Decimal(0)

            const idempotencyKey = `TAX_SNAPSHOT:${journalEntryId}:${taxCode.id}`
            try {
                await this.prisma.ficoTaxPostingSnapshot.create({
                    data: {
                        companyId: payload.companyId,
                        sourceModule: payload.sourceModule,
                        sourceDocumentType,
                        sourceDocumentId,
                        journalEntryId,
                        taxCodeId: taxCode.id,
                        taxCodeCode: taxCode.code,
                        taxType: taxCode.taxType,
                        calculationMethod:
                            amounts.taxTreatment ??
                            taxCode.calculationMethod,
                        rateApplied: amounts.taxRate ?? new Decimal(0),
                        rateUnit: taxCode.rateUnit,
                        netAmount,
                        taxAmount,
                        grossAmount,
                        recoverableTax: recoverable,
                        nonRecoverableTax: nonRecoverable,
                        withholdingPayable,
                        withholdingReceivable,
                        postingDate,
                        idempotencyKey,
                    },
                })
                written += 1
            } catch (err: unknown) {
                if (
                    err &&
                    typeof err === 'object' &&
                    'code' in err &&
                    (err as { code: string }).code === 'P2002'
                ) {
                    continue
                }
                this.logger.warn(
                    `Tax snapshot failed for ${code}: ${
                        err instanceof Error ? err.message : 'unknown'
                    }`,
                )
            }
        }

        return { written }
    }
}