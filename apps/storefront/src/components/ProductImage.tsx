import { Image, StyleSheet, Text, View, type ImageStyle } from 'react-native'
import { colors } from '../theme'
import type { Product } from '../types'

type Props = {
    product: Pick<Product, 'name' | 'imageUrl' | 'category'>
    style?: Pick<ImageStyle, 'borderRadius' | 'width' | 'height' | 'aspectRatio'>
}

export function ProductImage({ product, style }: Props) {
    if (product.imageUrl) {
        return (
            <Image
                source={{ uri: product.imageUrl }}
                style={[styles.box, style]}
                resizeMode="cover"
                accessibilityLabel={product.name}
            />
        )
    }
    return (
        <View style={[styles.box, styles.placeholder, style]}>
            <Text style={styles.initial}>{product.name.charAt(0)}</Text>
            <Text style={styles.category}>{product.category}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    box: { width: '100%', aspectRatio: 1, borderRadius: 10 },
    placeholder: {
        backgroundColor: colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    initial: { fontSize: 36, fontWeight: '800', color: colors.brand },
    category: { marginTop: 4, fontSize: 12, color: colors.textMuted },
})
