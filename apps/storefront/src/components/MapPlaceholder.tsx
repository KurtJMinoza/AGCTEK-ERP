import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

/**
 * Lightweight stand-in for a map. Customers only ever get a coarse area from
 * the tracking projection — never coordinates or a live vehicle position.
 */
export function MapPlaceholder({ area }: { area: string | null }) {
    return (
        <View style={styles.container} accessibilityRole="summary">
            <View style={styles.gridLineH} />
            <View style={styles.gridLineV} />
            <View style={styles.pin} />
            <Text style={styles.area}>{area ?? 'Location not available yet'}</Text>
            <Text style={styles.caption}>Approximate area</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        height: 150,
        borderRadius: 12,
        backgroundColor: '#eef2f7',
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    gridLineH: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '60%',
        height: 6,
        backgroundColor: '#dde3ea',
    },
    gridLineV: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '35%',
        width: 6,
        backgroundColor: '#dde3ea',
    },
    pin: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.brand,
        borderWidth: 3,
        borderColor: '#fff',
        marginBottom: 8,
    },
    area: { fontSize: 15, fontWeight: '700', color: colors.text },
    caption: { marginTop: 2, fontSize: 12, color: colors.textMuted },
})
