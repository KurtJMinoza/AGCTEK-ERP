export const GMAIL_ONLY_MESSAGE =
    'Please use a Gmail address ending in @gmail.com.'

/** Trim and lowercase; does not validate domain. */
export function normalizeShopEmail(raw: string): string {
    return raw.trim().toLowerCase()
}

export function isGmailAddress(normalized: string): boolean {
    if (!normalized || normalized.includes(' ')) return false
    const at = normalized.lastIndexOf('@')
    if (at <= 0) return false
    const local = normalized.slice(0, at)
    const domain = normalized.slice(at + 1)
    if (!local || !domain) return false
    return domain === 'gmail.com'
}

export function assertGmailAddress(raw: string): string {
    const normalized = normalizeShopEmail(raw)
    if (!isGmailAddress(normalized)) {
        throw new GmailOnlyError()
    }
    return normalized
}

export class GmailOnlyError extends Error {
    readonly statusCode = 400
    constructor(message = GMAIL_ONLY_MESSAGE) {
        super(message)
        this.name = 'GmailOnlyError'
    }
}
