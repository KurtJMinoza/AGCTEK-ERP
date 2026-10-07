import { productDivisionLabel } from '../catalogs/productDivisions'
import type { SdProductRecord } from '../services/productCatalogService'

/** Storefront / catalog label: MM company when linked, else division name. */
export const productSellerLabel = (
    product: Pick<SdProductRecord, 'divisionId' | 'company'>,
) => product.company?.name?.trim() || productDivisionLabel(product.divisionId)
