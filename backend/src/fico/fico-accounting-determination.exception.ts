import { BadRequestException } from '@nestjs/common'
import { FICO_ACCOUNTING_ERROR_CODES } from './fico-accounting-event.constants'

/**
 * Structured failure when centralized account determination cannot resolve
 * all required G/L lines. Downstream must not post partial journals.
 */
export class FicoAccountingDeterminationException extends BadRequestException {
    readonly errorCode = FICO_ACCOUNTING_ERROR_CODES.ACCOUNT_DETERMINATION_NOT_FOUND

    constructor(
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message)
    }
}

export function isAccountingDeterminationError(
    err: unknown,
): err is FicoAccountingDeterminationException {
    return err instanceof FicoAccountingDeterminationException
}