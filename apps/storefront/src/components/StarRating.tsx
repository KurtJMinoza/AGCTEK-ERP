import Ionicons from '@expo/vector-icons/Ionicons'
import { StyleSheet, View } from 'react-native'
import { colors } from '../theme'

/** Five-star row; `rating` is out of 5 (defaults to 5 like the web cards while reviews are sparse). */
export function StarRating({ rating = 5, size = 12 }: { rating?: number; size?: number }) {
    const filled = Math.round(rating)
    return (
        <View style={styles.row} accessible accessibilityLabel={`Rated ${filled} out of 5`}>
            {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                    key={star}
                    name="star"
                    size={size}
                    color={star <= filled ? colors.star : colors.starEmpty}
                />
            ))}
        </View>
    )
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 1 } })
