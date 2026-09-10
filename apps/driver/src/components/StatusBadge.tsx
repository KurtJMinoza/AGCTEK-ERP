import { View, Text, StyleSheet } from 'react-native'
import type { StopStatus } from '../types'

const tone: Record<string, { bg: string; fg: string }> = {
    PENDING: { bg: '#e5e7eb', fg: '#374151' },
    ARRIVED: { bg: '#dbeafe', fg: '#1d4ed8' },
    COMPLETED: { bg: '#d1fae5', fg: '#047857' },
    DELIVERED: { bg: '#d1fae5', fg: '#047857' },
    FAILED: { bg: '#fee2e2', fg: '#b91c1c' },
    SKIPPED: { bg: '#fef3c7', fg: '#b45309' },
    ASSIGNED: { bg: '#e0e7ff', fg: '#3730a3' },
    IN_TRANSIT: { bg: '#dbeafe', fg: '#1d4ed8' },
}

export function StatusBadge({ status }: { status: StopStatus | string }) {
    const colors = tone[status] ?? tone.PENDING
    const label = status
        .toLowerCase()
        .split('_')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ')

    return (
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.text, { color: colors.fg }]}>{label}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
    },
    text: {
        fontSize: 12,
        fontWeight: '700',
    },
})
