import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { OFFICIAL_STORES } from '../../catalog'
import { colors, divisionTheme, radius, shadow } from '../../theme'
import type { DivisionId } from '../../types'

type Props = {
    counts: Map<string, number>
    activeDivisionId?: string | null
    onSelect: (divisionId: DivisionId) => void
}

/** Brand-store cards; selecting one shows that store's products. */
export function OfficialStores({ counts, activeDivisionId, onSelect }: Props) {
    return (
        <View style={styles.list}>
            {OFFICIAL_STORES.map((store) => {
                const theme = divisionTheme(store.divisionId)
                const active = activeDivisionId === store.divisionId
                const count = counts.get(store.divisionId) ?? 0
                return (
                    <Pressable
                        key={store.divisionId}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Visit ${store.name} official store, ${store.tagline}, ${count} products`}
                        onPress={() => onSelect(store.divisionId)}
                        style={({ pressed }) => [
                            styles.card,
                            active && { borderColor: theme.solid },
                            pressed && styles.pressed,
                        ]}
                    >
                        <View style={[styles.icon, { backgroundColor: active ? theme.solid : theme.soft }]}>
                            <Ionicons
                                name={store.icon}
                                size={20}
                                color={active ? theme.onSolid : theme.text}
                            />
                        </View>
                        <View style={styles.text}>
                            <View style={styles.nameRow}>
                                <Text style={styles.name}>{store.name}</Text>
                                <Ionicons name="checkmark-circle" size={15} color="#10b981" />
                            </View>
                            <Text style={styles.tagline}>{store.tagline}</Text>
                        </View>
                        <View style={styles.meta}>
                            <Text style={[styles.count, { color: theme.text }]}>
                                {count} item{count === 1 ? '' : 's'}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                        </View>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    list: { paddingHorizontal: 16, gap: 10 },
    card: {
        ...shadow,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    pressed: { borderColor: colors.brandBorder },
    icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { fontSize: 16, fontWeight: '700', color: colors.text },
    tagline: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
    meta: { alignItems: 'flex-end', gap: 2 },
    count: { fontSize: 12, fontWeight: '600' },
})
