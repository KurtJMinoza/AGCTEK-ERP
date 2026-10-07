import * as Location from 'expo-location'
import type { StopExecutionMeta } from '../types'

const FIX_TIMEOUT_MS = 4000

/**
 * Best-effort audit metadata for arrive / deliver / fail.
 * Never blocks the action: no permission prompt, short timeout, falls back to last known fix.
 */
export async function captureStopMeta(): Promise<StopExecutionMeta> {
    const meta: StopExecutionMeta = { clientOccurredAt: new Date().toISOString() }
    try {
        const perm = await Location.getForegroundPermissionsAsync()
        if (!perm.granted) return meta
        const fix =
            (await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
            ])) ?? (await Location.getLastKnownPositionAsync())
        if (!fix) return meta
        meta.latitude = fix.coords.latitude
        meta.longitude = fix.coords.longitude
        if (fix.coords.accuracy != null) meta.accuracy = fix.coords.accuracy
    } catch {
        /* location is optional */
    }
    return meta
}
