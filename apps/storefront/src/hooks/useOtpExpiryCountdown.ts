import { useEffect, useState } from 'react'

export const OTP_EXPIRY_MS = 10 * 60 * 1000
export const OTP_RESEND_SECONDS = 60

export function formatCountdown(remainingMs: number): string {
    const totalSec = Math.ceil(remainingMs / 1000)
    const mm = Math.floor(totalSec / 60)
    const ss = totalSec % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
}

export function useOtpExpiryCountdown(sentAtMs: number | null) {
    const [remainingMs, setRemainingMs] = useState(OTP_EXPIRY_MS)

    useEffect(() => {
        if (sentAtMs == null) return
        const tick = () => {
            setRemainingMs(Math.max(0, sentAtMs + OTP_EXPIRY_MS - Date.now()))
        }
        tick()
        const id = setInterval(tick, 250)
        return () => clearInterval(id)
    }, [sentAtMs])

    const progress = Math.max(0, Math.min(1, remainingMs / OTP_EXPIRY_MS))

    return {
        remainingMs,
        label: formatCountdown(remainingMs),
        expired: remainingMs <= 0,
        progress,
    }
}