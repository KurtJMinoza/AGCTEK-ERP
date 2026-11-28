import { Platform, type ViewStyle } from 'react-native'

/**
 * Amalgated Shop palette (aligned with web /shop and UI Pro Max tokens).
 * Primary #0B4DA1 · nav #062B59 · page #F4F6F8
 */
export const colors = {
    brand: '#0B4DA1',
    brandDark: '#083B7A',
    nav: '#062B59',
    brandSoft: '#F1F7E7',
    brandBorder: '#E2E8F0',
    brandText: '#0B4DA1',
    text: '#172B45',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textFaint: '#94A3B8',
    border: '#E2E8F0',
    borderStrong: '#E2E8F0',
    background: '#F4F6F8',
    surface: '#FFFFFF',
    tile: '#F4F6F8',
    sale: '#C83E3E',
    saleSoft: '#FEF2F2',
    star: '#FBBF24',
    starEmpty: '#E2E8F0',
    warning: '#B45309',
    warningSoft: '#FFFBEB',
    danger: '#C83E3E',
    dangerSoft: '#FEF2F2',
    success: '#537D25',
    highlight: '#F1F7E7',
}

export type DivisionTheme = {
    text: string
    soft: string
    solid: string
    onSolid: string
}

export const DIVISION_THEMES: Record<string, DivisionTheme> = {
    DIV_RETAIL: {
        text: '#0B4DA1',
        soft: '#F1F7E7',
        solid: '#0B4DA1',
        onSolid: '#FFFFFF',
    },
    DIV_APPLIANCES: {
        text: '#C83E3E',
        soft: '#FEF2F2',
        solid: '#C83E3E',
        onSolid: '#FFFFFF',
    },
    DIV_LPG: {
        text: '#B45309',
        soft: '#FFFBEB',
        solid: '#EA580C',
        onSolid: '#FFFFFF',
    },
}

export const divisionTheme = (divisionId: string | null): DivisionTheme =>
    (divisionId && DIVISION_THEMES[divisionId]) || DIVISION_THEMES.DIV_RETAIL

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 }

export const shadow: ViewStyle = Platform.select<ViewStyle>({
    web: { boxShadow: '0 1px 3px rgba(23, 43, 69, 0.06)' } as ViewStyle,
    default: {
        shadowColor: '#172B45',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
    },
})