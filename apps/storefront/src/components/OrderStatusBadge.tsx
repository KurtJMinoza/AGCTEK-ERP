import { StyleSheet, Text, View } from 'react-native'
import type { OrderStatus } from '../types'

/** Same wording as the web "My orders". */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    PROCESSING: 'Processing',
    TO_BE_DELIVERED: 'To be delivered',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
}

const TONES: Record<OrderStatus, { bg: string; fg: string }> = {
    PROCESSING: { bg: '#f3f4f6', fg: '#374151' },
    TO_BE_DELIVERED: { bg: '#fffbeb', fg: '#b45309' },
    DELIVERED: { bg: '#ecfdf5', fg: '#047857' },
    CANCELLED: { bg: '#fef2f2', fg: '#b91c1c' },
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
    badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    label: { fontSize: 12, fontWeight: '700' },
})
