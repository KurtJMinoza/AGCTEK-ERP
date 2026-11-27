import { BadRequestException, Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS } from './fico.constants'
import { FicoDocumentNumberingService } from './fico-document-numbering.service'
import type {
    FinancialPostingLineInput,
    FinancialPostingRequest,
} from './fico-financial-posting.types'

type Tx = Omit<
    Prisma.TransactionClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

@Injectable()
export class FicoFinancialPostingEngine {
    constructor(
        private readonly prisma: PrismaService,
        private readonly numbering: FicoDocumentNumberingService,
    ) {}

    assertBalancedLines(lines: FinancialPostingLineInput[]) {
        if (!lines || lines.length < 2) {
            throw new BadRequestException(
                'At least two accounting lines are required for posting.',
            )
        }
        let totalDebit = new Decimal(0)
        let totalCredit = new Decimal(0)
        for (const line of lines) {
            const debit = new Decimal(line.debit.toString())
            const credit = new Decimal(line.credit.toString())
            if (debit.isNegative() || credit.isNegative()) {
                throw new BadRequestException(
                    'Negative debit or credit amounts are not allowed.',
                )
            }
            if (debit.gt(0) && credit.gt(0)) {
                throw new BadRequestException(
                    'A journal line cannot have both debit and credit amounts.',
                )
            }
            if (debit.isZero() && credit.isZero()) {
                throw new BadRequestException(
                    'Zero-value journal lines are not allowed.',
                )
            }
            totalDebit = totalDebit.plus(debit)
            totalCredit = totalCredit.plus(credit)
        }
        if (!totalDebit.eq(totalCredit)) {
            throw new BadRequestException(
                'Journal entry is unbalanced: total debits must equal total credits.',
            )
        }
        return { totalDebit, totalCredit }
    }

    async allocateDocumentNumber(
        tx: Tx,
        companyId: string,
        documentType: string,
        fiscalYear: number,
    ): Promise<string> {
        return this.numbering.allocateInTransaction(tx, {
            companyId,
            documentType,
            fiscalYear,
        })
    }

    async persistJournalInTransaction(
        tx: Tx,
        request: FinancialPostingRequest,
        fiscalPeriod: { id: string; fiscalYear: number } | null,
        documentNumber: string,
    ) {
        const { totalDebit } = this.assertBalancedLines(request.lines)
        const now = new Date()
        const currency = request.currencyCode.trim().toUpperCase()
        const isPosted = request.postImmediately
        const postedApprovalStatus = FICO_JOURNAL_AUTOMATIC_APPROVAL_STATUS
        // Lines cannot be inserted while the header is already POSTED (DB trigger).
        const journal = await tx.ficoJournalEntry.create({
            data: {
                idempotencyKey: request.idempotencyKey,
                sourceEventId: request.sourceEventId ?? null,
                sourceTransactionId: request.sourceTransactionId ?? null,
                mmAccountingEventId: request.mmAccountingEventId ?? null,
                companyId: request.companyId,
                postingDate: request.postingDate,
                documentDate: request.documentDate,
                fiscalYear: fiscalPeriod?.fiscalYear ?? null,
                fiscalPeriodId: fiscalPeriod?.id ?? null,
                totalAmount: totalDebit,
                currencyCode: currency,
                status: 'DRAFT',
                approvalStatus: 'DRAFT',
                requiresApproval:
                    !isPosted && request.postingSource === 'MANUAL',
                documentType: request.documentType,
                documentNumber,
                description: request.description,
                sourceModule: request.sourceModule,
                sourceDocumentType: request.sourceDocumentType ?? null,
                sourceDocumentId: request.sourceDocumentId ?? null,
                supplierId: request.supplierId ?? null,
                customerId: request.customerId ?? null,
                sourcePostingKey: request.sourcePostingKey ?? null,
                metadata: request.metadata
                    ? (request.metadata as Prisma.InputJsonValue)
                    : undefined,
                createdBy: request.actorUserId ?? null,
                lines: {
                    create: request.lines.map((line, index) => ({
                        lineNumber: index + 1,
                        glAccountId: line.glAccountId,
                        companyId: request.companyId,
                        debitAmount: new Decimal(line.debit.toString()),
                        creditAmount: new Decimal(line.credit.toString()),
                        currency,
                        description: line.description ?? null,
                        materialId: line.materialId ?? null,
                        warehouseId: line.warehouseId ?? null,
                    })),
                },
            },
            include: { lines: true },
        })
        if (isPosted) {
            return tx.ficoJournalEntry.update({
                where: { id: journal.id },
                data: {
                    status: 'POSTED',
                    approvalStatus: postedApprovalStatus,
                    requiresApproval: false,
                    postedAt: now,
                    postedBy: request.actorUserId ?? null,
                },
                include: { lines: true },
            })
        }
        return journal
    }

}