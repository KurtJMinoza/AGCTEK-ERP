import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { LPG_CATEGORIES, LPG_DIVISION_ID } from './lpgCatalog'
import { APPLIANCE_CATEGORIES, APPLIANCES_DIVISION_ID } from './mconpincoCatalog'

export type ProductDivision = {
    id: string
    label: string
    /** Storefront filters match on these exact category names. */
    categories: readonly string[]
}

export const PRODUCT_DIVISIONS: readonly ProductDivision[] = [
    {
        id: RETAIL_DIVISION_ID,
        label: 'AWIC',
        categories: ['Vitamins', 'Bags', 'Accessories', 'General Goods'],
    },
    { id: LPG_DIVISION_ID, label: 'LPG', categories: LPG_CATEGORIES },
    {
        id: APPLIANCES_DIVISION_ID,
        label: 'MCONPINCO',
        categories: APPLIANCE_CATEGORIES,
    },
]

export const productDivisionLabel = (divisionId: string) =>
    PRODUCT_DIVISIONS.find((d) => d.id === divisionId)?.label ?? divisionId
