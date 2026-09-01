import type { Mode } from '@/@types/theme'
import type { Variables } from '@/configs/preset-theme-schema.config'

type ThemeVariables = Record<Variables, string>

type ThemeSchemaConfig = Record<string, Record<Mode, ThemeVariables>>

interface MappedTheme {
    [key: string]: string
}

const applyTheme = (
    theme: string,
    mode: 'light' | 'dark',
    presetThemeSchemaConfig: ThemeSchemaConfig,
): void => {
    const mapTheme = (variables: ThemeVariables): MappedTheme => {
        return {
            '--primary': variables.primary || '',
            '--primary-deep': variables.primaryDeep || '',
            '--primary-mild': variables.primaryMild || '',
            '--primary-subtle': variables.primarySubtle || '',
            '--neutral': variables.neutral || '',
        }
    }
    if (presetThemeSchemaConfig[theme][mode]) {
        const themeObject = mapTheme(presetThemeSchemaConfig[theme][mode])
        if (!themeObject) return

        const root = document.documentElement

        Object.keys(themeObject).forEach((property) => {
            if (property === 'name') {
                return
            }

            root.style.setProperty(property, themeObject[property])
        })
    }
}

export default applyTheme
