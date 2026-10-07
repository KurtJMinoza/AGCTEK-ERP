import Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { storeName } from '@/src/catalog'
import { OrderCard } from '@/src/components/OrderCard'
import { OrderTimeline } from '@/src/components/OrderTimeline'
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
})
