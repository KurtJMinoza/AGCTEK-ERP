import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CATEGORY_ICONS, type MarketplaceCategory } from '../../catalog'
import { colors, divisionTheme } from '../../theme'
import type { IconName } from '../PrimaryButton'

type Props = { categories: MarketplaceCategory[]; onSelect: (category: MarketplaceCategory) => void }

/** Round category shortcuts, four per row (web category grid). */
export function CategoryGrid({ categories, onSelect }: Props) {
    return (
        <View style={styles.grid}>
            {categories.map((category) => {
                const theme = divisionTheme(category.divisionId)
                const icon = (CATEGORY_ICONS[category.name] ?? 'cube-outline') as IconName
                return (
                    <Pressable
                        key={category.name}
                        accessibilityRole="button"
                        accessibilityLabel={`${category.name}, ${category.count} products`}
                        onPress={() => onSelect(category)}
                        style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                    >
                        <View style={[styles.circle, { backgroundColor: theme.soft }]}>
                            <Ionicons name={icon} size={26} color={theme.text} />
                        </View>
                        <Text style={styles.name} numberOfLines={2}>
                            {category.name}
                        </Text>
                        <Text style={styles.count}>
                            {category.count} item{category.count === 1 ? '' : 's'}
                        </Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, rowGap: 18 },
    cell: { width: '25%', alignItems: 'center', paddingHorizontal: 4, gap: 6 },
    pressed: { opacity: 0.7 },
    circle: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' },
    count: { fontSize: 11, color: colors.textFaint, marginTop: -4 },
})
