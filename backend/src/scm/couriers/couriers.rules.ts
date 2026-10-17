import { BadRequestException } from '@nestjs/common'

/** Carrier codes are short upper-case keys (JNT, LBC, NINJAVAN). */
const CARRIER_CODE = /^[A-Z0-9_-]{2,20}$/

export function normalizeCarrierCode(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException('code is required')
    }
    const code = value.trim().toUpperCase()
    if (!CARRIER_CODE.test(code)) {
        throw new BadRequestException(
            'code must be 2–20 characters: letters, digits, dash or underscore',
        )
    }
    return code
}

/** `{tracking}` is replaced with the URL-encoded tracking number. */
export function validateTrackingUrlTemplate(value: unknown): string | null {
    if (value == null || value === '') return null
    if (typeof value !== 'string') {
        throw new BadRequestException('trackingUrlTemplate must be a string')
    }
    const template = value.trim()
    if (!/^https?:\/\//i.test(template) || !template.includes('{tracking}')) {
        throw new BadRequestException(
            'trackingUrlTemplate must be an http(s) URL containing {tracking}',
        )
    }
    return template
}

export function trackingUrl(
    template: string | null | undefined,
    trackingNumber: string | null | undefined,
): string | null {
    if (!template || !trackingNumber) return null
    return template.replace('{tracking}', encodeURIComponent(trackingNumber))
}

/** AWB as typed by the dispatcher: trimmed, inner whitespace removed. */
export function normalizeTrackingNumber(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException('trackingNumber is required')
    }
    const tracking = value.replace(/\s+/g, '')
    if (tracking.length > 64) {
        throw new BadRequestException('trackingNumber is too long')
    }
    return tracking
}
