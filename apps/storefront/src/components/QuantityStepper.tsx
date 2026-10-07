import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

type Props = {
    value: number
    label: string
    onDecrease: () => void
    onIncrease: () => void
    /** Disables "+" (e.g. at the stock or line limit). */
    canIncrease?: boolean
    /** Disables "−" (e.g. product-page quantity at 1). */
    canDecrease?: boolean
}

/** Round − / + buttons, like the web marketplace stepper. */
export function QuantityStepper({
    value,
    label,
    onDecrease,
    onIncrease,
    canIncrease = true,
    canDecrease = true,
}: Props) {
    return (
        <View style={styles.row}>
            <StepButton
                icon="remove"
                accessibilityLabel={`Decrease ${label}`}
                disabled={!canDecrease}
                onPress={onDecrease}
            />
            <Text style={styles.value} accessibilityLiveRegion="polite">
                {value}
            </Text>
            <StepButton
                icon="add"
                accessibilityLabel={`Increase ${label}`}
                disabled={!canIncrease}
                onPress={onIncrease}
            />
        </View>
    )
}

function StepButton({
    icon,
    accessibilityLabel,
    disabled,
    onPress,
}: {
    icon: 'add' | 'remove'
    accessibilityLabel: string
    disabled: boolean
    onPress: () => void
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            onPress={onPress}
            hitSlop={6}
            style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
        >
            <Ionicons name={icon} size={16} color={colors.textSecondary} />
        </Pressable>
    )
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    button: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabled: { opacity: 0.35 },
    pressed: { backgroundColor: colors.tile },
    value: { minWidth: 26, textAlign: 'center', fontSize: 14, fontWeight: '600', color: colors.text },
})
