import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    type PressableProps,
} from 'react-native'
import { colors } from '../theme'

type Props = PressableProps & {
    title: string
    variant?: 'primary' | 'secondary' | 'ghost'
    loading?: boolean
}

export function PrimaryButton({
    title,
    variant = 'primary',
    loading,
    disabled,
    style,
    ...rest
}: Props) {
    const palette =
        variant === 'secondary'
            ? styles.secondary
            : variant === 'ghost'
              ? styles.ghost
              : styles.primary

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled || loading}
            style={({ pressed }) => [
                styles.base,
                palette,
                (disabled || loading) && styles.disabled,
                pressed && styles.pressed,
                typeof style === 'function' ? undefined : style,
            ]}
            {...rest}
        >
            {loading ? (
                <ActivityIndicator color="#fff" />
            ) : (
                <Text
                    style={[
                        styles.label,
                        variant === 'ghost' && styles.ghostLabel,
                        variant === 'secondary' && styles.secondaryLabel,
                    ]}
                >
                    {title}
                </Text>
            )}
        </Pressable>
    )
}

const styles = StyleSheet.create({
    base: {
        minHeight: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    primary: { backgroundColor: colors.brand },
    secondary: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    ghost: { backgroundColor: 'transparent' },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
    label: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondaryLabel: { color: colors.text },
    ghostLabel: { color: colors.brand },
})
