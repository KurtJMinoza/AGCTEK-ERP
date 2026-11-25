import type { AccountResolutionResult } from './fico-account-resolution.service'
import type { AccountDeterminationResult } from './fico-account-determination.types'

export type DeterminationSimulationMode =
    | 'SINGLE_KEY'
    | 'MULTI_KEY'
    | 'DRAFT_RULE'
    | 'SOURCE_DOCUMENT'

export type SimulationUnmatchedCondition = {
    dimension: string
    ruleValue: string | null
    inputValue: string | null
}

export type SimulationCandidateTrace = {
    ruleId: string
    determinationCode: string
    name: string
    status: string
    priority: number
    specificity: number
    ruleVersion: number
    matchedDimensions: string[]
    unmatchedConditions: SimulationUnmatchedCondition[]
    eligible: boolean
    rejectReason?: string
    isDraftProposal?: boolean
}

export type DeterminationSimulationResult = {
    safeDryRun: true
    mode: DeterminationSimulationMode
    companyId: string
    chartOfAccountsId: string | null
    chartOfAccountsCode: string | null
    sourceModule: string
    postingDate: string
    transactionKey?: string
    transactionKeys?: string[]
    inputDimensions: Record<string, string | null>
    candidates: SimulationCandidateTrace[]
    selectedRule: SimulationCandidateTrace | null
    resolution: AccountResolutionResult | null
    determination: AccountDeterminationResult | null
    configurationErrors: string[]
    validationWarnings: string[]
    batchItems?: Array<{
        transactionKey: string
        ok: boolean
        message?: string
        determination?: AccountDeterminationResult
    }>
    draftRuleNote?: string
}