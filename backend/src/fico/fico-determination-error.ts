import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from '@nestjs/common'

/**
 * Phase 04.29 — structured account determination error codes.
 * Codes are stable contract values; messages stay human-actionable and never
 * contain stack traces or request payloads.
 */
export const FICO_DETERMINATION_ERROR_CODES = {
    TRANSACTION_KEY_INVALID: 'FICO_TRANSACTION_KEY_INVALID',
    TRANSACTION_KEY_INACTIVE: 'FICO_TRANSACTION_KEY_INACTIVE',
    COMPANY_ACCOUNTING_INACTIVE: 'FICO_COMPANY_ACCOUNTING_INACTIVE',
    COMPANY_ACCESS_DENIED: 'FICO_COMPANY_ACCESS_DENIED',
    COA_NOT_ASSIGNED: 'FICO_COA_NOT_ASSIGNED',
    DETERMINATION_MISSING: 'FICO_ACCOUNT_DETERMINATION_MISSING',
    DETERMINATION_AMBIGUOUS: 'FICO_ACCOUNT_DETERMINATION_AMBIGUOUS',
    DETERMINATION_CONFLICT: 'FICO_ACCOUNT_DETERMINATION_CONFLICT',
    DETERMINATION_EXPIRED: 'FICO_ACCOUNT_DETERMINATION_EXPIRED',
    ACCOUNT_TYPE_INVALID: 'FICO_ACCOUNT_TYPE_INVALID',
    ACCOUNT_COMPANY_MISMATCH: 'FICO_ACCOUNT_COMPANY_MISMATCH',
    ACCOUNT_NOT_POSTABLE: 'FICO_ACCOUNT_NOT_POSTABLE',
    ACCOUNT_BLOCKED: 'FICO_ACCOUNT_BLOCKED',
    RULE_DIMENSION_INVALID: 'FICO_RULE_DIMENSION_INVALID',
    REQUIRED_DIMENSION_MISSING: 'FICO_REQUIRED_DIMENSION_MISSING',
    RULE_EFFECTIVE_DATE_INVALID: 'FICO_RULE_EFFECTIVE_DATE_INVALID',
    RULE_APPROVAL_REQUIRED: 'FICO_RULE_APPROVAL_REQUIRED',
    RULE_REVISION_MISMATCH: 'FICO_RULE_REVISION_MISMATCH',
    RULE_ACTIVATION_DENIED: 'FICO_RULE_ACTIVATION_DENIED',
    INTEGRATION_NOT_SUPPORTED: 'FICO_INTEGRATION_NOT_SUPPORTED',
} as const

export type FicoDeterminationErrorCode =
    (typeof FICO_DETERMINATION_ERROR_CODES)[keyof typeof FICO_DETERMINATION_ERROR_CODES]

/** Resolution context echoed back so Finance can act without reading logs. */
export type FicoDeterminationErrorContext = {
    companyId?: string
    companyName?: string
    transactionKey?: string
    sourceModule?: string
    transactionType?: string
    postingDate?: string
    chartOfAccountsId?: string
    dimensions?: Record<string, string | null | undefined>
    ruleCodes?: string[]
    glAccountCode?: string
    /** Operator guidance rendered under the error message. */
    remediation?: string
}

type ErrorPayload = {
    errorCode: FicoDeterminationErrorCode
    message: string
    context: FicoDeterminationErrorContext
}

function buildPayload(
    code: FicoDeterminationErrorCode,
    message: string,
    context: FicoDeterminationErrorContext,
): ErrorPayload {
    return { errorCode: code, message, context }
}

export class FicoDeterminationError extends BadRequestException {
    readonly errorCode: FicoDeterminationErrorCode
    readonly context: FicoDeterminationErrorContext

    constructor(
        code: FicoDeterminationErrorCode,
        message: string,
        context: FicoDeterminationErrorContext = {},
    ) {
        super(buildPayload(code, message, context))
        this.errorCode = code
        this.context = context
    }
}

export class FicoDeterminationConflictError extends ConflictException {
    readonly errorCode: FicoDeterminationErrorCode
    readonly context: FicoDeterminationErrorContext

    constructor(
        code: FicoDeterminationErrorCode,
        message: string,
        context: FicoDeterminationErrorContext = {},
    ) {
        super(buildPayload(code, message, context))
        this.errorCode = code
        this.context = context
    }
}

export class FicoDeterminationForbiddenError extends ForbiddenException {
    readonly errorCode: FicoDeterminationErrorCode
    readonly context: FicoDeterminationErrorContext

    constructor(
        code: FicoDeterminationErrorCode,
        message: string,
        context: FicoDeterminationErrorContext = {},
    ) {
        super(buildPayload(code, message, context))
        this.errorCode = code
        this.context = context
    }
}

export function isFicoDeterminationError(
    err: unknown,
): err is
    | FicoDeterminationError
    | FicoDeterminationConflictError
    | FicoDeterminationForbiddenError {
    return (
        err instanceof FicoDeterminationError ||
        err instanceof FicoDeterminationConflictError ||
        err instanceof FicoDeterminationForbiddenError
    )
}

/**
 * Multi-line operator message, e.g.
 *   Unable to determine the inventory account.
 *   Company: AGCTEK · Transaction Key: INVENTORY · Valuation Class: Merchandise
 *   No eligible active rule was found for the posting date.
 */
export function ficoDeterminationErrorText(
    err: FicoDeterminationError | FicoDeterminationConflictError,
): string {
    const { context } = err
    const facts: string[] = []
    if (context.companyName || context.companyId) {
        facts.push(`Company: ${context.companyName ?? context.companyId}`)
    }
    if (context.transactionKey) {
        facts.push(`Transaction Key: ${context.transactionKey}`)
    }
    if (context.postingDate) facts.push(`Posting date: ${context.postingDate}`)
    for (const [key, value] of Object.entries(context.dimensions ?? {})) {
        if (value) facts.push(`${key}: ${value}`)
    }
    return [
        err.message,
        facts.length ? facts.join(' · ') : null,
        context.remediation ?? null,
    ]
        .filter(Boolean)
        .join('\n')
}