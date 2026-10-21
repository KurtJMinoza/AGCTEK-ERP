'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { HiOutlineArrowLeft } from 'react-icons/hi'
import OtpInput from '@/components/shared/OtpInput'
import { MARKETPLACE_SIGN_IN_PATH, marketplaceAuthHref } from '../host'
import {
    BRAND_GRID_SURFACE,
    MARKETPLACE_LOGO_SRC,
    MARKETPLACE_NAME,
} from '../marketplaceUi'

const OTP_LENGTH = 6

const OTP_BOX_CLASS =
    '!h-12 !w-12 sm:!h-14 sm:!w-14 !rounded-xl !border-slate-700 !bg-slate-900 !text-xl !font-semibold !text-white caret-leaf-400 focus:!border-leaf-400 focus:!ring-2 focus:!ring-leaf-400'

type MarketplaceOtpPageProps = {
    next?: string | null
}

/**
 * Mobile-number verification screen. UI mockup only: no code is sent or checked
 * until the SMS/OTP backend exists.
 */
const MarketplaceOtpPage = ({ next }: MarketplaceOtpPageProps) => {
    const [code, setCode] = useState('')

    return (
        <div
            className={`flex min-h-screen items-center justify-center px-6 py-12 ${BRAND_GRID_SURFACE}`}
        >
            <main className="w-full max-w-md text-center">
                <Link
                    href={marketplaceAuthHref(MARKETPLACE_SIGN_IN_PATH, next)}
                    className="mb-10 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
                >
                    <HiOutlineArrowLeft aria-hidden />
                    Back to sign in
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
                    Verify your number
                </h1>
                <p className="mt-3 text-sm text-slate-400">
                    Enter the 6-digit code we sent to +63 9•• ••• ••••
                </p>

                <OtpInput
                    autoFocus
                    length={OTP_LENGTH}
                    value={code}
                    onChange={(value) => {
                        if (/^\d*$/.test(value)) setCode(value)
                    }}
                    className="mt-10 justify-center"
                    inputClass={OTP_BOX_CLASS}
                />

                <p className="mt-8 text-sm text-slate-500">
                    Didn&apos;t receive the code? Resend in 24s
                </p>
            </main>
        </div>
    )
}

export default MarketplaceOtpPage
