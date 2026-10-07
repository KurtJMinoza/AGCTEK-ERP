import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { CATEGORY_ICONS } from '../catalog'
import { colors, divisionTheme } from '../theme'
import type { Product } from '../types'
import type { IconName } from './PrimaryButton'

type Props = {
    product: Pick<Product, 'name' | 'images' | 'category' | 'divisionId'>
    /** Which photo to show (gallery); defaults to the cover. */
    index?: number
    /** `contain` shows the whole product on the soft grey tile (cards, gallery). */
    fit?: 'cover' | 'contain'
    style?: StyleProp<ViewStyle>
}

/** Product photo on the grey tile, with a store-tinted icon when there is no photo. */
export function ProductImage({ product, index = 0, fit = 'contain', style }: Props) {
    const uri = product.images[index] ?? product.images[0]
    const [failed, setFailed] = useState<string | null>(null)

    if (uri && failed !== uri) {
        return (
            <View style={[styles.box, style]}>
                <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode={fit}
                    accessibilityLabel={product.name}
                    onError={() => setFailed(uri)}
                />
            </View>
        )
    }

    const theme = divisionTheme(product.divisionId)
    const icon = (CATEGORY_ICONS[product.category] ?? 'cube-outline') as IconName
    return (
        <View style={[styles.box, styles.placeholder, { backgroundColor: theme.soft }, style]}>
            <Ionicons name={icon} size={40} color={theme.text} accessibilityLabel={product.name} />
        </View>
    )
}

const styles = StyleSheet.create({
    box: { width: '100%', aspectRatio: 1, backgroundColor: colors.tile, overflow: 'hidden' },
    image: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center' },
})
