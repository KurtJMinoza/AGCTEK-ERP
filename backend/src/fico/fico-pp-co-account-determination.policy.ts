/**
 * Phase 04.19 — production / CO account determination foundation (CONFIG_ONLY).
 * PP/CO must own costing, settlement, and journal creation; this module only
 * exposes transaction keys and rule dimensions for future integration.
 */

export const FICO_PP_CO_ACCOUNTING_FLOW = [
    'RAW_MATERIAL_CONSUMPTION',
    'WORK_IN_PROCESS',
    'FINISHED_GOODS',
    'PRODUCTION_VARIANCE',
    'MATERIAL_USAGE_VARIANCE',
    'PRODUCTION_PRICE_VARIANCE',
    'OVERHEAD_ABSORPTION',
    'PRODUCTION_SCRAP',
] as const

export const FICO_PHASE0419_TRANSACTION_KEYS = [...FICO_PP_CO_ACCOUNTING_FLOW] as const

/** Narrative flow for finance rule design (no automatic PP posting). */
export const FICO_PP_CO_FLOW_NARRATIVE = `Raw Materials Inventory → Production Material Consumption →
Production Order Cost Accumulation → Work in Process → Finished Goods Inventory →
Production Settlement and Variances`