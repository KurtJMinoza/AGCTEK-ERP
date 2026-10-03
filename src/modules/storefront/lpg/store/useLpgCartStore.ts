import type { LpgProduct } from '@/modules/sd/catalogs/lpgCatalog'
import {
    createStorefrontCartStore,
    type StorefrontCartItem,
} from '@/modules/storefront/shared/store/createStorefrontCartStore'

export type LpgCartItem = StorefrontCartItem<LpgProduct>

/** LPG division cart — kept separate from the AWIC retail cart. */
export const useLpgCartStore = createStorefrontCartStore<LpgProduct>()
