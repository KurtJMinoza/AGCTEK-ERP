import { BadRequestException } from '@nestjs/common'
import { defaultServiceMinutes, type DepartureMode } from './route-schedule'

/** Request parsing shared by the delivery (load plan) and ocular route previews. */
export function parseServiceMinutes(value: unknown): number {
    if (value == null || value === '') return defaultServiceMinutes()
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || n > 480) {
        throw new BadRequestException('serviceTimeMin must be between 0 and 480')
    }
    return n
}

export function parseDepartureMode(value: unknown): DepartureMode {
    if (value == null || value === '') return 'ON_TIME'
    if (value === 'ON_TIME' || value === 'EARLY') return value
    throw new BadRequestException('departureMode must be ON_TIME or EARLY')
}
