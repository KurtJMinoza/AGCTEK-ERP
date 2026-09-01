'use server'

import { signOut } from '@/auth'
import appConfig from '@/configs/app.config'

const handleSignOut = async () => {
    await signOut({ redirectTo: appConfig.unAuthenticatedEntryPath })
}

export default handleSignOut
