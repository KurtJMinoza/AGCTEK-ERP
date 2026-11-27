import { BadRequestException } from '@nestjs/common'

/** Phase 01 — reusable controls shared by journal entry and posting validation. */

export type Phase01DimensionLine = {
    branchId?: string | null
    costCenterId?: string | null
    profitCenterId?: string | null
}

export type Phase01DimensionRequirement = {
    requiresBranch: boolean
    requiresCostCenter: boolean
    requiresProfitCenter: boolean
}

export type Phase01DocumentType = {
    code: string
    status: string
    allowedAccountTypes: string[]
    debitPostingAllowed: boolean
    creditPostingAllowed: boolean
    negativePostingAllowed: boolean
    referenceRequired: boolean
    headerTextRequired: boolean
    lineTextRequired: boolean
}

export type Phase01DocumentTypeInput = {
    documentType: string
    companyLabel: string
    documentTypeRow: Phase01DocumentType | null
    accountTypes: string[]
    lines: Array<{
        debitAmount?: number
        creditAmount?: number
        description?: string | null
    }>
    sourceDocumentId?: string | null
    description?: string | null
}

/** Decimal places in a JS number, ignoring exponent notation artefacts. */
export function decimalPlaces(value: number): number {
    if (!Number.isFinite(value)) return 0
    const text = String(value)
    if (text.includes('e-')) {
        const [mantissa, exponent] = text.split('e-')
        const fraction = (mantissa ?? '').split('.')[1] ?? ''
        return fraction.length + Number(exponent ?? 0)
    }
    return (text.split('.')[1] ?? '').length
}

export function assertPostingPrecision(
    amounts: readonly number[],
    precision: number,
): void {
    if (!Number.isInteger(precision) || precision < 0 || precision > 4) {
        throw new BadRequestException(
            'Company posting precision must be an integer between 0 and 4.',
        )
    }
    const excessive = amounts.find((amount) => decimalPlaces(amount) > precision)
    if (excessive !== undefined) {
        throw new BadRequestException(
            `Amount ${excessive} exceeds the company posting precision of ${precision} decimal place(s).`,
        )
    }
}

export function assertRequiredDimensions(
    line: Phase01DimensionLine,
    account: Phase01DimensionRequirement,
    accountLabel: string,
): void {
    if (account.requiresBranch && !line.branchId?.trim()) {
        throw new BadRequestException(
            `G/L account ${accountLabel} requires a branch on every line.`,
        )
    }
    if (account.requiresCostCenter && !line.costCenterId?.trim()) {
        throw new BadRequestException(
            `G/L account ${accountLabel} requires a cost center on every line.`,
        )
    }
    if (account.requiresProfitCenter && !line.profitCenterId?.trim()) {
        throw new BadRequestException(
            `G/L account ${accountLabel} requires a profit center on every line.`,
        )
    }
}

export function assertDocumentTypeControl(
    input: Phase01DocumentTypeInput,
): void {
    const type = input.documentTypeRow
    if (!type) {
        throw new BadRequestException(
            `Document type ${input.documentType} is not configured for ${input.companyLabel}.`,
        )
    }
    if (type.status !== 'ACTIVE') {
        throw new BadRequestException(
            `Document type ${input.documentType} is inactive and cannot be used for posting.`,
        )
    }
    const disallowed = input.accountTypes.filter(
        (accountType) =>
            type.allowedAccountTypes.length > 0 &&
            !type.allowedAccountTypes.includes(accountType),
    )
    if (disallowed.length) {
        throw new BadRequestException(
            `Document type ${input.documentType} does not allow account type(s): ${[...new Set(disallowed)].join(', ')}.`,
        )
    }
    const hasDebit = input.lines.some((line) => (line.debitAmount ?? 0) > 0)
    const hasCredit = input.lines.some((line) => (line.creditAmount ?? 0) > 0)
    if (hasDebit && !type.debitPostingAllowed) {
        throw new BadRequestException(
            `Document type ${input.documentType} does not allow debit postings.`,
        )
    }
    if (hasCredit && !type.creditPostingAllowed) {
        throw new BadRequestException(
            `Document type ${input.documentType} does not allow credit postings.`,
        )
    }
    if (
        !type.negativePostingAllowed &&
        input.lines.some(
            (line) =>
                (line.debitAmount ?? 0) < 0 || (line.creditAmount ?? 0) < 0,
        )
    ) {
        throw new BadRequestException(
            `Document type ${input.documentType} does not allow negative postings.`,
        )
    }
    if (type.referenceRequired && !input.sourceDocumentId?.trim()) {
        throw new BadRequestException(
            `Document type ${input.documentType} requires a source document reference.`,
        )
    }
    if (type.headerTextRequired && !input.description?.trim()) {
        throw new BadRequestException(
            `Document type ${input.documentType} requires a document description.`,
        )
    }
    if (
        type.lineTextRequired &&
        input.lines.some((line) => !line.description?.trim())
    ) {
        throw new BadRequestException(
            `Document type ${input.documentType} requires a description on every line.`,
        )
    }
}
