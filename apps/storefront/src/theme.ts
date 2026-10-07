import { Platform, type ViewStyle } from 'react-native'

/** Same palette as the web marketplace (Tailwind emerald / gray / rose). */
export const colors = {
    brand: '#059669',
    brandDark: '#047857',
    brandSoft: '#ecfdf5',
    brandBorder: '#d1fae5',
    brandText: '#047857',
    text: '#111827',
    textSecondary: '#374151',
    textMuted: '#6b7280',
    textFaint: '#9ca3af',
    border: '#f3f4f6',
    borderStrong: '#e5e7eb',
    background: '#f9fafb',
    surface: '#ffffff',
    tile: '#f9fafb',
    sale: '#e11d48',
    saleSoft: '#fff1f2',
    star: '#fbbf24',
    starEmpty: '#e5e7eb',
    warning: '#b45309',
    warningSoft: '#fffbeb',
    danger: '#dc2626',
    dangerSoft: '#fef2f2',
    success: '#059669',
}

export type DivisionTheme = {
    /** Store name colour on cards and tags. */
    text: string
    /** Soft tinted tile / tag background. */
    soft: string
    /** Filled icon tile. */
    solid: string
    onSolid: string
}

export const DIVISION_THEMES: Record<string, DivisionTheme> = {
    DIV_RETAIL: {
        text: '#047857',
        soft: '#ecfdf5',
        solid: '#059669',
        onSolid: '#fcd34d',
    },
    DIV_APPLIANCES: {
        text: '#dc2626',
        soft: '#fef2f2',
        solid: '#dc2626',
        onSolid: '#ffffff',
    },
    DIV_LPG: {
        text: '#ea580c',
        soft: '#fff7ed',
        solid: '#f97316',
        onSolid: '#ffffff',
    },
}

export const divisionTheme = (divisionId: string | null): DivisionTheme =>
    (divisionId && DIVISION_THEMES[divisionId]) || DIVISION_THEMES.DIV_RETAIL

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 }

/** Soft card shadow, like the web `shadow-sm`. */
export const shadow: ViewStyle = Platform.select<ViewStyle>({
    web: { boxShadow: '0 1px 2px rgba(0,0,0,0.05)' } as ViewStyle,
    default: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
})
