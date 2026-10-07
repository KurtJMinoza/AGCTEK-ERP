import Ionicons from '@expo/vector-icons/Ionicons'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import type { Order } from '../types'
import { formatDateTime } from '../utils/format'

type Step = { label: string; done: boolean; current: boolean; danger?: boolean; at?: string }

/** Order progress derived from the ERP order status (no courier tracking data exists). */
function stepsFor(order: Order): Step[] {
    const placed = { label: 'Order placed', done: true, current: false, at: order.placedAt }
    if (order.status === 'CANCELLED') {
        return [placed, { label: 'Cancelled', done: true, current: true, danger: true, at: order.updatedAt }]
    }
    const rank = { PROCESSING: 0, TO_BE_DELIVERED: 1, DELIVERED: 2 }[order.status]
    return [
        { ...placed, current: rank === 0 },
        { label: 'Confirmed · to be delivered', done: rank >= 1, current: rank === 1 },
        {
            label: 'Delivered',
            done: rank >= 2,
            current: rank === 2,
            at: rank === 2 ? order.updatedAt : undefined,
        },
    ]
}

export function OrderTimeline({ order }: { order: Order }) {
    const steps = stepsFor(order)
    return (
        <View>
            {steps.map((step, index) => {
                const color = step.danger ? colors.danger : step.done ? colors.brand : colors.borderStrong
                const last = index === steps.length - 1
                return (
                    <View key={step.label} style={styles.step}>
                        <View style={styles.rail}>
                            <View style={[styles.dot, { borderColor: color }, step.done && { backgroundColor: color }]}>
                                {step.done ? (
                                    <Ionicons name={step.danger ? 'close' : 'checkmark'} size={12} color="#fff" />
                                ) : null}
                            </View>
                            {!last ? (
                                <View style={[styles.line, steps[index + 1].done && !steps[index + 1].danger && styles.lineDone]} />
                            ) : null}
                        </View>
                        <View style={[styles.text, !last && styles.textGap]}>
                            <Text style={[styles.label, !step.done && styles.pending, step.current && styles.current]}>
                                {step.label}
                            </Text>
                            {step.at ? <Text style={styles.at}>{formatDateTime(step.at)}</Text> : null}
                        </View>
                    </View>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    step: { flexDirection: 'row', gap: 12 },
    rail: { alignItems: 'center', width: 20 },
    dot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    line: { flex: 1, width: 2, minHeight: 18, backgroundColor: colors.borderStrong },
    lineDone: { backgroundColor: colors.brand },
    text: { flex: 1 },
    textGap: { paddingBottom: 18 },
    label: { fontSize: 14, fontWeight: '500', color: colors.text },
    pending: { color: colors.textFaint },
    current: { fontWeight: '700' },
    at: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
})
