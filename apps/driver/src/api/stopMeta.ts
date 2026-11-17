import * as Location from 'expo-location'
import type { StopExecutionMeta } from '../types'

const FIX_TIMEOUT_MS = 4000
const REQUIRED_FIX_TIMEOUT_MS = 10000

/**
 * Audit metadata for arrive / deliver / fail.
 * Default is best effort: no permission prompt, short timeout, last known fix as fallback.
 * `requireFix` (customer deliveries — POD needs a geo-tagged timestamp) asks for
 * permission and waits longer; the API still decides whether evidence is complete.
 */
export async function captureStopMeta(
    options: { requireFix?: boolean } = {},
): Promise<StopExecutionMeta> {
    const meta: StopExecutionMeta = { clientOccurredAt: new Date().toISOString() }
    try {
        let perm = await Location.getForegroundPermissionsAsync()
        if (!perm.granted && options.requireFix && perm.canAskAgain) {
            perm = await Location.requestForegroundPermissionsAsync()
        }
        if (!perm.granted) return meta
        const timeoutMs = options.requireFix ? REQUIRED_FIX_TIMEOUT_MS : FIX_TIMEOUT_MS
        const fix =
            (await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
            ])) ?? (await Location.getLastKnownPositionAsync())
        if (!fix) return meta
        meta.latitude = fix.coords.latitude
        meta.longitude = fix.coords.longitude
        if (fix.coords.accuracy != null) meta.accuracy = fix.coords.accuracy
    } catch {
        /* the API reports missing location when it is required */
    }
    return meta
}
