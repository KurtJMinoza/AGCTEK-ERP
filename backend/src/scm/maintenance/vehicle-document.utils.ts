import {
    VehicleDocumentKind,
    VehicleDocumentStatus,
} from '@prisma/client'

export function defaultBlocksVehicle(kind: VehicleDocumentKind): boolean {
    return (
        kind === VehicleDocumentKind.OR ||
        kind === VehicleDocumentKind.CR ||
        kind === VehicleDocumentKind.INSURANCE_CTPL
    )
}

export function deriveDocumentStatus(
    expiresAt: Date,
    remindDaysBefore: number,
    cancelled = false,
    now = new Date(),
): VehicleDocumentStatus {
    if (cancelled) return VehicleDocumentStatus.CANCELLED
    if (now.getTime() > expiresAt.getTime()) {
        return VehicleDocumentStatus.EXPIRED
    }
    const remindMs = Math.max(0, remindDaysBefore) * 24 * 60 * 60 * 1000
    if (expiresAt.getTime() - now.getTime() <= remindMs) {
        return VehicleDocumentStatus.EXPIRING_SOON
    }
    return VehicleDocumentStatus.VALID
}
