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

export function useReferenceData() {
    const [data, setData] = useState<ReferenceData>(empty)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const [
                    materialTypes,
                    materialCategories,
                    uoms,
                    uomConversions,
                    valuationClasses,
                    currencies,
                    companies,
                    warehouses,
                ] = await Promise.all([
                    materialTypeService.list(),
                    materialCategoryService.list(),
                    uomService.list(),
                    uomConversionService.list(),
                    orgService.valuationClasses(),
                    orgService.currencies(),
                    orgService.companies(),
                    orgService.warehouses(),
                ])
                if (!cancelled) {
                    setData({
                        materialTypes,
                        materialCategories,
                        uoms,
                        uomConversions,
                        valuationClasses,
                        currencies,
                        companies,
                        warehouses,
                    })
                }
            } catch (err) {
                console.error('Failed to load reference data', err)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [])

    return { ...data, loading }
}
