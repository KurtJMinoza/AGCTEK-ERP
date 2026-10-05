import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { OrderStatusBadge } from '@/src/components/OrderStatusBadge'
import { ScreenState } from '@/src/components/ScreenState'
import { SignInPrompt } from '@/src/components/SignInPrompt'
import { useAuth } from '@/src/context/AuthContext'
import { useOrders } from '@/src/hooks/useOrders'
import { colors } from '@/src/theme'
import { formatDateTime, formatMoney } from '@/src/utils/format'

export default function OrdersScreen() {
    const { customer, loading } = useAuth()
    if (loading) return <ScreenState kind="loading" />
    if (!customer) return <SignInPrompt message="Sign in to see your orders." />
    return <OrdersList />
}

function OrdersList() {
    const router = useRouter()
    const { data, loading, refreshing, error, refresh } = useOrders()
    const focusedOnce = useRef(false)

    useFocusEffect(
        useCallback(() => {
            if (focusedOnce.current) void refresh()
            focusedOnce.current = true
        }, [refresh]),
    )

    if (loading && !data) return <ScreenState kind="loading" />
    if (error && !data) return <ScreenState kind="error" message={error} onRetry={refresh} />

    return (
        <FlatList
            data={data ?? []}
            keyExtractor={(order) => order.id}
            contentContainerStyle={styles.list}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
            }
            ListEmptyComponent={
                <ScreenState kind="empty" title="No orders yet" message="Orders you place will show here." />
            }
            renderItem={({ item: order }) => {
                const units = order.lines.reduce((total, l) => total + l.quantity, 0)
                return (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
                        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                    >
                        <View style={styles.headerRow}>
                            <Text style={styles.number}>{order.orderNumber}</Text>
                            <OrderStatusBadge status={order.status} />
                        </View>
                        <Text style={styles.meta}>Placed {formatDateTime(order.placedAt)}</Text>
                        <Text style={styles.meta} numberOfLines={1}>
                            {order.lines.map((l) => l.name).join(', ')}
                        </Text>
                        <View style={styles.footerRow}>
                            <Text style={styles.meta}>
                                {units} {units === 1 ? 'unit' : 'units'}
                            </Text>
                            <Text style={styles.total}>{formatMoney(order.subtotal, order.currency)}</Text>
                        </View>
                    </Pressable>
                )
            }}
        />
    )
}

const styles = StyleSheet.create({
    list: { padding: 12, gap: 12, flexGrow: 1 },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        gap: 4,
    },
    pressed: { opacity: 0.85 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    number: { fontSize: 15, fontWeight: '700', color: colors.text },
    meta: { fontSize: 13, color: colors.textMuted },
    footerRow: {
        marginTop: 4,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    total: { fontSize: 15, fontWeight: '800', color: colors.text },
})
