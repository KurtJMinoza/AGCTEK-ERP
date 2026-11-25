import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { CreateJournalLineDto } from './dto/fico.dto'

export function assertDraftPostingStatus(status: string) {
    if (status !== 'DRAFT') {
        throw new BadRequestException(
            `Only draft journal entries can be modified. Current posting status is ${status}.`,
        )
    }
}

export function assertCancellable(status: string) {
    if (status !== 'DRAFT') {
        throw new BadRequestException(
            `Only unposted draft documents can be cancelled. Current status is ${status}.`,
        )
    }
}

export function validateJournalLinesForSubmission(
    lines: Array<{
        debitAmount?: number | Decimal
        creditAmount?: number | Decimal
        glAccountId: string
    }>,
) {
    if (!lines || lines.length < 2) {
        throw new BadRequestException(
            'At least two journal lines are required before submission.',
        )
    }
    let totalDebit = new Decimal(0)
    let totalCredit = new Decimal(0)
    for (const line of lines) {
        const debit = new Decimal(
            line.debitAmount?.toString?.() ?? line.debitAmount ?? 0,
        )
        const credit = new Decimal(
            line.creditAmount?.toString?.() ?? line.creditAmount ?? 0,
        )
        if (debit.isNegative() || credit.isNegative()) {
            throw new BadRequestException('Negative amounts are not allowed.')
        }
        if (debit.gt(0) && credit.gt(0)) {
            throw new BadRequestException(
                'Each line must be either debit or credit, not both.',
            )
        }
        if (debit.isZero() && credit.isZero()) {
            throw new BadRequestException('Zero-value lines are not allowed.')
        }
        totalDebit = totalDebit.plus(debit)
        totalCredit = totalCredit.plus(credit)
    }
    if (!totalDebit.eq(totalCredit)) {
        throw new BadRequestException(
            'Journal entry must balance before submission.',
        )
    }
}

export function mapCreateLines(lines: CreateJournalLineDto[]) {
    return lines.map((line) => ({
        glAccountId: line.glAccountId,
        debit: new Decimal(Number(line.debitAmount) || 0),
        credit: new Decimal(Number(line.creditAmount) || 0),
        description: line.description ?? null,
    }))
}

export const INTEGRATED_SOURCE_MODULES = new Set(['MM', 'SD', 'PP'])

export function assertManualReversalAllowed(sourceModule: string | null) {
    if (sourceModule && INTEGRATED_SOURCE_MODULES.has(sourceModule.toUpperCase())) {
        throw new BadRequestException(
            `Journal reversal for integrated ${sourceModule} postings must be initiated through the originating module (operational reversal), not as an isolated financial reversal.`,
        )
    }
}

/** DB check constraint allows SD_REVERSAL / MM_REVERSAL, not JOURNAL_REVERSAL. */
export function resolveReversalDocumentType(originalDocumentType: string | null): {
    documentType: string
    numberingKey: string
} {
    switch (originalDocumentType) {
        case 'SD_REVENUE':
        case 'SD_COLLECTION':
            return { documentType: 'SD_REVERSAL', numberingKey: 'SD_REVERSAL' }
        case 'MM_GR':
        case 'MM_GI':
        case 'MM_ADJUSTMENT':
            return { documentType: 'MM_REVERSAL', numberingKey: 'MM_REVERSAL' }
        default:
            return { documentType: 'JOURNAL', numberingKey: 'JOURNAL_REVERSAL' }
    }
}