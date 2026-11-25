/**
 * MM account determination cutover modes (Phase 04.07).
 * Legacy table remains for audit; behavior is controlled here.
 */
export const FICO_MM_RESOLUTION_MODES = [
    /** Central rules first; legacy mappings used only when no active rule matches. */
    'CENTRAL_WITH_LEGACY_FALLBACK',
    /** Compare central vs legacy on every post; journals use legacy result. */
    'SHADOW_LEGACY_AUTHORITY',
    /** Compare central vs legacy; journals use central when available. */
    'SHADOW_CENTRAL_AUTHORITY',
    /** Central rules only — no legacy fallback (authoritative engine). */
    'CENTRAL_ONLY',
    /** Central first; timed legacy fallback until `mmLegacyFallbackUntil`. */
    'CENTRAL_WITH_TIMED_FALLBACK',
] as const

export type FicoMmResolutionMode = (typeof FICO_MM_RESOLUTION_MODES)[number]

export const FICO_MM_RESOLUTION_MODE_LABELS: Record<FicoMmResolutionMode, string> = {
    CENTRAL_WITH_LEGACY_FALLBACK: 'Central rules with legacy fallback',
    SHADOW_LEGACY_AUTHORITY: 'Shadow compare (legacy posts)',
    SHADOW_CENTRAL_AUTHORITY: 'Shadow compare (central posts)',
    CENTRAL_ONLY: 'Central only (no legacy fallback)',
    CENTRAL_WITH_TIMED_FALLBACK: 'Central with time-limited legacy fallback',
}