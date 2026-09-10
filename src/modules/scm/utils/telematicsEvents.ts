/**
 * Extract VL512 / flespi-style driving & power events from GpsLog.rawPayload.
 * Keys follow flespi Concox mapping (harsh.braking.event, power.cut.alarm, …).
 */

export type TelematicsEventKind =
    | 'harsh_braking'
    | 'engine_on'
    | 'engine_off'
    | 'device_unplugged'
    | 'device_alarm'

export type TelematicsEvent = {
    id: string
    kind: TelematicsEventKind
    label: string
    recordedAt: string
    detail?: string
}

export type TelematicsLiveStatus = {
    engine: 'on' | 'off' | 'unknown'
    power: 'ok' | 'unplugged' | 'unknown'
    lastHarshBrakeAt: string | null
}

/** Common Concox / JM alarm.code values (protocol 0x13 / 0x16 family). */
const HARSH_BRAKE_ALARM = 0x30 // 48
const POWER_CUT_ALARM = 0x02
const ACC_ON_ALARM = 0xfe // 254
const ACC_OFF_ALARM = 0xff // 255

const KNOWN_ALARM_LABELS: Record<number, string> = {
    0x01: 'SOS',
    0x02: 'Power cut',
    0x03: 'Vibration',
    0x04: 'Enter geofence',
    0x05: 'Exit geofence',
    0x06: 'Overspeed',
    0x09: 'Movement',
    0x0a: 'Enter GPS blind zone',
    0x0b: 'Exit GPS blind zone',
    0x0c: 'Power on',
    0x0d: 'GPS antenna cut',
    0x0e: 'Low battery',
    0x0f: 'Bad GPS signal',
    0x11: 'Overtime parking',
    0x13: 'Device removed',
    0x14: 'Door',
    0x15: 'Low external battery',
    0x18: 'Pseudo base station',
    0x19: 'Collision',
    0x20: 'Idle overspeed',
    0x29: 'Harsh acceleration',
    0x2a: 'Sharp left turn',
    0x2b: 'Sharp right turn',
    0x2c: 'Crash',
    0x30: 'Harsh braking',
    0xfe: 'ACC ON',
    0xff: 'ACC OFF',
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

/** Flatten dotted keys + nested bags used by flespi / Traccar wrappers. */
export function payloadBags(
    rawPayload: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
    if (!rawPayload || typeof rawPayload !== 'object') return []
    const bags: Record<string, unknown>[] = [rawPayload]
    const attrs = asRecord(rawPayload.attributes)
    if (attrs) bags.push(attrs)
    return bags
}

function readBool(
    bags: Record<string, unknown>[],
    keys: string[],
): boolean | null {
    for (const bag of bags) {
        for (const key of keys) {
            if (!(key in bag)) continue
            const v = bag[key]
            if (typeof v === 'boolean') return v
            if (v === 1 || v === '1' || v === 'true') return true
            if (v === 0 || v === '0' || v === 'false') return false
        }
    }
    return null
}

function readAlarmCode(bags: Record<string, unknown>[]): number | null {
    for (const bag of bags) {
        const raw = bag['alarm.code'] ?? bag.alarmCode ?? bag.alarm
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw
        if (typeof raw === 'string' && raw.trim() !== '') {
            const n = Number(raw)
            if (Number.isFinite(n)) return n
        }
    }
    return null
}

function readAlarmDescription(
    bags: Record<string, unknown>[],
): string | null {
    for (const bag of bags) {
        const raw =
            bag['alarm.code.description'] ??
            bag.alarmCodeDescription ??
            bag['alarm.description']
        if (typeof raw === 'string' && raw.trim()) return raw.trim()
    }
    return null
}

function formatAlarmCode(code: number): string {
    return `0x${code.toString(16).toUpperCase()} (${code})`
}

/** Prefer flespi description → known label → raw alarm.code. */
export function formatAlarmDetail(
    bags: Record<string, unknown>[],
    alarm: number | null,
): string | undefined {
    const description = readAlarmDescription(bags)
    if (description) {
        return alarm != null
            ? `${description} · ${formatAlarmCode(alarm)}`
            : description
    }
    if (alarm == null) return undefined
    const known = KNOWN_ALARM_LABELS[alarm]
    if (known) return `${known} · ${formatAlarmCode(alarm)}`
    return `alarm.code ${formatAlarmCode(alarm)}`
}

export function knownAlarmLabel(code: number): string | null {
    return KNOWN_ALARM_LABELS[code] ?? null
}

export function extractLiveTelematicsStatus(
    rawPayload: Record<string, unknown> | null | undefined,
): TelematicsLiveStatus {
    const bags = payloadBags(rawPayload)
    const ignition = readBool(bags, [
        'engine.ignition.status',
        'can.engine.ignition.status',
        'ignition',
    ])
    const powerCut = readBool(bags, [
        'power.cut.alarm',
        'external.powersource.alarm',
        'unplug.alarm',
    ])
    const alarm = readAlarmCode(bags)

    let engine: TelematicsLiveStatus['engine'] = 'unknown'
    if (ignition === true || alarm === ACC_ON_ALARM) engine = 'on'
    else if (ignition === false || alarm === ACC_OFF_ALARM) engine = 'off'

    let power: TelematicsLiveStatus['power'] = 'unknown'
    if (powerCut === true || alarm === POWER_CUT_ALARM) power = 'unplugged'
    else if (bags.length > 0) power = 'ok'

    return {
        engine,
        power,
        lastHarshBrakeAt: null,
    }
}

export function extractTelematicsEventsFromLog(input: {
    id: string
    recordedAt: string
    rawPayload?: Record<string, unknown> | null
}): TelematicsEvent[] {
    const bags = payloadBags(input.rawPayload ?? null)
    if (bags.length === 0) return []

    const events: TelematicsEvent[] = []
    const alarm = readAlarmCode(bags)
    const alarmDetail = formatAlarmDetail(bags, alarm)
    let consumedAlarm = false

    const harsh =
        readBool(bags, [
            'harsh.braking.event',
            'harsh.braking.alarm',
            'braking.harsh.event',
        ]) === true || alarm === HARSH_BRAKE_ALARM

    if (harsh) {
        events.push({
            id: `${input.id}:harsh_braking`,
            kind: 'harsh_braking',
            label: 'Sudden braking',
            recordedAt: input.recordedAt,
            detail: alarmDetail,
        })
        if (alarm === HARSH_BRAKE_ALARM) consumedAlarm = true
    }

    const powerCut =
        readBool(bags, [
            'power.cut.alarm',
            'external.powersource.alarm',
            'unplug.alarm',
        ]) === true || alarm === POWER_CUT_ALARM

    if (powerCut) {
        events.push({
            id: `${input.id}:device_unplugged`,
            kind: 'device_unplugged',
            label: 'Device unplugged',
            recordedAt: input.recordedAt,
            detail: alarmDetail ?? 'Power cut / OBD disconnect',
        })
        if (alarm === POWER_CUT_ALARM) consumedAlarm = true
    }

    // Discrete ACC alarms (0xFE / 0xFF) — avoid flooding from every status ping.
    if (alarm === ACC_ON_ALARM) {
        events.push({
            id: `${input.id}:engine_on`,
            kind: 'engine_on',
            label: 'Engine on',
            recordedAt: input.recordedAt,
            detail: alarmDetail ?? 'ACC ON',
        })
        consumedAlarm = true
    } else if (alarm === ACC_OFF_ALARM) {
        events.push({
            id: `${input.id}:engine_off`,
            kind: 'engine_off',
            label: 'Engine off',
            recordedAt: input.recordedAt,
            detail: alarmDetail ?? 'ACC OFF',
        })
        consumedAlarm = true
    }

    // Other discrete alarm codes (SOS, overspeed, vibration, …) or unknown codes.
    if (alarm != null && !consumedAlarm) {
        const known = knownAlarmLabel(alarm)
        events.push({
            id: `${input.id}:device_alarm:${alarm}`,
            kind: 'device_alarm',
            label: known ?? 'Device alarm',
            recordedAt: input.recordedAt,
            detail: alarmDetail,
        })
    }

    return events
}

/** Build timeline + derive last harsh brake from newest→oldest logs. */
export function collectTelematicsEvents(
    logs: Array<{
        id: string
        recordedAt: string
        rawPayload?: Record<string, unknown> | null
    }>,
): { events: TelematicsEvent[]; status: TelematicsLiveStatus } {
    const ordered = [...logs].sort(
        (a, b) =>
            new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    )

    const status = extractLiveTelematicsStatus(ordered[0]?.rawPayload)
    const events: TelematicsEvent[] = []
    const seen = new Set<string>()

    for (const log of ordered) {
        for (const event of extractTelematicsEventsFromLog(log)) {
            if (seen.has(event.id)) continue
            seen.add(event.id)
            events.push(event)
            if (
                event.kind === 'harsh_braking' &&
                status.lastHarshBrakeAt == null
            ) {
                status.lastHarshBrakeAt = event.recordedAt
            }
        }
    }

    // Ignition transitions from consecutive status samples (no ACC alarm).
    for (let i = 0; i < ordered.length - 1; i++) {
        const newer = extractLiveTelematicsStatus(ordered[i].rawPayload)
        const older = extractLiveTelematicsStatus(ordered[i + 1].rawPayload)
        if (newer.engine === 'unknown' || older.engine === 'unknown') continue
        if (newer.engine === older.engine) continue
        const kind: TelematicsEventKind =
            newer.engine === 'on' ? 'engine_on' : 'engine_off'
        const id = `${ordered[i].id}:${kind}:transition`
        if (seen.has(id)) continue
        seen.add(id)
        events.push({
            id,
            kind,
            label: newer.engine === 'on' ? 'Engine on' : 'Engine off',
            recordedAt: ordered[i].recordedAt,
            detail: 'Ignition status change',
        })
    }

    events.sort(
        (a, b) =>
            new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    )

    return { events, status }
}

export function telematicsEventTone(
    kind: TelematicsEventKind,
): 'danger' | 'warning' | 'success' | 'info' {
    if (
        kind === 'harsh_braking' ||
        kind === 'device_unplugged' ||
        kind === 'device_alarm'
    ) {
        return 'danger'
    }
    if (kind === 'engine_off') return 'warning'
    return 'success'
}
