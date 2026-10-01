import { StyleSheet, Text, View } from 'react-native'
import type { OrderStatus } from '../types'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    PLACED: 'Placed',
    CONFIRMED: 'Confirmed',
    PACKED: 'Packed',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
}

const TONES: Record<OrderStatus, { bg: string; fg: string }> = {
    PLACED: { bg: '#f3f4f6', fg: '#374151' },
    CONFIRMED: { bg: '#dbeafe', fg: '#1d4ed8' },
    PACKED: { bg: '#fef3c7', fg: '#b45309' },
    OUT_FOR_DELIVERY: { bg: '#ffedd5', fg: '#c2410c' },
    DELIVERED: { bg: '#dcfce7', fg: '#15803d' },
    CANCELLED: { bg: '#fee2e2', fg: '#b91c1c' },
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
    const tone = TONES[status]
    return (
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.label, { color: tone.fg }]}>{ORDER_STATUS_LABELS[status]}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    badge: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    label: { fontSize: 12, fontWeight: '700' },
})
