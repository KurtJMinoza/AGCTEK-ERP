'use client'

import StorefrontAccountDialog from '@/modules/storefront/shared/components/StorefrontAccountDialog'
import { useLpgClientStore } from '../store/useLpgClientStore'
import { ORANGE_BUTTON } from './lpgUi'

const LpgAccountDialog = () => (
    <StorefrontAccountDialog
        useClientStore={useLpgClientStore}
        storeName="LPG Store"
        accentButtonClass={ORANGE_BUTTON}
        formId="lpg-account-form"
    />
)

export default LpgAccountDialog
