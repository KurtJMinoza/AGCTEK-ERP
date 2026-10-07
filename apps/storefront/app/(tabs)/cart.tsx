import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { productKey, storeName } from '@/src/catalog'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ProductImage } from '@/src/components/ProductImage'
import { QuantityStepper } from '@/src/components/QuantityStepper'
import { ScreenState } from '@/src/components/ScreenState'
import { useAuth } from '@/src/context/AuthContext'
import { MAX_LINE_QUANTITY, useCart } from '@/src/context/CartContext'
import { useCatalog } from '@/src/context/CatalogContext'
import { useShop } from '@/src/context/ShopContext'
import { useToast } from '@/src/context/ToastContext'
import { colors, divisionTheme, radius, shadow } from '@/src/theme'
import { formatMoney } from '@/src/utils/format'

/** Cart grouped by store; each store delivers separately and becomes its own order (web cart drawer). */
export default function CartScreen() {
    const router = useRouter()
    const { customer } = useAuth()
    const { items, hydrated, pricing, clear } = useCart()
    const catalog = useCatalog()
    const { increase, decrease, requestRemove } = useShop()
    const { notify } = useToast()
    const [confirmClear, setConfirmClear] = useState(false)

    if (!hydrated) return <ScreenState kind="loading" />

    if (items.length === 0) {
        return (
            <ScreenState
                kind="empty"
                icon="cart-outline"
                title="Your cart is empty"
                message="Browse the official stores and add something you like."
                action={{ title: 'Start shopping', icon: 'bag-handle-outline', onPress: () => router.navigate('/') }}
            />
        )
    }

    if (!pricing) {
        return catalog.error ? (
            <ScreenState kind="error" message={catalog.error} onRetry={catalog.refresh} />
        ) : (
            <ScreenState kind="loading" message="Updating prices…" />
        )
    }

    const productByKey = new Map(items.map((i) => [productKey(i.product), i.product]))
    const storeCount = pricing.stores.length

    const startCheckout = () => {
        const lpg = items.filter((i) => i.product.divisionId === 'DIV_LPG')
        if (lpg.length > 0 && lpg.every((i) => i.product.isAddon)) {
            notify(
                'danger',
                'Add an LPG refill or set',
                'LPG add-ons cannot be ordered alone. Add at least one LPG refill or set.',
            )
            return
        }
        if (customer) router.push('/checkout')
        else router.push({ pathname: '/sign-in', params: { next: 'checkout' } })
    }

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.content}>
                {storeCount > 1 ? (
                    <View style={styles.notice}>
                        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                        <Text style={styles.noticeText}>
                            Items from {storeCount} stores ship separately, so you will get one order per store.
                        </Text>
                    </View>
                ) : null}

                {pricing.stores.map((store) => (
                    <View key={store.divisionId} style={styles.store}>
                        <View style={styles.storeHead}>
                            <View style={styles.storeTitleRow}>
                                <Ionicons name="storefront-outline" size={16} color={divisionTheme(store.divisionId).text} />
                                <Text style={styles.storeTitle}>{storeName(store.divisionId)} Items</Text>
                            </View>
                            <Text style={styles.storeDelivery}>Delivery {formatMoney(store.shipping)}</Text>
                        </View>
                        {store.lines.map((line) => {
                            const key = productKey({ divisionId: store.divisionId, sku: line.sku })
                            const product = productByKey.get(key)
                            if (!product) return null
                            return (
                                <View key={key} style={styles.line}>
                                    <Pressable
                                        accessibilityRole="link"
                                        accessibilityLabel={`View ${line.name}`}
                                        onPress={() =>
                                            router.push({ pathname: '/product/[id]', params: { id: product.id } })
                                        }
                                        style={styles.thumb}
                                    >
                                        <ProductImage product={product} />
                                    </Pressable>
                                    <View style={styles.lineInfo}>
                                        <Text style={styles.lineName} numberOfLines={2}>
                                            {line.name}
                                        </Text>
                                        <Text style={styles.lineEach}>{formatMoney(line.unitPrice)} each</Text>
                                        <View style={styles.lineActions}>
                                            <QuantityStepper
                                                value={line.quantity}
                                                label={line.name}
                                                canIncrease={line.quantity < MAX_LINE_QUANTITY}
                                                onDecrease={() => decrease(product)}
                                                onIncrease={() => increase(product)}
                                            />
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel={`Remove ${line.name}`}
                                                hitSlop={8}
                                                onPress={() => requestRemove(product)}
                                                style={styles.trash}
                                            >
                                                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                                            </Pressable>
                                        </View>
                                    </View>
                                    <Text style={styles.lineTotal}>{formatMoney(line.lineTotal)}</Text>
                                </View>
                            )
                        })}
                    </View>
                ))}

                <Pressable accessibilityRole="button" onPress={() => setConfirmClear(true)} style={styles.clear}>
                    <Text style={styles.clearText}>Clear cart</Text>
                </Pressable>
            </ScrollView>

            <View style={styles.footer}>
                <Row label="Subtotal" value={formatMoney(pricing.subtotal)} />
                {pricing.discountAmount > 0 ? (
                    <Row
                        label={`Discount (${pricing.promoCode})`}
                        value={`−${formatMoney(pricing.discountAmount)}`}
                        accent
                    />
                ) : null}
                <Row
                    label={`Delivery (${storeCount} store${storeCount === 1 ? '' : 's'})`}
                    value={formatMoney(pricing.shipping)}
                />
                <View style={styles.totalRow}>
                    <Text style={styles.total}>Total</Text>
                    <Text style={styles.total}>{formatMoney(pricing.grandTotal)}</Text>
                </View>
                <PrimaryButton
                    title={customer ? 'Checkout' : 'Sign in to checkout'}
                    icon={customer ? 'lock-closed-outline' : 'log-in-outline'}
                    onPress={startCheckout}
                />
            </View>

            <ConfirmDialog
                visible={confirmClear}
                tone="danger"
                title="Clear cart?"
                confirmText="Clear cart"
                onConfirm={() => {
                    clear()
                    setConfirmClear(false)
                }}
                onCancel={() => setConfirmClear(false)}
            >
                <Text style={styles.dialogText}>All items will be removed from your cart.</Text>
            </ConfirmDialog>
        </View>
    )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={[styles.rowValue, accent && styles.accent]}>{value}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 14 },
    notice: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 10,
    },
    noticeText: { flex: 1, fontSize: 12, color: colors.textMuted },
    store: {
        ...shadow,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        gap: 14,
    },
    storeHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    storeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    storeTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    storeDelivery: { fontSize: 12, color: colors.textMuted },
    line: { flexDirection: 'row', gap: 12 },
    thumb: {
        width: 60,
        height: 60,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        padding: 3,
        backgroundColor: colors.tile,
    },
    lineInfo: { flex: 1, minWidth: 0, gap: 2 },
    lineName: { fontSize: 14, fontWeight: '500', color: colors.text, lineHeight: 19 },
    lineEach: { fontSize: 12, color: colors.textMuted },
    lineActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    trash: { padding: 4 },
    lineTotal: { fontSize: 14, fontWeight: '700', color: colors.text },
    clear: { alignSelf: 'center', padding: 8 },
    clearText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    footer: {
        gap: 6,
        padding: 16,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: { fontSize: 14, color: colors.textMuted },
    rowValue: { fontSize: 14, color: colors.text },
    accent: { color: colors.brandText, fontWeight: '600' },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 8,
        marginTop: 2,
        marginBottom: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    total: { fontSize: 17, fontWeight: '800', color: colors.text },
    dialogText: { fontSize: 14, color: colors.textSecondary },
})
