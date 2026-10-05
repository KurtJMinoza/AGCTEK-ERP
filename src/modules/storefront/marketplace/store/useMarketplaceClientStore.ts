import { createStorefrontClientStore } from '@/modules/storefront/shared/store/createStorefrontClientStore'

/** One shopper account for the whole marketplace, whichever store they buy from. */
export const useMarketplaceClientStore =
    createStorefrontClientStore('marketplace-client')
