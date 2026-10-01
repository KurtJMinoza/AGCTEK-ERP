import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import type { OrderStatus, OrderTracking, TrackingEvent } from '../types'
import { formatDateTime } from '../utils/format'
import { ORDER_STATUS_LABELS } from './OrderStatusBadge'

const MILESTONES: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED']

type Row = {
    key: string
    label: string
    event: TrackingEvent | null
}

function buildRows(tracking: OrderTracking): Row[] {
    if (tracking.status === 'CANCELLED') {
        return tracking.events.map((e, i) => ({ key: `${e.status}-${i}`, label: e.label, event: e }))
    }
    return MILESTONES.map((status) => {
        const event = tracking.events.find((e) => e.status === status) ?? null
        return { key: status, label: event?.label ?? ORDER_STATUS_LABELS[status], event }
    })
}

export function TrackingTimeline({ tracking }: { tracking: OrderTracking }) {
    const rows = buildRows(tracking)
    const currentIndex = rows.reduce((last, row, i) => (row.event ? i : last), -1)

    return (
        <View>
            {rows.map((row, i) => {
                const reached = !!row.event
                const current = i === currentIndex
                const isLast = i === rows.length - 1
                return (
                    <View key={row.key} style={styles.row}>
                        <View style={styles.rail}>
                            <View
                                style={[
                                    styles.dot,
                                    reached && styles.dotReached,
                                    current && styles.dotCurrent,
                                ]}
                            />
                            {!isLast ? (
                                <View style={[styles.line, i < currentIndex && styles.lineReached]} />
                            ) : null}
                        </View>
                        <View style={styles.body}>
                            <Text
                                style={[
                                    styles.label,
                                    !reached && styles.labelPending,
                                    current && styles.labelCurrent,
                                ]}
                            >
                                {row.label}
                            </Text>
                            {row.event ? (
                                <Text style={styles.meta}>
                                    {formatDateTime(row.event.occurredAt)}
                                    {row.event.area ? ` · ${row.event.area}` : ''}
                                </Text>
                            ) : (
                                <Text style={styles.meta}>Pending</Text>
                            )}
                        </View>
                    </View>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', minHeight: 56 },
    rail: { width: 24, alignItems: 'center' },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginTop: 4,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: '#d1d5db',
    },
    dotReached: { backgroundColor: colors.brand, borderColor: colors.brand },
    dotCurrent: {
        width: 16,
        height: 16,
        borderRadius: 8,
        marginTop: 2,
        borderColor: '#fed7aa',
        borderWidth: 3,
    },
    line: { flex: 1, width: 2, backgroundColor: '#e5e7eb', marginVertical: 2 },
    lineReached: { backgroundColor: colors.brand },
    body: { flex: 1, paddingLeft: 10, paddingBottom: 14 },
    label: { fontSize: 15, fontWeight: '600', color: colors.text },
    labelPending: { color: colors.textMuted, fontWeight: '500' },
    labelCurrent: { color: colors.brand, fontWeight: '700' },
    meta: { marginTop: 2, fontSize: 13, color: colors.textMuted },
})
