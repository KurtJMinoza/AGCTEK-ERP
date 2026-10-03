import { createStorefrontClientStore } from '@/modules/storefront/retail/store/retailClientStore'

/** MCONPINCO storefront session, persisted separately from AWIC and LPG. */
export const useMconpincoClientStore = createStorefrontClientStore('mconpinco-client')
