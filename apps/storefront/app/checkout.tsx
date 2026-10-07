import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
    BLANK_ACCOUNT,
    trimAccount,
    validateAccount,
    type AccountForm,
    type FieldErrors,
} from '@/src/accountFields'
import { commerceApi } from '@/src/api/client'
import { productKey } from '@/src/catalog'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { DeliveryFields } from '@/src/components/DeliveryFields'
import { Field } from '@/src/components/Field'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ScreenState } from '@/src/components/ScreenState'
import { SellerTag } from '@/src/components/SellerTag'
import { useAuth } from '@/src/context/AuthContext'
import { useCart } from '@/src/context/CartContext'
import { useCatalog } from '@/src/context/CatalogContext'
import { useToast } from '@/src/context/ToastContext'
import { calculateCartPricing } from '@/src/pricing'
import { colors, radius, shadow } from '@/src/theme'
import type { CheckoutResult, ShippingDetails } from '@/src/types'
import { formatMoney } from '@/src/utils/format'

const newCheckoutId = () =>
    `mobile-${
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    }`

/** Checkout (web checkout dialog): delivery details, promo, per-store totals, confirm, place order. */
export default function CheckoutScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { customer } = useAuth()
    const { items, pricing, promoCode, applyPromo, clear } = useCart()
    const catalog = useCatalog()
    const { notify } = useToast()

    const [form, setForm] = useState<AccountForm>(BLANK_ACCOUNT)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [promoInput, setPromoInput] = useState(promoCode ?? '')
    const [promoError, setPromoError] = useState<string | null>(null)
    const [pendingShipping, setPendingShipping] = useState<ShippingDetails | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [placed, setPlaced] = useState<CheckoutResult | null>(null)
    const checkoutId = useRef<string | null>(null)

    useEffect(() => {
        if (customer) setForm({ ...BLANK_ACCOUNT, ...customer, country: customer.country || 'PH', password: '' })
    }, [customer])

    if (placed) {
        return (
            <ScrollView contentContainerStyle={[styles.success, { paddingTop: insets.top + 40 }]}>
                <View style={styles.successIcon}>
                    <Ionicons name="checkmark" size={40} color="#fff" />
                </View>
                <Text style={styles.successTitle}>Order placed</Text>
                <Text style={styles.successText}>
                    Order <Text style={styles.placedNumber}>{placed.orderNumber}</Text> is pending delivery.
                </Text>
                <View style={styles.placedList}>
                    {placed.stores.map((store) => (
                        <View key={store.divisionId} style={styles.placedRow}>
                            <View style={styles.placedLeft}>
                                <SellerTag divisionId={store.divisionId} short />
                                <Text style={styles.successText}>
                                    {store.lines.length} {store.lines.length === 1 ? 'item' : 'items'}
                                </Text>
                            </View>
                            <Text style={styles.placedTotal}>{formatMoney(store.grandTotal)}</Text>
                        </View>
                    ))}
                </View>
                <Text style={styles.successText}>
                    Total due on delivery: <Text style={styles.strong}>{formatMoney(placed.grandTotal)}</Text>
                </Text>
                <View style={styles.successActions}>
                    <PrimaryButton title="View my orders" icon="receipt-outline" onPress={() => router.replace('/orders')} />
                    <PrimaryButton title="Continue shopping" variant="secondary" onPress={() => router.replace('/')} />
                </View>
            </ScrollView>
        )
    }

    if (!customer) {
        return (
            <ScreenState
                kind="empty"
                icon="person-circle-outline"
                title="Sign in to check out"
                message="Your cart is saved. Sign in or create an account to place your order."
                action={{
                    title: 'Sign in',
                    icon: 'log-in-outline',
                    onPress: () => router.replace({ pathname: '/sign-in', params: { next: 'checkout' } }),
                }}
            />
        )
    }

    if (items.length === 0) {
        return (
            <ScreenState
                kind="empty"
                icon="cart-outline"
                title="Your cart is empty"
                message="Add products before checking out."
                action={{ title: 'Start shopping', onPress: () => router.replace('/') }}
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

    const itemCount = items.reduce((n, i) => n + i.quantity, 0)

    const update = (key: keyof AccountForm, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

    const onApplyPromo = () => setPromoError(applyPromo(promoInput.trim() || null))

    const review = () => {
        const next = validateAccount('checkout', form)
        setErrors(next)
        if (Object.keys(next).length > 0) {
            notify('danger', 'Check your details', 'Some delivery details are missing.')
            return
        }
        const { password: _p, ...shipping } = trimAccount(form)
        setPendingShipping(shipping)
    }

    const placeOrder = async (shipping: ShippingDetails) => {
        setSubmitting(true)
        try {
            // Re-price from the live catalogue so the server's price check never sees stale prices.
            const fresh = await catalog.refresh()
            if (!fresh) throw new Error('Could not refresh prices. Check your connection and try again.')
            const freshMap = new Map(fresh.map((p) => [productKey(p), p]))
            const freshPricing = calculateCartPricing(
                items.map((i) => ({ divisionId: i.product.divisionId, sku: i.product.sku, quantity: i.quantity })),
                freshMap,
                promoCode,
            )
            if (freshPricing.grandTotal !== pricing.grandTotal) {
                setPendingShipping(null)
                notify('danger', 'Prices updated', 'Some prices changed. Please review your new total.')
                return
            }
            checkoutId.current ??= newCheckoutId()
            const result = await commerceApi.checkout({
                checkoutId: checkoutId.current,
                customerId: customer.customerId,
                shipping,
                pricing: freshPricing,
            })
            checkoutId.current = null
            setPendingShipping(null)
            clear()
            setPlaced(result)
        } catch (e) {
            setPendingShipping(null)
            notify('danger', 'Order not placed', e instanceof Error ? e.message : 'Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.notice}>
                    <Ionicons name="person-circle-outline" size={20} color={colors.brandText} />
                    <Text style={styles.noticeText}>
                        Ordering as <Text style={styles.strong}>{customer.email}</Text>. Your saved delivery details are
                        filled in; change them here for this order only.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Delivery details</Text>
                    <Field label="Email" value={form.email} editable={false} />
                    <DeliveryFields form={form} errors={errors} onChange={update} />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Promo code</Text>
                    <View style={styles.promoRow}>
                        <View style={styles.flex}>
                            <Field
                                label="Code"
                                placeholder="Optional, e.g. AWIC10"
                                value={promoInput}
                                error={promoError}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                onChangeText={(v) => {
                                    setPromoInput(v.toUpperCase())
                                    setPromoError(null)
                                }}
                                onSubmitEditing={onApplyPromo}
                            />
                        </View>
                        <PrimaryButton
                            title={promoCode && promoInput.trim() === promoCode ? 'Applied' : 'Apply'}
                            icon={promoCode && promoInput.trim() === promoCode ? 'checkmark' : undefined}
                            variant="secondary"
                            onPress={onApplyPromo}
                            style={styles.promoButton}
                        />
                    </View>
                    {promoCode ? (
                        <Text style={styles.promoApplied}>
                            {promoCode} applied ·{' '}
                            <Text
                                style={styles.link}
                                onPress={() => {
                                    applyPromo(null)
                                    setPromoInput('')
                                }}
                            >
                                Remove
                            </Text>
                        </Text>
                    ) : null}
                </View>

                {pricing.stores.map((store) => (
                    <View key={store.divisionId} style={styles.card}>
                        <View style={styles.storeHead}>
                            <SellerTag divisionId={store.divisionId} />
                            <Text style={styles.muted}>
                                {store.lines.reduce((n, l) => n + l.quantity, 0)} item(s)
                            </Text>
                        </View>
                        {store.lines.map((line) => (
                            <View key={line.sku} style={styles.line}>
                                <Text style={styles.lineName} numberOfLines={2}>
                                    {line.quantity} × {line.name}
                                </Text>
                                <Text style={styles.lineTotal}>{formatMoney(line.lineTotal)}</Text>
                            </View>
                        ))}
                        <View style={styles.divider} />
                        <Row label="Items" value={formatMoney(store.subtotal)} />
                        {store.discountAmount > 0 ? (
                            <Row label={`Discount (${store.promoCode})`} value={`−${formatMoney(store.discountAmount)}`} accent />
                        ) : null}
                        <Row label="Delivery" value={formatMoney(store.shipping)} />
                        <View style={styles.storeTotal}>
                            <Text style={styles.storeTotalText}>Store total</Text>
                            <Text style={styles.storeTotalText}>{formatMoney(store.grandTotal)}</Text>
                        </View>
                    </View>
                ))}

                <View style={styles.payment}>
                    <Ionicons name="cash-outline" size={20} color={colors.brand} />
                    <Text style={styles.paymentText}>Cash on delivery — pay each store when your order arrives.</Text>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
                <View style={styles.footerTotal}>
                    <Text style={styles.muted}>Total due on delivery</Text>
                    <Text style={styles.grandTotal}>{formatMoney(pricing.grandTotal)}</Text>
                </View>
                <PrimaryButton title="Place order" icon="lock-closed-outline" loading={submitting} onPress={review} style={styles.place} />
            </View>

            <ConfirmDialog
                visible={pendingShipping !== null}
                tone="warning"
                title="Place this order?"
                confirmText="Place order"
                cancelText="Review again"
                loading={submitting}
                onConfirm={() => {
                    if (pendingShipping) void placeOrder(pendingShipping)
                }}
                onCancel={() => setPendingShipping(null)}
            >
                {pendingShipping ? (
                    <>
                        <Text style={styles.dialogText}>
                            {itemCount} item{itemCount === 1 ? '' : 's'} from {pricing.stores.length} store
                            {pricing.stores.length === 1 ? '' : 's'} for delivery to{' '}
                            <Text style={styles.strong}>
                                {pendingShipping.addressLine1}, {pendingShipping.city}
                            </Text>
                            .
                        </Text>
                        <Text style={styles.dialogText}>
                            Total due on delivery: <Text style={styles.strong}>{formatMoney(pricing.grandTotal)}</Text>
                        </Text>
                    </>
                ) : null}
            </ConfirmDialog>
        </KeyboardAvoidingView>
    )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <View style={styles.row}>
            <Text style={styles.muted}>{label}</Text>
            <Text style={[styles.rowValue, accent && styles.accent]}>{value}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { padding: 16, gap: 14, paddingBottom: 24 },
    notice: {
        flexDirection: 'row',
        gap: 10,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.brandBorder,
        backgroundColor: colors.brandSoft,
        padding: 12,
    },
    noticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
    strong: { fontWeight: '700', color: colors.text },
    card: {
        ...shadow,
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    promoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    promoButton: { marginTop: 25 },
    promoApplied: { fontSize: 13, color: colors.brandText, fontWeight: '600' },
    link: { color: colors.textMuted, textDecorationLine: 'underline' },
    storeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    muted: { fontSize: 13, color: colors.textMuted },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    lineName: { flex: 1, fontSize: 14, color: colors.textSecondary },
    lineTotal: { fontSize: 14, fontWeight: '600', color: colors.text },
    divider: { height: 1, backgroundColor: colors.border },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowValue: { fontSize: 13, color: colors.textSecondary },
    accent: { color: colors.brandText, fontWeight: '600' },
    storeTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    storeTotalText: { fontSize: 15, fontWeight: '700', color: colors.text },
    payment: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    paymentText: { flex: 1, fontSize: 13, color: colors.textMuted },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 14,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    footerTotal: { flex: 1 },
    grandTotal: { fontSize: 20, fontWeight: '800', color: colors.text },
    place: { paddingHorizontal: 20 },
    dialogText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    success: { flexGrow: 1, alignItems: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
    successIcon: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successTitle: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    successText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
    placedList: { alignSelf: 'stretch', gap: 8, maxWidth: 480, width: '100%', marginHorizontal: 'auto' },
    placedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    placedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    placedNumber: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontWeight: '600', color: colors.text },
    placedTotal: { fontWeight: '700', color: colors.text },
    successActions: { alignSelf: 'stretch', gap: 10, marginTop: 8, maxWidth: 480, width: '100%', marginHorizontal: 'auto' },
})
