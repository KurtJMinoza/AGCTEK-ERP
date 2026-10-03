import type { ApplianceProduct } from '@/modules/sd/catalogs/mconpincoCatalog'
import { createStorefrontCartStore } from '@/modules/storefront/shared/store/createStorefrontCartStore'

/** MCONPINCO (DIV_APPLIANCES) cart — isolated from the AWIC and LPG carts. */
export const useMconpincoCartStore = createStorefrontCartStore<ApplianceProduct>()
