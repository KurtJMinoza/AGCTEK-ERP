/** Shared real-time form helpers for Materials Management. */

export type FieldErrors = Record<string, string | undefined>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/i

export function required(value: unknown, label = 'This field'): string | undefined {
    if (value == null) return `${label} is required`
    if (typeof value === 'string' && !value.trim()) return `${label} is required`
    if (typeof value === 'number' && Number.isNaN(value)) return `${label} is required`
    return undefined
}

export function minLength(value: string | undefined, min: number, label = 'This field'): string | undefined {
    if (!value?.trim()) return undefined
    if (value.trim().length < min) return `${label} must be at least ${min} characters`
    return undefined
}

export function maxLength(value: string | undefined, max: number, label = 'This field'): string | undefined {
    if (!value) return undefined
    if (value.length > max) return `${label} must be at most ${max} characters`
    return undefined
}

export function email(value: string | undefined): string | undefined {
    if (!value?.trim()) return undefined
    if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address'
    return undefined
}

export function url(value: string | undefined): string | undefined {
    if (!value?.trim()) return undefined
    if (!URL_RE.test(value.trim())) return 'Enter a valid URL'
    return undefined
}

export function nonNegativeNumber(value: string | number | undefined, label = 'Value'): string | undefined {
    if (value === '' || value == null) return undefined
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isNaN(n)) return `${label} must be a number`
    if (n < 0) return `${label} cannot be negative`
    return undefined
}

export function positiveNumber(value: string | number | undefined, label = 'Value'): string | undefined {
    if (value === '' || value == null) return undefined
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isNaN(n)) return `${label} must be a number`
    if (n <= 0) return `${label} must be greater than 0`
    return undefined
}

/** Drop empty strings so optional FK / email fields don't fail APIs. */
export function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
        if (value === '' || value === undefined || value === null) continue
        out[key] = value
    }
    return out as Partial<T>
}

export function firstError(...msgs: Array<string | undefined>): string | undefined {
    return msgs.find(Boolean)
}

export function hasErrors(errors: FieldErrors): boolean {
    return Object.values(errors).some(Boolean)
}

/** Show error only after the field was touched (or force=true on submit / Next). */
export function visibleError(
    errors: FieldErrors,
    touched: Record<string, boolean>,
    key: string,
    force = false,
): string | undefined {
    if (!force && !touched[key]) return undefined
    return errors[key]
}
