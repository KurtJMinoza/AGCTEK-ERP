import { useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ProductImage } from '@/src/components/ProductImage'
import { QuantityStepper } from '@/src/components/QuantityStepper'
import { ScreenState } from '@/src/components/ScreenState'
import { MAX_LINE_QUANTITY, useCart } from '@/src/context/CartContext'
import { colors } from '@/src/theme'
import { formatMoney } from '@/src/utils/format'

export default function CartScreen() {
    const router = useRouter()
    const { items, hydrated, itemCount, estimatedSubtotal, updateQuantity, removeItem } = useCart()

    if (!hydrated) return <ScreenState kind="loading" />

    if (items.length === 0) {
        return (
            <View style={styles.emptyWrap}>
                <ScreenState kind="empty" title="Your cart is empty" message="Browse the shop to add products." />
                <View style={styles.emptyAction}>
                    <PrimaryButton title="Browse products" onPress={() => router.push('/')} />
                </View>
            </View>
        )
    }

    const currency = items[0]?.currency ?? 'PHP'

    return (
        <View style={styles.container}>
            <FlatList
                data={items}
                keyExtractor={(item) => item.productId}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                    <View style={styles.row}>
                        <Pressable
                            style={styles.thumb}
                            onPress={() =>
                                router.push({ pathname: '/product/[id]', params: { id: item.productId } })
                            }
                        >
                            <ProductImage product={item} />
                        </Pressable>
                        <View style={styles.info}>
                            <Text style={styles.name} numberOfLines={2}>
                                {item.name}
                            </Text>
                            <Text style={styles.price}>
                                {formatMoney(item.unitPrice, item.currency)}
                                <Text style={styles.uom}> / {item.uom}</Text>
                            </Text>
                            <View style={styles.actions}>
                                <QuantityStepper
                                    value={item.quantity}
                                    max={MAX_LINE_QUANTITY}
                                    onChange={(q) => updateQuantity(item.productId, q)}
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => removeItem(item.productId)}
                                    hitSlop={8}
                                >
                                    <Text style={styles.remove}>Remove</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                )}
            />
            <View style={styles.footer}>
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                        Estimated subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                    </Text>
                    <Text style={styles.totalValue}>{formatMoney(estimatedSubtotal, currency)}</Text>
                </View>
                <Text style={styles.note}>Final total is confirmed when you place the order.</Text>
                <PrimaryButton title="Checkout" onPress={() => router.push('/checkout')} />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    emptyWrap: { flex: 1, backgroundColor: colors.background },
    emptyAction: { padding: 16 },
    list: { padding: 12, gap: 12 },
    row: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 10,
    },
    thumb: { width: 84 },
    info: { flex: 1, gap: 4 },
    name: { fontSize: 15, fontWeight: '600', color: colors.text },
    price: { fontSize: 14, fontWeight: '700', color: colors.brand },
    uom: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
    actions: {
        marginTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    remove: { fontSize: 13, fontWeight: '600', color: colors.danger },
    footer: {
        padding: 16,
        gap: 8,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontSize: 14, color: colors.textMuted },
    totalValue: { fontSize: 18, fontWeight: '800', color: colors.text },
    note: { fontSize: 12, color: colors.textMuted },
})
