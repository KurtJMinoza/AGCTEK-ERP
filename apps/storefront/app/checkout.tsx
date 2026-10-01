import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { commerceApi } from '@/src/api/client'
import { Card } from '@/src/components/Card'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ScreenState } from '@/src/components/ScreenState'
import { SignInPrompt } from '@/src/components/SignInPrompt'
import { useAuth } from '@/src/context/AuthContext'
import { useCart } from '@/src/context/CartContext'
import { colors } from '@/src/theme'
import { formatMoney } from '@/src/utils/format'

export default function CheckoutScreen() {
    const router = useRouter()
    const { customer, loading: authLoading } = useAuth()
    const { items, hydrated, estimatedSubtotal, clear } = useCart()
    const [address, setAddress] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!hydrated || authLoading) return <ScreenState kind="loading" />
    if (!customer) return <SignInPrompt message="Sign in to place your order." />
    if (items.length === 0) {
        return <ScreenState kind="empty" title="Your cart is empty" message="Add products before checking out." />
    }

    const shippingAddress = address ?? customer.defaultAddress ?? ''
    const currency = items[0]?.currency ?? 'PHP'

    const placeOrder = async () => {
        if (!shippingAddress.trim()) {
            setError('Enter a delivery address')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const order = await commerceApi.createOrder({
                items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
                shippingAddress: shippingAddress.trim(),
                notes: notes.trim() || null,
            })
            router.replace({ pathname: '/order/[id]', params: { id: order.id } })
            clear()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not place order')
            setSubmitting(false)
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Card title="Deliver to">
                    <Text style={styles.customer}>{customer.name}</Text>
                    <TextInput
                        value={shippingAddress}
                        onChangeText={setAddress}
                        placeholder="Delivery address"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, styles.multiline]}
                        multiline
                    />
                </Card>

                <Card title="Notes for the store (optional)">
                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="e.g. Deliver to site gate"
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        maxLength={250}
                    />
                </Card>

                <Card title="Order summary">
                    {items.map((item) => (
                        <View key={item.productId} style={styles.line}>
                            <Text style={styles.lineName} numberOfLines={1}>
                                {item.quantity} × {item.name}
                            </Text>
                            <Text style={styles.lineTotal}>
                                {formatMoney(item.unitPrice * item.quantity, item.currency)}
                            </Text>
                        </View>
                    ))}
                    <View style={[styles.line, styles.totalLine]}>
                        <Text style={styles.totalLabel}>Estimated subtotal</Text>
                        <Text style={styles.totalValue}>{formatMoney(estimatedSubtotal, currency)}</Text>
                    </View>
                </Card>

                <Card title="Payment">
                    <Text style={styles.muted}>Cash on delivery (demo — no payment is taken).</Text>
                </Card>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <PrimaryButton title="Place order" loading={submitting} onPress={placeOrder} />
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: 16, gap: 16 },
    customer: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
    input: {
        minHeight: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.text,
    },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
    lineName: { flex: 1, fontSize: 14, color: colors.text },
    lineTotal: { fontSize: 14, fontWeight: '600', color: colors.text },
    totalLine: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    totalValue: { fontSize: 17, fontWeight: '800', color: colors.brand },
    muted: { fontSize: 14, color: colors.textMuted },
    error: { color: colors.danger, fontSize: 14, fontWeight: '600', textAlign: 'center' },
})
