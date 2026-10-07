import Ionicons from '@expo/vector-icons/Ionicons'
import { memo } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { averageRating, discountPercent, productKey, storeName } from '../catalog'
import { MAX_LINE_QUANTITY, useCart } from '../context/CartContext'
import { useFavorites } from '../context/FavoritesContext'
import { useShop } from '../context/ShopContext'
import { colors, divisionTheme, radius, shadow } from '../theme'
import type { Product } from '../types'
import { formatMoney } from '../utils/format'
import { PrimaryButton } from './PrimaryButton'
import { ProductImage } from './ProductImage'
import { QuantityStepper } from './QuantityStepper'
import { StarRating } from './StarRating'

type Props = { product: Product; style?: StyleProp<ViewStyle> }

/** Marketplace product card (same layout as the web card), wired to cart, favourites and the product page. */
export const ProductCard = memo(function ProductCard({ product, style }: Props) {
    const { quantityByKey } = useCart()
    const { favorites, toggleFavorite } = useFavorites()
    const { requestAdd, increase, decrease, openProduct } = useShop()

    const key = productKey(product)
    const quantity = quantityByKey.get(key) ?? 0
    const favorite = favorites.has(key)
    const discount = discountPercent(product)

    return (
        <Pressable
            // A web "button" role renders <button>, which cannot contain the heart / cart buttons.
            accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
            accessibilityLabel={`View ${product.name}`}
            onPress={() => openProduct(product)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
        >
            <View style={styles.media}>
                <ProductImage product={product} />
                {product.badge ? (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText} numberOfLines={1}>
                            {product.badge}
                        </Text>
                    </View>
                ) : null}
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: favorite }}
                    accessibilityLabel={
                        favorite
                            ? `Remove ${product.name} from favourites`
                            : `Add ${product.name} to favourites`
                    }
                    hitSlop={6}
                    onPress={() => toggleFavorite(key)}
                    style={styles.heart}
                >
                    <Ionicons
                        name={favorite ? 'heart' : 'heart-outline'}
                        size={16}
                        color={favorite ? colors.sale : colors.textFaint}
                    />
                </Pressable>
            </View>

            <View style={styles.body}>
                <Text
                    style={[styles.store, { color: divisionTheme(product.divisionId).text }]}
                    numberOfLines={1}
                >
                    {storeName(product.divisionId)}
                </Text>
                <Text style={styles.name} numberOfLines={2}>
                    {product.name}
                </Text>
                <View style={styles.footer}>
                    <StarRating rating={averageRating(product) ?? 5} />
                    <View style={styles.prices}>
                        <Text style={[styles.price, discount !== null && styles.salePrice]}>
                            {formatMoney(product.price)}
                        </Text>
                        {product.originalPrice !== null ? (
                            <Text style={styles.original}>{formatMoney(product.originalPrice)}</Text>
                        ) : null}
                        {discount !== null ? (
                            <View style={styles.discount}>
                                <Text style={styles.discountText}>−{discount}%</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </View>

            {quantity > 0 ? (
                <View style={styles.inCart}>
                    <Text style={styles.inCartText}>In cart</Text>
                    <QuantityStepper
                        value={quantity}
                        label={product.name}
                        canIncrease={quantity < MAX_LINE_QUANTITY}
                        onDecrease={() => decrease(product)}
                        onIncrease={() => increase(product)}
                    />
                </View>
            ) : (
                <PrimaryButton
                    title="Add to Cart"
                    size="sm"
                    accessibilityLabel={`Add ${product.name} to cart`}
                    onPress={() => requestAdd(product)}
                />
            )}
        </Pressable>
    )
})

const styles = StyleSheet.create({
    card: {
        ...shadow,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 10,
        gap: 10,
    },
    pressed: { borderColor: colors.brandBorder },
    media: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.tile, padding: 8 },
    badge: {
        position: 'absolute',
        top: 8,
        left: 8,
        maxWidth: '65%',
        backgroundColor: '#f43f5e',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    heart: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: { flex: 1, gap: 6 },
    store: { fontSize: 11, fontWeight: '600' },
    name: { fontSize: 13, fontWeight: '500', color: colors.text, lineHeight: 18, minHeight: 36 },
    footer: { marginTop: 'auto', gap: 4 },
    prices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 2 },
    price: { fontSize: 15, fontWeight: '700', color: colors.text },
    salePrice: { color: colors.sale },
    original: { fontSize: 12, color: colors.textFaint, textDecorationLine: 'line-through' },
    discount: { backgroundColor: colors.saleSoft, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    discountText: { fontSize: 11, fontWeight: '700', color: colors.sale },
    inCart: {
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.brandBorder,
        backgroundColor: colors.brandSoft,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    inCartText: { fontSize: 12, fontWeight: '600', color: colors.brandText },
})
