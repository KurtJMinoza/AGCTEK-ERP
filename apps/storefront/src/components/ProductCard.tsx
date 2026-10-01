import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import type { Product } from '../types'
import { formatMoney } from '../utils/format'
import { ProductImage } from './ProductImage'

type Props = {
    product: Product
    onPress: () => void
}

export function ProductCard({ product, onPress }: Props) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
            <ProductImage product={product} />
            <View style={styles.body}>
                <Text style={styles.name} numberOfLines={2}>
                    {product.name}
                </Text>
                <Text style={styles.price}>
                    {formatMoney(product.unitPrice, product.currency)}
                    <Text style={styles.uom}> / {product.uom}</Text>
                </Text>
                {!product.available ? (
                    <Text style={styles.unavailable}>Unavailable</Text>
                ) : null}
            </View>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 8,
    },
    pressed: { opacity: 0.85 },
    body: { paddingTop: 8, paddingHorizontal: 2, gap: 4 },
    name: { fontSize: 14, fontWeight: '600', color: colors.text, minHeight: 36 },
    price: { fontSize: 15, fontWeight: '700', color: colors.brand },
    uom: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
    unavailable: { fontSize: 12, fontWeight: '600', color: colors.danger },
})
