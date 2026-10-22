'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HiOutlineArrowLeft } from 'react-icons/hi'
import OtpInput from '@/components/shared/OtpInput'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import {
    MARKETPLACE_SIGN_IN_PATH,
    marketplaceAuthHref,
    safeReturnPath,
} from '../host'
import {
    BRAND_GRID_SURFACE,
    MARKETPLACE_LOGO_SRC,
    MARKETPLACE_NAME,
    PRIMARY_BUTTON,
} from '../marketplaceUi'
import {
    clearOtpEmail,
    readOtpEmail,
} from '../components/MarketplaceGmailAuthForm'
import {
    requestShopEmailCode,
    verifyShopEmailCode,
} from '@/services/storefront/shopAuthService'
import { toApiError } from '@/modules/sd/services/apiError'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'
import { useMarketplaceCartStore } from '../store/useMarketplaceCartStore'
import { syncShopperCartAfterAuth } from '@/modules/storefront/shared/syncShopperCartAfterAuth'
import { updateRetailClientProfile } from '@/services/storefront/retailClientService'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60
const OTP_BOX_CLASS =
    '!h-12 !w-12 sm:!h-14 sm:!w-14 !rounded-xl !border-slate-700 !bg-slate-900 !text-xl !font-semibold !text-white caret-leaf-400 focus:!border-leaf-400 focus:!ring-2 focus:!ring-leaf-400'

type MarketplaceOtpPageProps = {
    next?: string | null
}

