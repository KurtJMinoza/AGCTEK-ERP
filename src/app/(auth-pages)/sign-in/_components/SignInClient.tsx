'use client'

import SignIn from '@/components/auth/SignIn'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import type { OnSignInPayload } from '@/components/auth/SignIn'

/** Keep post-login navigation on the current origin (never jump to :3020). */
function safeCallbackPath(raw: string | null | undefined, fallback: string) {
    const value = (raw || fallback).trim() || fallback
    try {
        if (value.startsWith('/')) return value
        const url = new URL(value)
        if (typeof window !== 'undefined' && url.origin === window.location.origin) {
            return `${url.pathname}${url.search}${url.hash}` || fallback
        }
    } catch {
        /* ignore */
    }
    return fallback
}

const SignInClient = () => {
    const searchParams = useSearchParams()
    const callbackUrl = safeCallbackPath(
        searchParams.get(REDIRECT_URL_KEY),
        '/home',
    )

    const handleSignIn = async ({
        values,
        setSubmitting,
        setMessage,
    }: OnSignInPayload) => {
        setSubmitting(true)

        try {
            const result = await signIn('credentials', {
                userName: values.userName,
                password: values.password,
                rememberMe: values.rememberMe ? 'true' : 'false',
                redirect: false,
                callbackUrl,
            })

            if (result?.error) {
                setMessage('Invalid credentials!')
                return
            }

            window.location.assign(
                safeCallbackPath(result?.url, callbackUrl),
            )
        } catch {
            setMessage('Something went wrong!')
        } finally {
            setSubmitting(false)
        }
    }

    return <SignIn onSignIn={handleSignIn} />
}

export default SignInClient
