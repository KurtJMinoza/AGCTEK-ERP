import Ionicons from '@expo/vector-icons/Ionicons'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../theme'
import type { OrderFulfillment } from '../types'

const STEPS: OrderFulfillment['stage'][] = [
    'PENDING_PICK',
    'PICKING',
    'PACKED',
    'SHIPPED',
]

/** Live MM pick → pack progress, projected by SD order tracking. */
export function FulfillmentCard({ fulfillment }: { fulfillment: OrderFulfillment }) {
    const current = STEPS.indexOf(fulfillment.stage)
    const progress =
        fulfillment.requiredQty > 0
            ? `${fulfillment.pickedQty} of ${fulfillment.requiredQty} items picked`
            : null

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Ionicons name="cube-outline" size={20} color={colors.brand} />
                <Text style={styles.title}>{fulfillment.label}</Text>
            </View>
            {progress ? <Text style={styles.progress}>{progress}</Text> : null}
            <View style={styles.steps}>
                {STEPS.map((step, index) => (
                    <View
                        key={step}
                        style={[styles.step, index <= current && styles.stepDone]}
                    />
                ))}
            </View>
            <Text style={styles.hint}>
                Picked and packed by the warehouse before your order is dispatched.
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        gap: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: 16,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 15, fontWeight: '700', color: colors.text },
    progress: { fontSize: 13, color: colors.textSecondary },
    steps: { flexDirection: 'row', gap: 6 },
    step: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
    stepDone: { backgroundColor: colors.brand },
    hint: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
})
