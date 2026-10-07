import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text } from 'react-native'
import { colors, radius } from '../theme'
import type { IconName } from './PrimaryButton'

type Props = {
    label: string
    selected?: boolean
    icon?: IconName
    /** Shows a × (active filter chip). */
    removable?: boolean
    onPress: () => void
}

/** Filter / sort pill (emerald when selected). */
export function Chip({ label, selected, icon, removable, onPress }: Props) {
    const fg = selected ? colors.brandText : colors.textSecondary
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !!selected }}
            accessibilityLabel={removable ? `Remove filter ${label}` : label}
            onPress={onPress}
            style={({ pressed }) => [
                styles.chip,
                selected && styles.selected,
                pressed && styles.pressed,
            ]}
        >
            {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
            <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
                {label}
            </Text>
            {removable ? <Ionicons name="close" size={14} color={fg} /> : null}
        </Pressable>
    )
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    selected: { borderColor: colors.brandBorder, backgroundColor: colors.brandSoft },
    pressed: { opacity: 0.75 },
    label: { fontSize: 13, fontWeight: '500' },
})
