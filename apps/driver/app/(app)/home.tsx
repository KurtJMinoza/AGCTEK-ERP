import { useCallback } from 'react'
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { StatusBadge } from '@/src/components/StatusBadge'
import { useAuth } from '@/src/hooks/useAuth'
import { stopQty, useActiveTrip } from '@/src/hooks/useActiveTrip'

export default function HomeScreen() {
    const { session, signOut } = useAuth()
    const router = useRouter()
    const driver = session?.driver
    const { trip, loading, error, reload } = useActiveTrip(driver?.id)

    useFocusEffect(
        useCallback(() => {
            void reload()
        }, [reload]),
    )

    const stopCount = trip?.stops?.length ?? 0

    return (
        <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl refreshing={loading} onRefresh={reload} />
            }
        >
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.hello}>
                        Hi, {driver?.firstName ?? 'Driver'}
                    </Text>
                    <Text style={styles.meta}>{driver?.phone}</Text>
                </View>
                <Pressable onPress={() => void signOut()}>
                    <Text style={styles.signOut}>Sign out</Text>
                </Pressable>
            </View>

            {loading && !trip ? (
                <ActivityIndicator
                    style={{ marginTop: 40 }}
                    color="#ea580c"
                    size="large"
                />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!loading && !trip ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No active trip</Text>
                    <Text style={styles.emptyBody}>
                        When dispatch assigns you a trip (ASSIGNED / IN_TRANSIT),
                        it will appear here. Live Tracking stays on the
                        dispatcher web app.
                    </Text>
                    <PrimaryButton
                        title="Refresh"
                        variant="secondary"
                        onPress={() => void reload()}
                        style={{ marginTop: 16 }}
                    />
                </View>
            ) : null}

            {trip ? (
                <Pressable
                    style={styles.card}
                    onPress={() => router.push(`/(app)/trip/${trip.id}`)}
                >
                    <View style={styles.cardTop}>
                        <Text style={styles.tripCode}>{trip.code}</Text>
                        <StatusBadge status={trip.status} />
                    </View>
                    <Text style={styles.plate}>
                        {trip.vehicle?.plateNumber ?? 'No vehicle'} ·{' '}
                        {trip.vehicle?.make} {trip.vehicle?.model}
                    </Text>
                    <View style={styles.stats}>
                        <View>
                            <Text style={styles.statLabel}>Stops</Text>
                            <Text style={styles.statValue}>{stopCount}</Text>
                        </View>
                        <View>
                            <Text style={styles.statLabel}>Total qty</Text>
                            <Text style={styles.statValue}>
                                {(trip.totalQty ??
                                    (trip.stops ?? []).reduce(
                                        (s, stop) => s + stopQty(stop),
                                        0,
                                    )
                                ).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                    <PrimaryButton
                        title="Open trip"
                        onPress={() => router.push(`/(app)/trip/${trip.id}`)}
                        style={{ marginTop: 16 }}
                    />
                </Pressable>
            ) : null}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 40 },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    hello: { fontSize: 24, fontWeight: '800', color: '#111827' },
    meta: { marginTop: 4, color: '#6b7280' },
    signOut: { color: '#ea580c', fontWeight: '700', fontSize: 15 },
    error: { color: '#b91c1c', marginBottom: 12 },
    empty: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    emptyBody: {
        marginTop: 8,
        color: '#6b7280',
        lineHeight: 22,
        fontSize: 15,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    tripCode: { fontSize: 20, fontWeight: '800', color: '#111827' },
    plate: { marginTop: 8, color: '#4b5563', fontSize: 15 },
    stats: {
        flexDirection: 'row',
        gap: 32,
        marginTop: 16,
    },
    statLabel: {
        fontSize: 11,
        textTransform: 'uppercase',
        color: '#9ca3af',
        fontWeight: '700',
        letterSpacing: 0.4,
    },
    statValue: {
        marginTop: 4,
        fontSize: 22,
        fontWeight: '800',
        color: '#111827',
    },
})
