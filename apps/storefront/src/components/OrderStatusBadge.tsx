import { StyleSheet, Text, View } from 'react-native'
import type { OrderStatus } from '../types'

/** Same wording as the web "My orders". */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    PENDING_APPROVAL: 'Waiting for Approval',
    PREPARING_TO_SHIP: 'Preparing to Ship',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
}

const TONES: Record<OrderStatus, { bg: string; fg: string }> = {
    PENDING_APPROVAL: { bg: '#fef3c7', fg: '#b45309' },
    PREPARING_TO_SHIP: { bg: '#ffedd5', fg: '#c2410c' },
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
