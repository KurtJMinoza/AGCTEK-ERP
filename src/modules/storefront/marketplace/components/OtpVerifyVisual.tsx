'use client'

import { HiOutlineMail } from 'react-icons/hi'
import { useOtpExpiryCountdown } from '@/modules/storefront/shared/otpCountdown'

type Props = {
    sentAtMs: number | null
    email: string
}

/** Animated mail + live circular countdown for Gmail OTP. */
export default function OtpVerifyVisual({ sentAtMs, email }: Props) {
    const { label, progress, expired } = useOtpExpiryCountdown(sentAtMs)
    const radius = 36
    const circumference = 2 * Math.PI * radius
    const dash = circumference * progress

    return (
        <div className="relative mx-auto mt-6 flex w-full max-w-xs flex-col items-center">
            <div className="relative flex h-28 w-28 items-center justify-center">
                <span
                    className="absolute inset-0 animate-ping rounded-full bg-leaf-500/20"
                    aria-hidden
                />
                <span
                    className="absolute inset-2 animate-pulse rounded-full bg-leaf-500/10"
                    aria-hidden
                />
                <svg
                    className="absolute inset-0 -rotate-90"
                    width="112"
                    height="112"
                    viewBox="0 0 112 112"
                    aria-hidden
                >
                    <circle
                        cx="56"
                        cy="56"
                        r={radius}
                        fill="none"
                        stroke="rgb(51 65 85)"
                        strokeWidth="6"
                    />
                    <circle
                        cx="56"
                        cy="56"
                        r={radius}
                        fill="none"
                        stroke={expired ? 'rgb(239 68 68)' : 'rgb(110 231 183)'}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference - dash}
                        className="transition-[stroke-dashoffset] duration-300 ease-linear"
                    />
                </svg>
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 shadow-lg ring-2 ring-leaf-400/40">
                    <HiOutlineMail
                        className="animate-bounce text-3xl text-leaf-400"
                        aria-hidden
                    />
                </div>
            </div>
            <p className="mt-4 font-mono text-lg tabular-nums tracking-wide text-leaf-300">
                {expired ? 'Code expired' : `${label} left`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
                {expired
                    ? 'Request a new code below.'
                    : `Check ${email || 'your Gmail'} for the six digits.`}
            </p>
        </div>
    )
}