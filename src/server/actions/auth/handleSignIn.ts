'use server'

import { signIn } from '@/auth'
import appConfig from '@/configs/app.config'
import { AuthError } from 'next-auth'
import type { SignInCredential } from '@/@types/auth'
import getPublicSettings from '@/server/actions/system/getPublicSettings'

export const onSignInWithCredentials = async (
    { userName, password, rememberMe }: SignInCredential,
    callbackUrl?: string,
) => {
    try {
        await signIn('credentials', {
            userName,
            password,
            rememberMe: Boolean(rememberMe),
            redirectTo: callbackUrl || appConfig.authenticatedEntryPath,
        })
    } catch (error) {
        if (error instanceof AuthError) {
            if (error.type === 'CredentialsSignin') {
                const { maintenance_mode } = await getPublicSettings()
                return {
                    error: maintenance_mode
                        ? 'Invalid credentials, or the system is under maintenance (only Super Admins can sign in).'
                        : 'Invalid credentials!',
                }
            }
            return { error: 'Something went wrong!' }
        }
        throw error
    }
}
