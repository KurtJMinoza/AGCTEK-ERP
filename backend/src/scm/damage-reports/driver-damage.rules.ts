import { BadRequestException } from '@nestjs/common'
import { StopStatus, TripStatus } from '@prisma/client'

export const DAMAGE_REPORT_SOURCE = {
    STAFF: 'STAFF',
    DRIVER: 'DRIVER',
} as const
export type DamageReportSource =
    (typeof DAMAGE_REPORT_SOURCE)[keyof typeof DAMAGE_REPORT_SOURCE]

/** Delivering the last stop completes the trip immediately, so the driver keeps a short window. */
export const DEFAULT_DRIVER_REPORT_GRACE_MINUTES = 60
export const MAX_DRIVER_PHOTOS = 3
/** ~2 MB per data URL; the camera already compresses (POD photos use the same path). */
const MAX_PHOTO_CHARS = 2_800_000

export function driverReportGraceMinutes(
    env: NodeJS.ProcessEnv = process.env,
): number {
    const n = Number(env.DRIVER_DAMAGE_REPORT_GRACE_MINUTES)
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DRIVER_REPORT_GRACE_MINUTES
}

/**
 * Why the driver may not report damage on this stop right now, or null when allowed.
 * Damage is evidence on a delivery that happened: the stop must be COMPLETED (a failed stop
 * already put its shipments on exception hold), and the trip must still be running — or have
 * just finished. After that, damage is filed by staff from the shipment.
 */
export function driverReportBlocker(
    trip: { status: TripStatus; completedAt: Date | null },
    stop: { status: StopStatus },
    now: Date,
    graceMinutes: number,
): string | null {
    if (stop.status !== StopStatus.COMPLETED) {
        return 'Damage can only be reported on a stop you delivered'
    }
    if (trip.status === TripStatus.IN_TRANSIT) return null
    if (
        trip.status === TripStatus.COMPLETED &&
        trip.completedAt &&
        now.getTime() - trip.completedAt.getTime() <= graceMinutes * 60_000
    ) {
        return null
    }
    return 'This trip has ended — ask dispatch to file the damage report'
}

/** Driver evidence photos: camera data URLs (or hosted URLs), at most three. */
export function parseDriverPhotos(value: unknown): string[] | null {
    if (value == null) return null
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        throw new BadRequestException('photoUrls must be an array of image URLs')
    }
    const photos = (value as string[]).map((p) => p.trim()).filter(Boolean)
    if (photos.length > MAX_DRIVER_PHOTOS) {
        throw new BadRequestException(`Attach at most ${MAX_DRIVER_PHOTOS} photos`)
    }
    for (const photo of photos) {
        if (!/^data:image\/[a-z+.-]+;base64,/i.test(photo) && !/^https?:\/\//i.test(photo)) {
            throw new BadRequestException('Each photo must be an image data URL or http(s) URL')
        }
        if (photo.length > MAX_PHOTO_CHARS) {
            throw new BadRequestException('A photo is too large; retake it at lower quality')
        }
    }
    return photos.length > 0 ? photos : null
}
