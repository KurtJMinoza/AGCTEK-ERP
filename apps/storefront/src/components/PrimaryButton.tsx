import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps } from 'react'
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native'
import { colors, radius } from '../theme'

export type IconName = ComponentProps<typeof Ionicons>['name']

type Props = Omit<PressableProps, 'style'> & {
    title: string
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    icon?: IconName
    loading?: boolean
    style?: StyleProp<ViewStyle>
}

const PALETTES = {
    primary: { bg: colors.brand, fg: '#ffffff', border: colors.brand },
    secondary: { bg: colors.surface, fg: colors.textSecondary, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.brandText, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#ffffff', border: colors.danger },
}

/** Marketplace button (emerald primary, like the web `PRIMARY_BUTTON`). */
export function PrimaryButton({
    title,
    variant = 'primary',
    size = 'md',
    icon,
    loading,
    disabled,
    style,
    ...rest
}: Props) {
    const palette = PALETTES[variant]
    const inactive = disabled || loading

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !!inactive, busy: !!loading }}
            disabled={inactive}
            style={({ pressed }) => [
                styles.base,
                size === 'sm' ? styles.sm : styles.md,
                { backgroundColor: palette.bg, borderColor: palette.border },
                inactive && styles.disabled,
                pressed && (variant === 'primary' ? styles.pressedPrimary : styles.pressed),
                style,
            ]}
            {...rest}
        >
            {loading ? (
                <ActivityIndicator color={palette.fg} />
            ) : (
                <>
                    {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} /> : null}
                    <Text
                        numberOfLines={1}
                        style={[styles.label, size === 'sm' && styles.labelSm, { color: palette.fg }]}
                    >
                        {title}
                    </Text>
                </>
            )}
        </Pressable>
    )
}

const styles = StyleSheet.create({
    base: {
        flexDirection: 'row',
        gap: 8,
        borderRadius: radius.sm,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    md: { minHeight: 46 },
    sm: { minHeight: 36, paddingHorizontal: 12 },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.75 },
    pressedPrimary: { backgroundColor: colors.brandDark, borderColor: colors.brandDark },
    label: { fontSize: 15, fontWeight: '600' },
    labelSm: { fontSize: 13 },
})
