/**
 * Flespi / Concox (VL502) message → flat GPS ingest fields.
 * Ident for JT808/Huabao on flespi is typically the first 14 digits of IMEI.
 */

export type NormalizedGpsIngest = {
    telematicsDeviceId?: string
    uniqueId?: string
    deviceId?: string
    vehicleId?: string
    tripId?: string | null
    latitude?: number
    longitude?: number
    speedKmh?: number
    speed?: number
    speedUnit?: 'kmh' | 'kn'
    heading?: number
    course?: number
    recordedAt?: string | Date
    fixTime?: string | Date
    deviceTime?: string | Date
    rawPayload?: Record<string, unknown> | null
    /** True when message has no fix — caller should skip without error */
    skipNoFix?: boolean
    source?: 'flespi' | 'traccar' | 'flat'
}

export function isFlespiMessage(body: Record<string, unknown>): boolean {
    if (typeof body.ident === 'string' && body.ident.trim()) return true
    if (body['position.latitude'] != null || body['position.longitude'] != null) {
        return true
    }
    // flespi HTTP stream wrapper
    if (Array.isArray(body.result) || Array.isArray(body.messages)) return false
    return false
}

/** Pull param from dotted key or nested object path. */
export function flespiParam(
    msg: Record<string, unknown>,
    ...keys: string[]
): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(msg, key)) {
            return msg[key]
        }
        const parts = key.split('.')
        let cur: unknown = msg
        let ok = true
        for (const part of parts) {
            if (cur == null || typeof cur !== 'object') {
                ok = false
                break
            }
            cur = (cur as Record<string, unknown>)[part]
        }
        if (ok && cur !== undefined) return cur
    }
    return undefined
}

function asFiniteNumber(value: unknown): number | null {
    if (value == null || value === '') return null
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : null
}

function asIdent(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(Math.trunc(value))
    }
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
}

/**
 * Normalize one flespi gateway message.
 * Speed from flespi position.speed is km/h.
 */
export function mapFlespiMessageToIngest(
    msg: Record<string, unknown>,
): NormalizedGpsIngest {
    const ident =
        asIdent(flespiParam(msg, 'ident', 'device.ident')) ??
        asIdent(msg.telematicsDeviceId)

    const latitude = asFiniteNumber(
        flespiParam(
            msg,
            'position.latitude',
            'latitude',
            'lat',
            'position.lat',
        ),
    )
    const longitude = asFiniteNumber(
        flespiParam(
            msg,
            'position.longitude',
            'longitude',
            'lng',
            'lon',
            'position.lng',
            'position.lon',
        ),
    )

    if (latitude == null || longitude == null) {
        return {
            telematicsDeviceId: ident ?? undefined,
            uniqueId: ident ?? undefined,
            skipNoFix: true,
            rawPayload: msg,
            source: 'flespi',
        }
    }

    const speed = asFiniteNumber(
        flespiParam(msg, 'position.speed', 'speed', 'speedKmh'),
    )
    const heading = asFiniteNumber(
        flespiParam(
            msg,
            'position.direction',
            'position.heading',
            'direction',
            'heading',
            'course',
        ),
    )

    const ts = asFiniteNumber(flespiParam(msg, 'timestamp', 'server.timestamp'))
    // flespi timestamps are unix seconds (sometimes ms)
    let recordedAt: Date | undefined
    if (ts != null) {
        recordedAt = new Date(ts > 1e12 ? ts : ts * 1000)
    }

    return {
        telematicsDeviceId: ident ?? undefined,
        uniqueId: ident ?? undefined,
        latitude,
        longitude,
        speedKmh: speed ?? undefined,
        speed: speed ?? undefined,
        speedUnit: 'kmh',
        heading: heading ?? undefined,
        course: heading ?? undefined,
        recordedAt,
        rawPayload: { source: 'flespi', ...msg },
        source: 'flespi',
        skipNoFix: false,
    }
}

/**
 * True when flespi/Concox payload carries a discrete telematics event worth
 * storing even without a GPS fix (ACC, power cut, harsh brake, …).
 */
export function flespiMessageHasTelematicsEvent(
    msg: Record<string, unknown>,
): boolean {
    const harsh = flespiParam(
        msg,
        'harsh.braking.event',
        'harsh.braking.alarm',
    )
    if (harsh === true || harsh === 1 || harsh === 'true') return true

    const powerCut = flespiParam(
        msg,
        'power.cut.alarm',
        'external.powersource.alarm',
        'unplug.alarm',
    )
    if (powerCut === true || powerCut === 1 || powerCut === 'true') return true

    const ignition = flespiParam(
        msg,
        'engine.ignition.status',
        'can.engine.ignition.status',
    )
    // Plain ignition status alone is too noisy for no-fix persistence;
    // ACC ON/OFF alarm codes below cover engine transitions.
    void ignition

    const alarmRaw = flespiParam(msg, 'alarm.code', 'alarmCode', 'alarm')
    const alarm =
        typeof alarmRaw === 'number'
            ? alarmRaw
            : typeof alarmRaw === 'string'
              ? Number(alarmRaw)
              : NaN
    // Any discrete alarm.code is worth keeping (SOS, overspeed, ACC, …).
    if (Number.isFinite(alarm)) return true

    return false
}
export function expandIngestBodies(
    body: unknown,
): Record<string, unknown>[] {
    if (Array.isArray(body)) {
        return body.filter(
            (item): item is Record<string, unknown> =>
                item != null && typeof item === 'object' && !Array.isArray(item),
        )
    }
    if (body == null || typeof body !== 'object') return []

    const obj = body as Record<string, unknown>
    for (const key of ['result', 'messages', 'data'] as const) {
        const nested = obj[key]
        if (Array.isArray(nested)) {
            return nested.filter(
                (item): item is Record<string, unknown> =>
                    item != null &&
                    typeof item === 'object' &&
                    !Array.isArray(item),
            )
        }
    }
    return [obj]
}

/**
 * Candidate telematicsDeviceId values for DB lookup.
 * flespi JT808 ident = first 14 digits of IMEI (drop check digit).
 */
export function identLookupKeys(ident: string): string[] {
    const keys = new Set<string>()
    const trimmed = ident.trim()
    if (!trimmed) return []
    keys.add(trimmed)

    const digits = trimmed.replace(/\D/g, '')
    if (digits) {
        keys.add(digits)
        if (digits.length === 15) {
            keys.add(digits.slice(0, 14))
        }
        if (digits.length === 14) {
            // keep 14; vehicle may store full 15 — handled by startsWith query
            keys.add(digits)
        }
    }
    return [...keys]
}
