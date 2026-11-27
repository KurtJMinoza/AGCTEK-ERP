import { BadRequestException } from '@nestjs/common'
import type { FicoFinancialErrorCode } from './fico.constants'

export class FicoFinancialException extends BadRequestException {
    constructor(
        public readonly code: FicoFinancialErrorCode,
        message: string,
        public readonly details?: Record<string, unknown>,
    ) {
        super({
            code,
            message,
            details: details ?? null,
        })
    }
}