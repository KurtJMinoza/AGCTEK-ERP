import { BadRequestException } from '@nestjs/common'

/**
 * Account-code rules shared by the chart-of-accounts and G/L account services.
 *
 * Codes are compared as same-length strings in code-unit order, which matches
 * the `COLLATE "C"` range check constraint on `fico_gl_account_groups`.
 */

export type AccountCodeRange = {
    rangeFrom: string | null
    rangeTo: string | null
}

export const FICO_ACCOUNT_CODE_PATTERN = /^[A-Z0-9_.-]{1,32}$/

export const FICO_MAX_ACCOUNT_CODE_LENGTH = 32

export function normalizeAccountCode(value: string) {
    return value.trim().toUpperCase()
}

export function normalizeAccountCodeLength(
    value: number | null | undefined,
): number | null {
    if (value === undefined || value === null) return null
    if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > FICO_MAX_ACCOUNT_CODE_LENGTH
    ) {
        throw new BadRequestException(
            `Account code length must be a whole number between 1 and ${FICO_MAX_ACCOUNT_CODE_LENGTH}.`,
        )
    }
    return value
}

export function assertAccountCodeFormat(
    code: string,
    accountCodeLength: number | null | undefined,
) {
    if (!FICO_ACCOUNT_CODE_PATTERN.test(code)) {
        throw new BadRequestException(
            'Account code may contain letters, numbers, dots, underscores and dashes only.',
        )
    }
    if (accountCodeLength && code.length !== accountCodeLength) {
        throw new BadRequestException(
            `Account code ${code} must be exactly ${accountCodeLength} characters for this chart of accounts.`,
        )
    }
}

/** Normalizes an account-group range; both bounds are required together. */
export function normalizeAccountCodeRange(
    rangeFrom: string | null | undefined,
    rangeTo: string | null | undefined,
    accountCodeLength: number | null | undefined,
): AccountCodeRange {
    const from = rangeFrom?.trim() ? normalizeAccountCode(rangeFrom) : null
    const to = rangeTo?.trim() ? normalizeAccountCode(rangeTo) : null
    if (!from && !to) return { rangeFrom: null, rangeTo: null }
    if (!from || !to) {
        throw new BadRequestException(
            'An account range needs both a start and an end code.',
        )
    }
    assertAccountCodeFormat(from, accountCodeLength)
    assertAccountCodeFormat(to, accountCodeLength)
    if (from.length !== to.length) {
        throw new BadRequestException(
            'The start and end of an account range must have the same number of characters.',
        )
    }
    if (from > to) {
        throw new BadRequestException(
            'The start of an account range cannot be after its end.',
        )
    }
    return { rangeFrom: from, rangeTo: to }
}

export function hasRange(
    range: AccountCodeRange,
): range is { rangeFrom: string; rangeTo: string } {
    return Boolean(range.rangeFrom && range.rangeTo)
}

/** A group without a range accepts any code. */
export function isCodeInRange(code: string, range: AccountCodeRange) {
    if (!hasRange(range)) return true
    return (
        code.length === range.rangeFrom.length &&
        code >= range.rangeFrom &&
        code <= range.rangeTo
    )
}

export function isRangeWithin(inner: AccountCodeRange, outer: AccountCodeRange) {
    if (!hasRange(outer)) return true
    if (!hasRange(inner)) return false
    return (
        isCodeInRange(inner.rangeFrom, outer) && isCodeInRange(inner.rangeTo, outer)
    )
}

export function doRangesOverlap(a: AccountCodeRange, b: AccountCodeRange) {
    if (!hasRange(a) || !hasRange(b)) return false
    if (a.rangeFrom.length !== b.rangeFrom.length) return false
    return a.rangeFrom <= b.rangeTo && b.rangeFrom <= a.rangeTo
}

export function formatAccountCodeRange(range: AccountCodeRange) {
    return hasRange(range) ? `${range.rangeFrom}–${range.rangeTo}` : 'any code'
}