const MarketplaceOtpPage = ({ next }: MarketplaceOtpPageProps) => {
    const router = useRouter()
    const returnPath = safeReturnPath(next)
    const applySession = useMarketplaceClientStore((s) => s.applyShopSession)
    const guestItems = useMarketplaceCartStore((s) => s.items)
    const setCartItems = useMarketplaceCartStore.setState

    const [email, setEmail] = useState('')
    const [code, setCode] = useState('')
    const [firstName, setFirstName] = useState('')
    const [needsProfile, setNeedsProfile] = useState(false)
    const [pendingToken, setPendingToken] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [verifying, setVerifying] = useState(false)
    const [resendIn, setResendIn] = useState(RESEND_SECONDS)
    const [expiryLabel] = useState('10 minutes')
    const verifyLock = useRef(false)

    useEffect(() => {
        const stored = readOtpEmail()
        if (!stored) {
            router.replace(marketplaceAuthHref(MARKETPLACE_SIGN_IN_PATH, next))
            return
        }
        setEmail(stored)
    }, [next, router])

    useEffect(() => {
        if (resendIn <= 0) return
        const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
        return () => clearInterval(t)
    }, [resendIn])

    const finishAuth = useCallback(
        async (session: Awaited<ReturnType<typeof verifyShopEmailCode>>) => {
            applySession(session)
            const merged = await syncShopperCartAfterAuth(
                session,
                guestItems,
                (p) => p.sku,
            )
            setCartItems({ items: merged })
            clearOtpEmail()
            router.replace(returnPath)
        },
        [applySession, guestItems, returnPath, router, setCartItems],
    )

    const runVerify = async (otp: string, name?: string) => {
        if (verifyLock.current || otp.length !== OTP_LENGTH) return
        verifyLock.current = true
        setVerifying(true)
        setError(null)
        try {
            const session = await verifyShopEmailCode({
                email,
                code: otp,
                firstName: name,
            })
            if (session.needsProfile && !name?.trim()) {
                setNeedsProfile(true)
                setPendingToken(session.token)
                applySession(session)
                setInfo('Your Gmail has been verified.')
                return
            }
            await finishAuth(session)
        } catch (err) {
            setError(
                toApiError(err, 'The verification code is incorrect.').message,
            )
        } finally {
            setVerifying(false)
            verifyLock.current = false
        }
    }

    useEffect(() => {
        if (code.length === OTP_LENGTH && !needsProfile) {
            void runVerify(code)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, needsProfile])

    const onResend = async () => {
        if (resendIn > 0) return
        setError(null)
        try {
            await requestShopEmailCode(email)
            setInfo('Verification code sent.')
            setResendIn(RESEND_SECONDS)
            setCode('')
        } catch (err) {
            setError(
                toApiError(err, 'We could not send the email. Please try again.')
                    .message,
            )
        }
    }

    const onCompleteProfile = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = firstName.trim()
        if (!name) {
            setError('First name is required.')
            return
        }
        if (!pendingToken) return
        setVerifying(true)
        setError(null)
        try {
            await updateRetailClientProfile(pendingToken, { firstName: name })
            clearOtpEmail()
            router.replace(returnPath)
        } catch (err) {
            setError(toApiError(err, 'Unable to save your profile.').message)
        } finally {
            setVerifying(false)
        }
    }

    return (
        <div
            className={`flex min-h-screen items-center justify-center px-6 py-12 ${BRAND_GRID_SURFACE}`}
        >
            <main className="w-full max-w-md text-center">
                <Link
                    href={marketplaceAuthHref(MARKETPLACE_SIGN_IN_PATH, next)}
                    className="mb-10 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
                    onClick={() => clearOtpEmail()}
                >
                    <HiOutlineArrowLeft aria-hidden />
                    Change email address
                </Link>

                <div className="relative mx-auto h-20 w-20">
                    <Image
                        src={MARKETPLACE_LOGO_SRC}
                        alt={`${MARKETPLACE_NAME} logo`}
                        fill
                        priority
                        sizes="80px"
                        className="object-contain"
                    />
                </div>

                <h1 className="mt-8 text-3xl font-semibold tracking-tight text-white drop-shadow-md">
                    {needsProfile ? 'Almost there' : 'Verify your Gmail'}
                </h1>
                <p className="mt-3 text-sm text-slate-400">
                    {needsProfile ? (
                        'Tell us your first name to finish setting up your account.'
                    ) : (
                        <>
                            We sent a six-digit verification code to:
                            <br />
                            <span className="font-medium text-slate-200">
                                {email || '…'}
                            </span>
                        </>
                    )}
                </p>

                {error ? (
                    <Alert showIcon type="danger" className="mt-6 text-left">
                        {error}
                    </Alert>
                ) : null}
                {info ? (
                    <Alert showIcon type="success" className="mt-6 text-left">
                        {info}
                    </Alert>
                ) : null}

                {needsProfile ? (
                    <Form
                        className="mt-8 text-left"
                        onSubmit={onCompleteProfile}
                    >
                        <FormItem label="First name" asterisk>
                            <Input
                                autoFocus
                                value={firstName}
                                placeholder="Juan"
                                autoComplete="given-name"
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                        </FormItem>
                        <Button
                            block
                            type="submit"
                            loading={verifying}
                            customColorClass={PRIMARY_BUTTON}
                        >
                            Continue to shop
                        </Button>
                    </Form>
                ) : (
                    <>
                        <OtpInput
                            autoFocus
                            length={OTP_LENGTH}
                            value={code}
                            disabled={verifying}
                            onChange={(value) => {
                                if (/^\d*$/.test(value)) setCode(value)
                            }}
                            className="mt-10 justify-center"
                            inputClass={OTP_BOX_CLASS}
                        />
                        <p className="mt-4 text-xs text-slate-500">
                            Code expires in {expiryLabel}.
                        </p>
                        <Button
                            block
                            type="button"
                            className="mt-6"
                            loading={verifying}
                            disabled={code.length !== OTP_LENGTH || verifying}
                            customColorClass={PRIMARY_BUTTON}
                            onClick={() => runVerify(code)}
                        >
                            Verify and continue
                        </Button>
                        <p className="mt-6 text-sm text-slate-500">
                            Didn&apos;t receive the code?{' '}
                            {resendIn > 0 ? (
                                <span>Resend in {resendIn}s</span>
                            ) : (
                                <button
                                    type="button"
                                    className="font-medium text-leaf-400 underline"
                                    onClick={() => void onResend()}
                                >
                                    Resend code
                                </button>
                            )}
                        </p>
                    </>
                )}
            </main>
        </div>
    )
}

export default MarketplaceOtpPage
