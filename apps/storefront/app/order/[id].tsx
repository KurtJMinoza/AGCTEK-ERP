import Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { storeName } from '@/src/catalog'
import { commerceApi } from '@/src/api/client'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { OrderCard } from '@/src/components/OrderCard'
import { OrderTimeline } from '@/src/components/OrderTimeline'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ScreenState } from '@/src/components/ScreenState'
import { SignInPrompt } from '@/src/components/SignInPrompt'
import { useAuth } from '@/src/context/AuthContext'
import { useOrders } from '@/src/hooks/useOrders'
import { colors, radius, shadow } from '@/src/theme'

/** Order detail: status progress, delivery address and items. */
export default function OrderDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const { customer } = useAuth()
    const { data, loading, refreshing, error, refresh } = useOrders(customer?.customerId ?? null)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [cancelError, setCancelError] = useState<string | null>(null)

    if (!customer) return <SignInPrompt message="Sign in to view this order." />
    if (loading && !data) return <ScreenState kind="loading" />
    if (error && !data) return <ScreenState kind="error" message={error} onRetry={refresh} />

    const order = data?.find((o) => o.id === id)
    if (!order) {
        return (
            <ScreenState
                kind="empty"
                icon="receipt-outline"
                title="Order not found"
                action={{ title: 'Back to my orders', onPress: () => router.navigate('/orders') }}
            />
        )
    }

    const requestCancel = async () => {
        setCancelling(true)
        setCancelError(null)
        try {
            await commerceApi.cancelOrder(order.id)
            setCancelOpen(false)
            await refresh()
        } catch (e) {
            setCancelError(e instanceof Error ? e.message : 'Unable to cancel order')
        } finally {
            setCancelling(false)
        }
    }

    return (
        <>
            <Stack.Screen options={{ title: order.orderNumber }} />
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
            >
                <View style={styles.card}>
                    <Text style={styles.title}>Order status</Text>
                    <OrderTimeline order={order} />
                </View>

                {order.status === 'PENDING_APPROVAL' ? (
                    <View style={styles.card}>
                        <Text style={styles.title}>Waiting for approval</Text>
                        <Text style={styles.muted}>
                            Our team is reviewing your order. It cannot be changed while it
                            waits, but you can cancel it now if you change your mind.
                        </Text>
                        {cancelError ? <Text style={styles.error}>{cancelError}</Text> : null}
                        <PrimaryButton
                            title="Request cancellation"
                            variant="secondary"
                            onPress={() => setCancelOpen(true)}
                        />
                    </View>
                ) : null}

                {order.shipTo ? (
                    <View style={styles.card}>
                        <Text style={styles.title}>Delivery</Text>
                        <View style={styles.info}>
                            <Ionicons name="location-outline" size={18} color={colors.brand} />
                            <View style={styles.flex}>
                                <Text style={styles.strong}>{order.shipTo.fullName}</Text>
                                {order.shipTo.phone ? <Text style={styles.muted}>{order.shipTo.phone}</Text> : null}
                                <Text style={styles.muted}>{order.shipTo.address}</Text>
                            </View>
                        </View>
                        <View style={styles.info}>
                            <Ionicons name="car-outline" size={18} color={colors.brand} />
                            <Text style={[styles.muted, styles.flex]}>Delivered by {order.divisionIds.map(storeName).join(', ') || 'the store'}
                            </Text>
                        </View>
                        <View style={styles.info}>
                            <Ionicons name="cash-outline" size={18} color={colors.brand} />
                            <Text style={[styles.muted, styles.flex]}>Cash on delivery</Text>
                        </View>
                    </View>
                ) : null}

                <OrderCard order={order} />
            </ScrollView>
            <ConfirmDialog
                visible={cancelOpen}
                tone="danger"
                title="Request cancellation?"
                confirmText="Request cancellation"
                cancelText="Keep order"
                loading={cancelling}
                onConfirm={() => void requestCancel()}
                onCancel={() => setCancelOpen(false)}
            >
                <Text style={styles.muted}>
                    {order.orderNumber} will be cancelled. You can place a new order any time.
                </Text>
            </ConfirmDialog>
        </>
    )
}

const styles = StyleSheet.create({
    content: { padding: 16, gap: 14 },
    flex: { flex: 1 },
    card: {
        ...shadow,
        gap: 14,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    info: { flexDirection: 'row', gap: 10 },
    strong: { fontSize: 14, fontWeight: '600', color: colors.text },
    muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    error: { fontSize: 14, color: colors.danger },
})
