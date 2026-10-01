import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

type Props = {
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
}

export function QuantityStepper({ value, onChange, min = 1, max = 999 }: Props) {
    return (
        <View style={styles.container}>
            <StepButton
                label="−"
                accessibilityLabel="Decrease quantity"
                disabled={value <= min}
                onPress={() => onChange(value - 1)}
            />
            <Text style={styles.value} accessibilityLabel={`Quantity ${value}`}>
                {value}
            </Text>
            <StepButton
                label="+"
                accessibilityLabel="Increase quantity"
                disabled={value >= max}
                onPress={() => onChange(value + 1)}
            />
        </View>
    )
}

function StepButton({
    label,
    accessibilityLabel,
    disabled,
    onPress,
}: {
    label: string
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
            style={({ pressed }) => [
                styles.button,
                disabled && styles.disabled,
                pressed && styles.pressed,
            ]}
        >
            <Text style={styles.buttonLabel}>{label}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        backgroundColor: colors.surface,
        alignSelf: 'flex-start',
    },
    button: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    buttonLabel: { fontSize: 20, fontWeight: '600', color: colors.brand },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.6 },
    value: {
        minWidth: 36,
        textAlign: 'center',
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
})
