import Ionicons from '@expo/vector-icons/Ionicons'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, shadow } from '../theme'
import type { Order } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'
import { OrderStatusBadge } from './OrderStatusBadge'
import { SellerTag } from './SellerTag'

/** One order in "My orders" (same content as the web orders drawer card). */
export function OrderCard({ order, onPress }: { order: Order; onPress?: () => void }) {
    return (
        <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={`Order ${order.orderNumber}`}
            disabled={!onPress}
            onPress={onPress}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
            <View style={styles.head}>
                <View style={styles.headLeft}>
                    <Text style={styles.number}>{order.orderNumber}</Text>
                    <Text style={styles.date}>{formatDateTime(order.placedAt)}</Text>
                    <View style={styles.tags}>
                        {order.divisionIds.map((divisionId) => (
                            <SellerTag key={divisionId} divisionId={divisionId} />
                        ))}
                    </View>
                </View>
                <OrderStatusBadge status={order.status} />
            </View>
            <View style={styles.lines}>
                {order.lines.map((line) => (
                    <View key={`${order.id}-${line.sku}`} style={styles.line}>
                        <Text style={styles.lineName} numberOfLines={2}>
                            <Text style={styles.qty}>{line.quantity} ×</Text> {line.name}
                        </Text>
                        <Text style={styles.lineTotal}>{formatMoney(line.lineTotal)}</Text>
                    </View>
                ))}
                {order.shippingAmount > 0 ? (
                    <View style={styles.line}>
                        <Text style={styles.muted}>Delivery</Text>
                        <Text style={styles.muted}>{formatMoney(order.shippingAmount)}</Text>
                    </View>
                ) : null}
                {order.discountAmount > 0 ? (
                    <View style={styles.line}>
                        <Text style={styles.muted}>Discount{order.promoCode ? ` (${order.promoCode})` : ''}</Text>
                        <Text style={styles.muted}>−{formatMoney(order.discountAmount)}</Text>
                    </View>
                ) : null}
            </View>
            <View style={styles.total}>
                <Text style={styles.totalLabel}>{order.status === 'DELIVERED' ? 'Total paid' : 'Total'}</Text>
                <View style={styles.totalRight}>
                    <Text style={styles.totalValue}>{formatMoney(order.totalAmount)}</Text>
                    {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
                </View>
            </View>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    card: {
        ...shadow,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
    },
    pressed: { borderColor: colors.brandBorder },
    head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    headLeft: { flex: 1, gap: 3 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    number: {
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    date: { fontSize: 12, color: colors.textMuted },
    lines: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
    line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    lineName: { flex: 1, fontSize: 14, color: colors.textSecondary },
    qty: { fontWeight: '700', color: colors.text },
    lineTotal: { fontSize: 14, color: colors.text },
    muted: { fontSize: 13, color: colors.textMuted },
    total: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    totalRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    totalValue: { fontSize: 15, fontWeight: '800', color: colors.brandText },
})
