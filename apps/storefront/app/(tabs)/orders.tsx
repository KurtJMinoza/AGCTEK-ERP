import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Chip } from '@/src/components/Chip'
import { OrderCard } from '@/src/components/OrderCard'
import { ORDER_STATUS_LABELS } from '@/src/components/OrderStatusBadge'
import { ScreenState } from '@/src/components/ScreenState'
import { useAuth } from '@/src/context/AuthContext'
import { useOrders } from '@/src/hooks/useOrders'
import { colors } from '@/src/theme'
import type { OrderStatus } from '@/src/types'

const FILTERS: (OrderStatus | 'ALL')[] = ['ALL', 'PENDING_APPROVAL', 'PREPARING_TO_SHIP', 'DELIVERED', 'CANCELLED']

/** My orders across every store (refreshed whenever the tab is opened). */
export default function OrdersScreen() {
    const router = useRouter()
    const { customer, loading: authLoading } = useAuth()
    const { data, loading, refreshing, error, refresh } = useOrders(customer?.customerId ?? null)
    const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL')
    const firstFocus = useRef(true)

    useFocusEffect(
        useCallback(() => {
            if (firstFocus.current) {
                firstFocus.current = false
                return
            }
            void refresh()
        }, [refresh]),
    )

    if (authLoading) return <ScreenState kind="loading" />
    if (!customer) {
        return (
            <ScreenState
                kind="empty"
                icon="receipt-outline"
                title="Sign in to see your orders"
                message="Track every order from AWIC, LPG and MCONPINCO in one place."
                action={{
                    title: 'Sign in',
                    icon: 'log-in-outline',
                    onPress: () => router.push({ pathname: '/sign-in', params: { next: 'orders' } }),
                }}
            />
        )
    }
    if (loading && !data) return <ScreenState kind="loading" message="Loading your orders…" />
    if (error && !data) return <ScreenState kind="error" message={error} onRetry={refresh} />

    const orders = (data ?? []).filter((o) => filter === 'ALL' || o.status === filter)

    return (
        <View style={styles.screen}>
            {data && data.length > 0 ? (
                <View style={styles.filters}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                        {FILTERS.map((f) => (
                            <Chip
                                key={f}
                                label={f === 'ALL' ? `All (${data.length})` : ORDER_STATUS_LABELS[f]}
                                selected={filter === f}
                                onPress={() => setFilter(f)}
                            />
                        ))}
                    </ScrollView>
                </View>
            ) : null}
            <FlatList
                data={orders}
                keyExtractor={(o) => o.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <ScreenState
                            kind="empty"
                            icon="receipt-outline"
                            title={filter === 'ALL' ? 'You have no orders yet' : `No ${ORDER_STATUS_LABELS[filter as OrderStatus].toLowerCase()} orders`}
                            message={filter === 'ALL' ? 'Orders you place in the marketplace appear here.' : undefined}
                            action={
                                filter === 'ALL'
                                    ? { title: 'Start shopping', onPress: () => router.navigate('/') }
                                    : undefined
                            }
                        />
                    </View>
                }
                renderItem={({ item }) => (
                    <OrderCard
                        order={item}
                        onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
                    />
                )}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    filters: { paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    chips: { paddingHorizontal: 16, gap: 8 },
    list: { padding: 16, gap: 12, flexGrow: 1 },
    empty: { flex: 1, minHeight: 360 },
})
