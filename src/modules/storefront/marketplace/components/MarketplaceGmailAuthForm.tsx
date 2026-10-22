'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FcGoogle } from 'react-icons/fc'
import { HiOutlineMail } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import {
    fetchShopAuthPublicConfig,
    GMAIL_VALIDATION_MESSAGE,
    isGmailInput,
    normalizeGmailInput,
    requestShopEmailCode,
    signInWithGoogleCredential,
} from '@/services/storefront/shopAuthService'
import { toApiError } from '@/modules/sd/services/apiError'
import { PRIMARY_BUTTON } from '../marketplaceUi'
import { MARKETPLACE_OTP_PATH, marketplaceAuthHref } from '../host'

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: {
                        client_id: string
                        callback: (response: { credential?: string }) => void
                    }) => void
                    renderButton: (
                        parent: HTMLElement,
                        options: Record<string, unknown>,
                    ) => void
                }
            }
        }
    }
}

const OTP_EMAIL_STORAGE_KEY = 'shop-auth-gmail'
const GSI_SCRIPT_ID = 'google-gsi-client'

export function persistOtpEmail(email: string) {
    sessionStorage.setItem(OTP_EMAIL_STORAGE_KEY, normalizeGmailInput(email))
}

export function readOtpEmail(): string {
    return sessionStorage.getItem(OTP_EMAIL_STORAGE_KEY) ?? ''
}

export function clearOtpEmail() {
    sessionStorage.removeItem(OTP_EMAIL_STORAGE_KEY)
}

type Props = {
    returnPath: string
    onGoogleAuthenticated: (
        session: Awaited<ReturnType<typeof signInWithGoogleCredential>>,
    ) => void | Promise<void>
}

