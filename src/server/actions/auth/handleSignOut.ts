'use server'

import { cookies } from 'next/headers'
import { signOut } from '@/auth'
import appConfig from '@/configs/app.config'

/** Clear both Auth.js cookie name variants in case Secure flipped between requests. */
const SESSION_COOKIE_NAMES = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
] as const

const handleSignOut = async () => {
    const jar = await cookies()
    for (const name of SESSION_COOKIE_NAMES) {
        jar.delete(name)
    }
    await signOut({ redirectTo: appConfig.unAuthenticatedEntryPath })
}

export default handleSignOut
