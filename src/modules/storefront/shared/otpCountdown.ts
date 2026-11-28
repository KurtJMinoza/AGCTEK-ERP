'use client'

import { useEffect, useState } from 'react'

export const OTP_EXPIRY_MS = 10 * 60 * 1000
export const OTP_RESEND_SECONDS = 60

const OTP_SENT_AT_KEY = 'shop-auth-otp-sent-at'

export function markOtpCodeSent(): void {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(OTP_SENT_AT_KEY, String(Date.now()))
}

export function readOtpSentAt(): number | null {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(OTP_SENT_AT_KEY)
    if (!raw) return Date.now()
    const n = Number(raw)
    return Number.isFinite(n) ? n : Date.now()
}

export function clearOtpSentAt(): void {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(OTP_SENT_AT_KEY)
}

export function formatCountdown(remainingMs: number): string {
    const totalSec = Math.ceil(remainingMs / 1000)
    const mm = Math.floor(totalSec / 60)
    const ss = totalSec % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
}

/** Live 10-minute OTP expiry countdown (ticks every second). */
export function useOtpExpiryCountdown(sentAtMs: number | null) {
    const [remainingMs, setRemainingMs] = useState(OTP_EXPIRY_MS)

    useEffect(() => {
        if (sentAtMs == null) return
        const tick = () => {
            setRemainingMs(Math.max(0, sentAtMs + OTP_EXPIRY_MS - Date.now()))
        }
        tick()
        const id = window.setInterval(tick, 250)
        return () => window.clearInterval(id)
    }, [sentAtMs])

    const progress = Math.max(0, Math.min(1, remainingMs / OTP_EXPIRY_MS))

    return {
        remainingMs,
        label: formatCountdown(remainingMs),
        expired: remainingMs <= 0,
        progress,
    }
}