const MarketplaceGmailAuthForm = ({
    returnPath,
    onGoogleAuthenticated,
}: Props) => {
    const [email, setEmail] = useState('')
    const [emailError, setEmailError] = useState<string | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const googleBtnRef = useRef<HTMLDivElement>(null)
    const gsiInitializedForClientId = useRef<string | null>(null)
    const onGoogleAuthenticatedRef = useRef(onGoogleAuthenticated)
    onGoogleAuthenticatedRef.current = onGoogleAuthenticated
    const buildTimeClientId =
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || ''
    const [runtimeClientId, setRuntimeClientId] = useState('')
    const [pageOrigin, setPageOrigin] = useState('')
    const clientId = runtimeClientId || buildTimeClientId

    useEffect(() => {
        setPageOrigin(window.location.origin)
    }, [])

    useEffect(() => {
        let cancelled = false
        fetchShopAuthPublicConfig()
            .then((cfg) => {
                if (!cancelled && cfg.googleClientId) {
                    setRuntimeClientId(cfg.googleClientId)
                }
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [])

    const validateEmail = useCallback((value: string) => {
        const normalized = normalizeGmailInput(value)
        if (!normalized) {
            setEmailError('Email address is required.')
            return false
        }
        if (!isGmailInput(normalized)) {
            setEmailError(GMAIL_VALIDATION_MESSAGE)
            return false
        }
        setEmailError(null)
        return true
    }, [])

    useEffect(() => {
        if (!clientId || !googleBtnRef.current) return

        const mount = () => {
            if (!window.google?.accounts?.id || !googleBtnRef.current) return

            if (gsiInitializedForClientId.current !== clientId) {
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    error_callback: (gisError) => {
                        const detail =
                            typeof gisError === 'object' &&
                            gisError &&
                            'type' in gisError
                                ? String(
                                      (gisError as { type?: string }).type ??
                                          'unknown',
                                  )
                                : 'unknown'
                        if (detail === 'popup_closed_by_user') return
                        setFormError(
                            `Google sign-in was blocked (${detail}). Add ${window.location.origin} under Authorized JavaScript origins for OAuth client ${clientId.slice(0, 12)}… in Google Cloud Console.`,
                        )
                    },
                    callback: async (response) => {
                        if (!response.credential) return
                        setGoogleLoading(true)
                        setFormError(null)
                        try {
                            const session = await signInWithGoogleCredential(
                                response.credential,
                            )
                            await onGoogleAuthenticatedRef.current(session)
                        } catch (error) {
                            setFormError(
                                toApiError(
                                    error,
                                    'Google sign-in could not be verified.',
                                ).message,
                            )
                        } finally {
                            setGoogleLoading(false)
                        }
                    },
                })
                gsiInitializedForClientId.current = clientId
            }

            googleBtnRef.current.innerHTML = ''
            window.google.accounts.id.renderButton(googleBtnRef.current, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'continue_with',
                width: googleBtnRef.current.offsetWidth || 360,
            })
        }

        if (window.google?.accounts?.id) {
            mount()
            return
        }

        const existing = document.getElementById(GSI_SCRIPT_ID)
        if (existing) {
            existing.addEventListener('load', mount, { once: true })
            if (window.google?.accounts?.id) mount()
            return
        }

        const script = document.createElement('script')
        script.id = GSI_SCRIPT_ID
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.onload = mount
        document.body.appendChild(script)
    }, [clientId])

    const onSendCode = async (event: React.FormEvent) => {
        event.preventDefault()
        setFormError(null)
        setInfo(null)
        if (!validateEmail(email)) return
        setSending(true)
        try {
            const result = await requestShopEmailCode(email)
            persistOtpEmail(email)
            setInfo(result.message)
            const otpHref = marketplaceAuthHref(MARKETPLACE_OTP_PATH, returnPath)
            window.location.href = otpHref
        } catch (error) {
            setFormError(
                toApiError(error, 'We could not send the email. Please try again.')
                    .message,
            )
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="w-full">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Sign in to your account
            </h1>
            <p className="mt-2 text-sm text-gray-600">
                New customers must use Continue with Google to create an account
                with a verified Gmail address. Returning customers can sign in
                with an email verification code.
            </p>

            {formError ? (
                <Alert showIcon type="danger" className="mt-5">
                    {formError}
                </Alert>
            ) : null}
            {info ? (
                <Alert showIcon type="success" className="mt-5">
                    {info}
                </Alert>
            ) : null}

            <div className="mt-6">
                {clientId ? (
                    <div
                        ref={googleBtnRef}
                        className="flex min-h-[44px] w-full justify-center"
                        aria-busy={googleLoading}
                    />
                ) : (
                    <Button
                        block
                        type="button"
                        variant="default"
                        icon={<FcGoogle />}
                        disabled
                    >
                        Continue with Google
                    </Button>
                )}
                {clientId && pageOrigin ? (
                    <p className="mt-2 text-center text-xs text-gray-400">
                        Google OAuth must allow this origin:{' '}
                        <code className="rounded bg-gray-100 px-1">
                            {pageOrigin}
                        </code>
                        . Use port{' '}
                        <code className="rounded bg-gray-100 px-1">3010</code>{' '}
                        locally (erp-edge), not{' '}
                        <code className="rounded bg-gray-100 px-1">3020</code>.
                    </p>
                ) : null}
                {!clientId ? (
                    <p className="mt-2 text-center text-xs text-gray-400">
                        Set{' '}
                        <code className="rounded bg-gray-100 px-1">
                            GOOGLE_CLIENT_ID
                        </code>{' '}
                        in backend <code className="rounded bg-gray-100 px-1">.env</code>{' '}
                        and restart{' '}
                        <code className="rounded bg-gray-100 px-1">
                            erp-backend
                        </code>
                        .
                    </p>
                ) : null}
            </div>

            <div className="my-6 flex items-center gap-3" role="separator">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium text-gray-400">
                    or sign in with email (existing accounts)
                </span>
                <span className="h-px flex-1 bg-gray-200" />
            </div>

            <Form onSubmit={onSendCode} noValidate>
                <FormItem
                    label="Email Address"
                    asterisk
                    invalid={Boolean(emailError)}
                    errorMessage={emailError ?? undefined}
                >
                    <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        prefix={<HiOutlineMail className="text-lg text-gray-400" />}
                        aria-invalid={Boolean(emailError)}
                        onChange={(e) => {
                            setEmail(e.target.value)
                            if (emailError) validateEmail(e.target.value)
                            if (formError) setFormError(null)
                        }}
                        onBlur={() => email.trim() && validateEmail(email)}
                    />
                </FormItem>
                <Button
                    block
                    type="submit"
                    loading={sending}
                    disabled={sending}
                    customColorClass={PRIMARY_BUTTON}
                >
                    Send sign-in code
                </Button>
            </Form>

            <p className="mt-8 text-center text-xs text-gray-500">
                By continuing, you agree to the{' '}
                <Link href="/shop" className="underline hover:text-shop-700">
                    Terms
                </Link>{' '}
                and{' '}
                <Link href="/shop" className="underline hover:text-shop-700">
                    Privacy Policy
                </Link>
                .
            </p>
        </div>
    )
}

export default MarketplaceGmailAuthForm
