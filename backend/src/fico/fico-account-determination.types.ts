import type { FicoDeterminationDimension } from './fico-account-determination.constants'
import type {
    AccountResolutionRequest,
    AccountResolutionResult,
    ResolvedAccountLine,
} from './fico-account-resolution.service'

/**
 * Phase 04.05 — internal account determination contract (backend-only).
 * Callers from MM/SD/PP adapters supply trusted dimensions from domain services.
 */
export type AccountDeterminationDimensions = {
    valuationAreaId?: string
    valuationClassId?: string
    materialGroupId?: string
    materialGroupCode?: string
    movementTypeId?: string

    supplierAccountGroupId?: string
    customerAccountGroupId?: string

    customerAccountAssignmentGroupId?: string
    productAccountAssignmentGroupId?: string
    salesOrganizationId?: string
    distributionChannelId?: string
    salesChannelCode?: string

    taxCodeId?: string
    paymentMethodId?: string
    paymentMethodCode?: string
    bankAccountId?: string
    paymentProviderCode?: string
    currencyCode?: string
    branchId?: string

    assetClassId?: string
    assetClassCode?: string
    depreciationAreaId?: string
    depreciationAreaCode?: string
    documentTypeCode?: string

    productionOrderTypeId?: string
    productionOrderTypeCode?: string
    costElementCategoryCode?: string
    controllingAreaCode?: string

    /** Legacy flat names used by today’s rule table */
    materialTypeCode?: string
    movementType?: string
    customerAccountGroup?: string
    salesOrganization?: string
    distributionChannel?: string
}

export type AccountDeterminationRequest = {
    companyId: string
    transactionKey: string
    sourceModule: string
    postingDate: Date | string

    documentType?: string
    chartOfAccountsId?: string
    currencyCode?: string | null

    /** When omitted, derived from the transaction key catalogue */
    transactionType?: string

    dimensions: AccountDeterminationDimensions
}

export type AccountDeterminationResult = {
    glAccountId: string
    glAccountCode: string
    glAccountName: string

    transactionKey: string

    ruleId: string
    ruleVersion: number

    resolutionScope: string
    matchedDimensions: Record<string, string>

    configurationRevision?: string

    /** Full double-entry resolution (all rule lines) */
    resolution: AccountResolutionResult
}

export type AccountDeterminationBatchItem = {
    transactionKey: string
    transactionType?: string
    /** Pick the first line on this side when exposing a single account role */
    preferredSide?: 'DEBIT' | 'CREDIT'
}

export type AccountDeterminationBatchRequest = {
    companyId: string
    sourceModule: string
    postingDate: Date | string
    currencyCode?: string | null
    documentType?: string
    dimensions: AccountDeterminationDimensions
    items: AccountDeterminationBatchItem[]
}

export type AccountDeterminationBatchResult = {
    companyId: string
    chartOfAccountsId: string
    postingDate: string
    configurationRevision: string
    items: AccountDeterminationResult[]
}

export type AccountDeterminationBatchFailure = {
    ok: false
    companyId: string
    postingDate: string
    failures: Array<{
        transactionKey: string
        message: string
    }>
}

export function flattenDeterminationDimensions(
    dimensions: AccountDeterminationDimensions,
): Pick<
    AccountResolutionRequest,
    | 'valuationClassId'
    | 'materialTypeCode'
    | 'materialGroupCode'
    | 'movementType'
    | 'customerAccountGroup'
    | 'salesOrganization'
    | 'distributionChannel'
    | 'salesChannelCode'
    | 'taxCodeId'
    | 'paymentMethodCode'
    | 'bankAccountId'
    | 'paymentProviderCode'
    | 'currencyCode'
    | 'branchId'
    | 'assetClassCode'
    | 'depreciationAreaCode'
    | 'documentTypeCode'
    | 'productionOrderTypeCode'
    | 'costElementCategoryCode'
    | 'controllingAreaCode'
> {
    return {
        valuationClassId:
            dimensions.valuationClassId ?? dimensions.valuationAreaId ?? null,
        materialTypeCode: dimensions.materialTypeCode ?? null,
        materialGroupCode: dimensions.materialGroupCode ?? dimensions.materialGroupId ?? null,
        movementType:
            dimensions.movementType ?? dimensions.movementTypeId ?? null,
        customerAccountGroup:
            dimensions.customerAccountGroup ??
            dimensions.customerAccountGroupId ??
            null,
        salesOrganization:
            dimensions.salesOrganization ??
            dimensions.salesOrganizationId ??
            null,
        distributionChannel:
            dimensions.distributionChannel ??
            dimensions.distributionChannelId ??
            null,
        salesChannelCode: dimensions.salesChannelCode ?? null,
        taxCodeId: dimensions.taxCodeId ?? null,
        paymentMethodCode: dimensions.paymentMethodCode ?? null,
        bankAccountId: dimensions.bankAccountId ?? null,
        paymentProviderCode: dimensions.paymentProviderCode ?? null,
        currencyCode: dimensions.currencyCode ?? null,
        branchId: dimensions.branchId ?? null,
        assetClassCode:
            dimensions.assetClassCode ?? dimensions.assetClassId ?? null,
        depreciationAreaCode:
            dimensions.depreciationAreaCode ??
            dimensions.depreciationAreaId ??
            null,
        documentTypeCode: dimensions.documentTypeCode ?? null,
        productionOrderTypeCode:
            dimensions.productionOrderTypeCode ??
            dimensions.productionOrderTypeId ??
            null,
        costElementCategoryCode: dimensions.costElementCategoryCode ?? null,
        controllingAreaCode: dimensions.controllingAreaCode ?? null,
    }
}

export function matchedDimensionsToRecord(
    rule: AccountResolutionResult['rule'],
    dimensionValues: Pick<
        AccountResolutionRequest,
        FicoDeterminationDimension | 'transactionKeyCode'
    >,
): Record<string, string> {
    const out: Record<string, string> = {}
    for (const key of rule.matchedDimensions) {
        const value = dimensionValues[key]
        if (value) out[key] = value
    }
    if (rule.matchedTransactionKey && dimensionValues.transactionKeyCode) {
        out.transactionKey = dimensionValues.transactionKeyCode
    }
    return out
}

export type { ResolvedAccountLine }