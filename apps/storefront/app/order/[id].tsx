import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card } from '@/src/components/Card'
import { OrderStatusBadge } from '@/src/components/OrderStatusBadge'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ScreenState } from '@/src/components/ScreenState'
import { useOrder } from '@/src/hooks/useOrders'
import { colors } from '@/src/theme'
import { formatDateTime, formatMoney } from '@/src/utils/format'

export default function OrderDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const { data: order, loading, refreshing, error, refresh } = useOrder(id)

    if (loading && !order) return <ScreenState kind="loading" />
    if (error && !order) return <ScreenState kind="error" message={error} onRetry={refresh} />
    if (!order) return <ScreenState kind="empty" title="Order not found" />

    return (
        <>
            <Stack.Screen options={{ title: order.orderNumber }} />
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
                }
            >
                <Card>
                    <View style={styles.headerRow}>
                        <Text style={styles.number}>{order.orderNumber}</Text>
                        <OrderStatusBadge status={order.status} />
                    </View>
                    <Text style={styles.meta}>Placed {formatDateTime(order.placedAt)}</Text>
                </Card>

                {order.status !== 'CANCELLED' ? (
                    <PrimaryButton
                        title="Track delivery"
                        onPress={() => router.push({ pathname: '/track/[id]', params: { id: order.id } })}
                    />
                ) : null}

                <Card title="Delivery address">
                    <Text style={styles.body}>{order.shippingAddress ?? '—'}</Text>
                    {order.notes ? <Text style={styles.meta}>Note: {order.notes}</Text> : null}
                </Card>

                <Card title="Items">
                    {order.lines.map((line) => (
                        <View key={line.productId} style={styles.line}>
                            <View style={styles.lineInfo}>
                                <Text style={styles.body} numberOfLines={2}>
                                    {line.name}
                                </Text>
                                <Text style={styles.meta}>
                                    {line.quantity} {line.uom} × {formatMoney(line.unitPrice, order.currency)}
                                </Text>
                            </View>
                            <Text style={styles.lineTotal}>{formatMoney(line.lineTotal, order.currency)}</Text>
                        </View>
                    ))}
                    <View style={[styles.line, styles.totalLine]}>
                        <Text style={styles.totalLabel}>Subtotal</Text>
                        <Text style={styles.totalValue}>{formatMoney(order.subtotal, order.currency)}</Text>
                    </View>
                </Card>
            </ScrollView>
        </>
    )
}

const styles = StyleSheet.create({
    content: { padding: 16, gap: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    number: { fontSize: 17, fontWeight: '700', color: colors.text },
    meta: { fontSize: 13, color: colors.textMuted },
    body: { fontSize: 14, color: colors.text },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
    lineInfo: { flex: 1, gap: 2 },
    lineTotal: { fontSize: 14, fontWeight: '600', color: colors.text },
    totalLine: { marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    totalValue: { fontSize: 17, fontWeight: '800', color: colors.brand },
})
