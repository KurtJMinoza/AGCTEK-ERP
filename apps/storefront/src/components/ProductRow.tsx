import Ionicons from '@expo/vector-icons/Ionicons'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import type { Product } from '../types'
import { ProductCard } from './ProductCard'

type Props = {
    title: string
    subtitle?: string
    products: Product[]
    /** "View all" opens the full products page. */
    onViewAll?: () => void
}

const CARD_WIDTH = 168

/** Horizontal product shelf with a "View all" link (home and product page rows). */
export function ProductRow({ title, subtitle, products, onViewAll }: Props) {
    if (products.length === 0) return null
    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <View style={styles.titles}>
                    <Text style={styles.title}>{title}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                </View>
                {onViewAll ? (
                    <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={`View all ${title}`}
                        hitSlop={8}
                        onPress={onViewAll}
                        style={styles.viewAll}
                    >
                        <Text style={styles.viewAllText}>View all</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.brandText} />
                    </Pressable>
                ) : null}
            </View>
            <FlatList
                horizontal
                data={products}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => <ProductCard product={item} style={styles.card} />}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    section: { gap: 10 },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        gap: 12,
    },
    titles: { flex: 1 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    viewAllText: { fontSize: 13, fontWeight: '600', color: colors.brandText },
    list: { paddingHorizontal: 16, gap: 12 },
    card: { width: CARD_WIDTH },
})
