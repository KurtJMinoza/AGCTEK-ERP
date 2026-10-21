import {
    createStorefrontCartStore,
    storefrontCartItemKey,
    type StorefrontCartItem,
} from '@/modules/storefront/shared/store/createStorefrontCartStore'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { productKey } from '../marketplaceUi'

/** One cart across every division; checkout splits it into per-division sales orders. */
export const useMarketplaceCartStore = createStorefrontCartStore<SdProductRecord>(
    productKey,
    'marketplace-cart',
)

/**
 * Variant-aware cart-line key. Consumers must use this (not the bare product
 * key) when filtering or selecting cart lines, otherwise a variant line can
 * never be selected and can never reach checkout.
 */
export const marketplaceCartItemKey = (
    item: StorefrontCartItem<SdProductRecord>,
) => storefrontCartItemKey(item, productKey)
