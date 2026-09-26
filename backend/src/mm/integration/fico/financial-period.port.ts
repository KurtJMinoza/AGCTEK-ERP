export type CanPostToPeriodInput = {
    companyId: string
    postingDate: Date | string
}

export type CanPostToPeriodResult = {
    allowed: boolean
    periodKey?: string
    reason?: string
}

export interface FinancialPeriodPort {
    canPostToPeriod(input: CanPostToPeriodInput): Promise<CanPostToPeriodResult>
}

export const FINANCIAL_PERIOD_PORT = Symbol('FINANCIAL_PERIOD_PORT')
