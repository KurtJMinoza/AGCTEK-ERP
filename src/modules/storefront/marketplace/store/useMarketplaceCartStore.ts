import { createStorefrontCartStore } from '@/modules/storefront/shared/store/createStorefrontCartStore'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { productKey } from '../marketplaceUi'

/** One cart across every division; checkout splits it into per-division sales orders. */
export const useMarketplaceCartStore = createStorefrontCartStore<SdProductRecord>(
    productKey,
    'marketplace-cart',
)
