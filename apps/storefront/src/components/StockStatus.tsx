import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import type { Availability } from '../types'

const LOW_STOCK_AT = 10

type Props = {
    loading: boolean
    stock: Availability | null
    available: number | null
    soldOut: boolean
}

/** Stock line on the product page (same wording as the web). */
export function StockStatus({ loading, stock, available, soldOut }: Props) {
    if (loading) return <Text style={styles.checking}>Checking stock…</Text>
    if (!stock || stock.state === 'NON_INVENTORY') return null

    const [dot, fg, label] = soldOut
        ? [colors.sale, colors.sale, stock.state === 'NOT_MAPPED' ? 'Not available online' : 'Out of stock']
        : (available ?? 0) <= LOW_STOCK_AT
          ? ['#f59e0b', colors.warning, `Only ${available} left in stock`]
          : ['#10b981', colors.brandText, `In stock · ${available} available`]

    return (
        <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    checking: { fontSize: 14, color: colors.textFaint },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    label: { fontSize: 14, fontWeight: '600' },
})
