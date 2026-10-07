import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { colors, radius } from '../theme'
import type { Product } from '../types'
import { ProductImage } from './ProductImage'

const MAX_WIDTH = 720

/** Swipeable product photos with thumbnails (web product gallery). */
export function ProductGallery({ product }: { product: Product }) {
    const { width: windowWidth } = useWindowDimensions()
    const width = Math.min(windowWidth, MAX_WIDTH)
    const [index, setIndex] = useState(0)
    const count = Math.max(1, product.images.length)

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={32}
                onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
                style={{ width }}
            >
                {Array.from({ length: count }, (_, i) => (
                    <View key={i} style={[styles.slide, { width }]}>
                        <ProductImage product={product} index={i} />
                    </View>
                ))}
            </ScrollView>
            {count > 1 ? (
                <View style={styles.thumbs}>
                    {product.images.map((uri, i) => (
                        <Pressable
                            key={uri}
                            accessibilityRole="button"
                            accessibilityLabel={`Photo ${i + 1} of ${count}`}
                            accessibilityState={{ selected: i === index }}
                            style={[styles.thumb, i === index && styles.thumbActive]}
                        >
                            <ProductImage product={product} index={i} />
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: { backgroundColor: colors.surface, alignItems: 'center', paddingBottom: 12 },
    slide: { padding: 24, backgroundColor: colors.tile },
    thumbs: { flexDirection: 'row', gap: 8, marginTop: 12, paddingHorizontal: 16, flexWrap: 'wrap' },
    thumb: {
        width: 52,
        height: 52,
        borderRadius: radius.sm,
        borderWidth: 2,
        borderColor: colors.border,
        overflow: 'hidden',
        padding: 2,
        backgroundColor: colors.tile,
    },
    thumbActive: { borderColor: colors.brand },
})
