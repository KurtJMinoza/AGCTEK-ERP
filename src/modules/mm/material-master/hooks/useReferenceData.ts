'use client'

import { useState, useEffect } from 'react'
import {
    materialTypeService,
    materialCategoryService,
    uomService,
    uomConversionService,
    orgService,
} from '../services/referenceService'
import type {
    MmMaterialType,
    MmMaterialCategory,
    MmUom,
    MmUomConversion,
    MmValuationClass,
    MmCurrency,
    MmCompany,
    MmWarehouse,
} from '../types'

export interface ReferenceData {
    materialTypes: MmMaterialType[]
    materialCategories: MmMaterialCategory[]
    uoms: MmUom[]
    uomConversions: MmUomConversion[]
    valuationClasses: MmValuationClass[]
    currencies: MmCurrency[]
    companies: MmCompany[]
    warehouses: MmWarehouse[]
}

export type ReferenceKey = keyof ReferenceData

const empty: ReferenceData = {
    materialTypes: [],
    materialCategories: [],
    uoms: [],
    uomConversions: [],
    valuationClasses: [],
    currencies: [],
    companies: [],
    warehouses: [],
}

const ALL_KEYS: ReferenceKey[] = [
    'materialTypes',
    'materialCategories',
    'uoms',
    'uomConversions',
    'valuationClasses',
    'currencies',
    'companies',
    'warehouses',
]

/**
 * Load only the reference slices you need.
 * Materials list: useReferenceData(['materialTypes','materialCategories'])
 * Form dialog: useReferenceData() or full key list
 */
export function useReferenceData(keys: ReferenceKey[] = ALL_KEYS) {
    const [data, setData] = useState<ReferenceData>(empty)
    const [loading, setLoading] = useState(true)
    const keySig = keys.slice().sort().join(',')

    useEffect(() => {
        let cancelled = false
        const wanted = new Set(keys.length ? keys : ALL_KEYS)

        async function load() {
            try {
                const tasks: Promise<void>[] = []
                const next: ReferenceData = { ...empty }

                if (wanted.has('materialTypes')) {
                    tasks.push(
                        materialTypeService.list().then((r) => {
                            next.materialTypes = r
                        }),
                    )
                }
                if (wanted.has('materialCategories')) {
                    tasks.push(
                        materialCategoryService.list().then((r) => {
                            next.materialCategories = r
                        }),
                    )
                }
                if (wanted.has('uoms')) {
                    tasks.push(
                        uomService.list().then((r) => {
                            next.uoms = r
                        }),
                    )
                }
                if (wanted.has('uomConversions')) {
                    tasks.push(
                        uomConversionService.list().then((r) => {
                            next.uomConversions = r
                        }),
                    )
                }
                if (wanted.has('valuationClasses')) {
                    tasks.push(
                        orgService.valuationClasses().then((r) => {
                            next.valuationClasses = r
                        }),
                    )
                }
                if (wanted.has('currencies')) {
                    tasks.push(
                        orgService.currencies().then((r) => {
                            next.currencies = r
                        }),
                    )
                }
                if (wanted.has('companies')) {
                    tasks.push(
                        orgService.companies().then((r) => {
                            next.companies = r
                        }),
                    )
                }
                if (wanted.has('warehouses')) {
                    tasks.push(
                        orgService.warehouses().then((r) => {
                            next.warehouses = r
                        }),
                    )
                }

                await Promise.all(tasks)
                if (!cancelled) setData(next)
            } catch (err) {
                console.error('Failed to load reference data', err)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keySig])

    return { ...data, loading }
}
