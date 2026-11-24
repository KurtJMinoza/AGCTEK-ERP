/**
 * USB barcode scanners act as keyboards ("keyboard wedge"): they type the code
 * in a burst a few milliseconds per key and finish with Enter (some send Tab).
 * People rarely type faster than ~80 ms per key, so key timing tells them apart.
 */
export const WEDGE_MAX_KEY_GAP_MS = 45
export const WEDGE_MIN_LENGTH = 4

export type WedgeDetector = {
    /** Feed one printable character; returns true when it starts a new burst. */
    push: (char: string, now: number) => boolean
    /** On Enter/Tab: the scanned code when the burst looks like a scanner, else null. */
    commit: (now: number) => string | null
    reset: () => void
}

export function createWedgeDetector(
    maxGapMs = WEDGE_MAX_KEY_GAP_MS,
    minLength = WEDGE_MIN_LENGTH,
): WedgeDetector {
    let buffer = ''
    let last = -Infinity
    const reset = () => {
        buffer = ''
        last = -Infinity
    }
    return {
        push(char, now) {
            const startsBurst = now - last > maxGapMs
            if (startsBurst) buffer = ''
            buffer += char
            last = now
            return startsBurst
        },
        commit(now) {
            const code = buffer.trim()
            const isScan = code.length >= minLength && now - last <= maxGapMs * 2
            reset()
            return isScan ? code : null
        },
        reset,
    }
}
