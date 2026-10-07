import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { productsRoute } from '@/src/browse'
import { OFFICIAL_STORES, averageRating, discountPercent, productKey, storeName } from '@/src/catalog'
import { PrimaryButton, type IconName } from '@/src/components/PrimaryButton'
import { ProductGallery } from '@/src/components/ProductGallery'
import { ProductRow } from '@/src/components/ProductRow'
import { QuantityStepper } from '@/src/components/QuantityStepper'
import { ScreenState } from '@/src/components/ScreenState'
import { SellerTag } from '@/src/components/SellerTag'
import { StarRating } from '@/src/components/StarRating'
import { StockStatus } from '@/src/components/StockStatus'
import { useCart } from '@/src/context/CartContext'
import { useCatalog } from '@/src/context/CatalogContext'
import { useFavorites } from '@/src/context/FavoritesContext'
import { useShop } from '@/src/context/ShopContext'
import { useAvailability } from '@/src/hooks/useAvailability'
import { colors, divisionTheme, radius, shadow } from '@/src/theme'
import type { Product } from '@/src/types'
import { formatMoney } from '@/src/utils/format'

const RELATED_LIMIT = 12

/** Full product page (mobile /shop/<store>/<sku>). */
export default function ProductScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const { byId, ready, error, refresh } = useCatalog()
    const product = id ? byId.get(id) ?? null : null

    if (product) return <ProductView key={product.id} product={product} />

    return (
        <View style={styles.screen}>
            <TopBar title="Product" />
            {!ready ? (
                <ScreenState kind="loading" />
            ) : error ? (
                <ScreenState kind="error" message={error} onRetry={refresh} />
            ) : (
                <ScreenState
                    kind="empty"
                    icon="sad-outline"
                    title="We couldn’t find this product"
                    message="It may have been removed or is no longer sold online."
                    action={{ title: 'Continue shopping', onPress: () => router.navigate('/') }}
                />
            )}
        </View>
    )
}

function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    return (
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                style={styles.topButton}
            >
                <Ionicons name="arrow-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.topTitle} numberOfLines={1}>
                {title}
            </Text>
            {right}
        </View>
    )
}

function ProductView({ product }: { product: Product }) {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { products } = useCatalog()
    const { quantityByKey } = useCart()
    const { favorites, toggleFavorite } = useFavorites()
    const { requestAdd } = useShop()
    const { stock, loading, available, soldOut, maxQuantity } = useAvailability(product)
    const [quantity, setQuantity] = useState(1)

    useEffect(() => {
        setQuantity((q) => Math.max(1, Math.min(q, maxQuantity)))
    }, [maxQuantity])

    const key = productKey(product)
    const inCart = quantityByKey.get(key) ?? 0
    const favorite = favorites.has(key)
    const discount = discountPercent(product)
    const rating = averageRating(product)
    const seller = storeName(product.divisionId)
    const store = OFFICIAL_STORES.find((s) => s.divisionId === product.divisionId)
    const theme = divisionTheme(product.divisionId)

    const { similar, fromStore, storeCount } = useMemo(() => {
        const others = products.filter((p) => productKey(p) !== key)
        const similar = others.filter((p) => p.category === product.category).slice(0, RELATED_LIMIT)
        const shown = new Set(similar.map(productKey))
        const fromStore = others
            .filter((p) => p.divisionId === product.divisionId && !shown.has(productKey(p)))
            .slice(0, RELATED_LIMIT)
        const storeCount = products.filter((p) => p.divisionId === product.divisionId).length
        return { similar, fromStore, storeCount }
    }, [products, key, product.category, product.divisionId])

    const unavailableLabel = stock?.state === 'NOT_MAPPED' ? 'Unavailable' : 'Out of stock'
    const addToCart = () => requestAdd(product, quantity)
    const buyNow = () => requestAdd(product, quantity, true)

    return (
        <View style={styles.screen}>
            <TopBar
                title={product.name}
                right={
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: favorite }}
                        accessibilityLabel={favorite ? 'Remove from favourites' : 'Add to favourites'}
                        hitSlop={8}
                        onPress={() => toggleFavorite(key)}
                        style={styles.topButton}
                    >
                        <Ionicons
                            name={favorite ? 'heart' : 'heart-outline'}
                            size={22}
                            color={favorite ? colors.sale : colors.textSecondary}
                        />
                    </Pressable>
                }
            />

            <ScrollView contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}>
                <ProductGallery product={product} />

                <View style={styles.body}>
                    <View style={styles.crumbs}>
                        <Crumb label="Home" onPress={() => router.navigate('/')} />
                        <Ionicons name="chevron-forward" size={12} color={colors.textFaint} />
                        <Crumb label={seller} onPress={() => router.push(productsRoute({ store: product.divisionId }))} />
                        <Ionicons name="chevron-forward" size={12} color={colors.textFaint} />
                        <Crumb
                            label={product.category}
                            onPress={() =>
                                router.push(productsRoute({ store: product.divisionId, category: product.category }))
                            }
                        />
                    </View>

                    <View style={styles.tags}>
                        <SellerTag divisionId={product.divisionId} />
                        <View style={styles.official}>
                            <Ionicons name="checkmark-circle" size={14} color={colors.brandText} />
                            <Text style={styles.officialText}>Official store</Text>
                        </View>
                        {product.badge ? (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{product.badge}</Text>
                            </View>
                        ) : null}
                    </View>

                    <View>
                        <Text style={styles.name}>{product.name}</Text>
                        {product.tagline ? <Text style={styles.tagline}>{product.tagline}</Text> : null}
                        {rating !== null ? (
                            <View style={styles.ratingRow}>
                                <StarRating rating={rating} size={14} />
                                <Text style={styles.ratingText}>
                                    <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text> ·{' '}
                                    {product.reviews.length} review{product.reviews.length === 1 ? '' : 's'}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.priceCard}>
                        <View style={styles.priceRow}>
                            <Text style={[styles.price, discount !== null && styles.salePrice]}>
                                {formatMoney(product.price)}
                            </Text>
                            {discount !== null && product.originalPrice !== null ? (
                                <>
                                    <Text style={styles.original}>{formatMoney(product.originalPrice)}</Text>
                                    <View style={styles.discount}>
                                        <Text style={styles.discountText}>−{discount}%</Text>
                                    </View>
                                </>
                            ) : null}
                        </View>
                        {discount !== null && product.originalPrice !== null ? (
                            <Text style={styles.save}>
                                You save {formatMoney(product.originalPrice - product.price)}
                            </Text>
                        ) : null}
                        <View style={styles.stock}>
                            <StockStatus loading={loading} stock={stock} available={available} soldOut={soldOut} />
                        </View>
                    </View>

                    {product.description ? <Text style={styles.paragraph}>{product.description}</Text> : null}

                    {product.features.length > 0 ? (
                        <View style={styles.checks}>
                            {product.features.slice(0, 4).map((point) => (
                                <Check key={point} text={point} />
                            ))}
                        </View>
                    ) : null}

                    <View style={styles.quantityRow}>
                        <View style={styles.quantityLeft}>
                            <Text style={styles.muted}>Quantity</Text>
                            <QuantityStepper
                                value={quantity}
                                label={product.name}
                                canDecrease={quantity > 1}
                                canIncrease={quantity < maxQuantity}
                                onDecrease={() => setQuantity((q) => Math.max(1, q - 1))}
                                onIncrease={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                            />
                        </View>
                        {inCart > 0 ? (
                            <Pressable accessibilityRole="link" onPress={() => router.navigate('/cart')}>
                                <Text style={styles.link}>{inCart} in your cart · View cart</Text>
                            </Pressable>
                        ) : null}
                    </View>

                    <View style={styles.perks}>
                        <Perk icon="car-outline">Delivered by {seller}</Perk>
                        <Perk icon="cash-outline">Cash on delivery</Perk>
                        {product.warranty ? <Perk icon="shield-checkmark-outline">{product.warranty}</Perk> : null}
                        <Perk icon="ribbon-outline">Sold by the official {seller} store</Perk>
                    </View>

                    <Section title="Product details">
                        <Text style={product.details || product.description ? styles.paragraph : styles.placeholder}>
                            {product.details ?? (product.description || 'No description yet.')}
                        </Text>
                        {product.features.length > 0 ? (
                            <View style={styles.subsection}>
                                <Text style={styles.subTitle}>Highlights</Text>
                                {product.features.map((point) => (
                                    <Check key={point} text={point} />
                                ))}
                            </View>
                        ) : null}
                        {product.inclusions.length > 0 ? (
                            <View style={styles.subsection}>
                                <Text style={styles.subTitle}>What’s in the box</Text>
                                <View style={styles.inBox}>
                                    {product.inclusions.map((item) => (
                                        <View key={item} style={styles.inBoxItem}>
                                            <Text style={styles.inBoxText}>{item}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ) : null}
                    </Section>

                    <Section title="Specifications">
                        {product.specs.map((spec) => (
                            <View key={spec.label} style={styles.spec}>
                                <Text style={styles.specLabel}>{spec.label}</Text>
                                <Text style={styles.specValue}>{spec.value}</Text>
                            </View>
                        ))}
                    </Section>

                    <Section
                        title="Customer reviews"
                        aside={
                            rating !== null ? (
                                <View style={styles.ratingRow}>
                                    <StarRating rating={rating} />
                                    <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
                                </View>
                            ) : null
                        }
                    >
                        {product.reviews.length > 0 ? (
                            product.reviews.map((review, i) => (
                                <View key={review.id} style={[styles.review, i > 0 && styles.reviewBorder]}>
                                    <View style={styles.reviewHead}>
                                        <StarRating rating={review.rating} />
                                        <Text style={styles.reviewMeta}>
                                            {review.author}
                                            {review.date ? ` · ${new Date(review.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                                        </Text>
                                    </View>
                                    {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
                                    {review.body ? <Text style={styles.paragraph}>{review.body}</Text> : null}
                                </View>
                            ))
                        ) : (
                            <Text style={styles.placeholder}>No reviews yet for this product.</Text>
                        )}
                    </Section>

                    <View style={[styles.storeCard, { borderColor: theme.soft }]}>
                        <View style={styles.storeHead}>
                            <View style={[styles.storeIcon, { backgroundColor: theme.solid }]}>
                                <Ionicons name={store?.icon ?? 'storefront-outline'} size={24} color={theme.onSolid} />
                            </View>
                            <View style={styles.flex}>
                                <Text style={styles.soldBy}>SOLD BY</Text>
                                <View style={styles.storeNameRow}>
                                    <Text style={styles.storeName}>{seller}</Text>
                                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                                </View>
                                {store ? (
                                    <Text style={styles.muted}>
                                        {store.tagline} ·{' '}
                                        <Text style={{ color: theme.text, fontWeight: '600' }}>
                                            {storeCount} item{storeCount === 1 ? '' : 's'}
                                        </Text>
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                        <PrimaryButton
                            title={`Visit ${seller} store`}
                            variant="secondary"
                            onPress={() => router.push(productsRoute({ store: product.divisionId }))}
                        />
                    </View>
                </View>

                <View style={styles.rows}>
                    <ProductRow
                        title={`More in ${product.category}`}
                        products={similar}
                        onViewAll={() => router.push(productsRoute({ category: product.category }))}
                    />
                    <ProductRow
                        title={`More from ${seller}`}
                        products={fromStore}
                        onViewAll={() => router.push(productsRoute({ store: product.divisionId }))}
                    />
                </View>
            </ScrollView>

            <View style={[styles.sticky, { paddingBottom: 12 + insets.bottom }]}>
                <View style={styles.stickyPrice}>
                    <Text style={[styles.stickyAmount, discount !== null && styles.salePrice]} numberOfLines={1}>
                        {formatMoney(product.price)}
                    </Text>
                    {discount !== null && product.originalPrice !== null ? (
                        <Text style={styles.stickyOriginal} numberOfLines={1}>
                            {formatMoney(product.originalPrice)}
                        </Text>
                    ) : null}
                </View>
                <PrimaryButton
                    title="Add"
                    icon="cart-outline"
                    variant="secondary"
                    accessibilityLabel="Add to cart"
                    disabled={soldOut}
                    onPress={addToCart}
                    style={styles.stickyButton}
                />
                <PrimaryButton
                    title={soldOut ? unavailableLabel : 'Buy now'}
                    disabled={soldOut}
                    onPress={buyNow}
                    style={styles.stickyButton}
                />
            </View>
        </View>
    )
}

function Crumb({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <Pressable accessibilityRole="link" onPress={onPress} hitSlop={4}>
            <Text style={styles.crumb} numberOfLines={1}>
                {label}
            </Text>
        </Pressable>
    )
}

function Check({ text }: { text: string }) {
    return (
        <View style={styles.check}>
            <Ionicons name="checkmark" size={16} color={colors.brand} style={styles.checkIcon} />
            <Text style={styles.checkText}>{text}</Text>
        </View>
    )
}

function Perk({ icon, children }: { icon: IconName; children: ReactNode }) {
    return (
        <View style={styles.perk}>
            <View style={styles.perkIcon}>
                <Ionicons name={icon} size={18} color={colors.brand} />
            </View>
            <Text style={styles.perkText}>{children}</Text>
        </View>
    )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {aside}
            </View>
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingBottom: 8,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    topButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    topTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
    body: { padding: 16, gap: 16 },
    crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
    crumb: { fontSize: 13, fontWeight: '500', color: colors.brandText, maxWidth: 160 },
    tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    official: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    officialText: { fontSize: 12, fontWeight: '600', color: colors.brandText },
    badge: { backgroundColor: colors.warningSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 11, fontWeight: '700', color: colors.warning },
    name: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    tagline: { fontSize: 15, color: colors.textMuted, marginTop: 6 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    ratingText: { fontSize: 13, color: colors.textMuted },
    ratingValue: { fontWeight: '700', color: colors.textSecondary },
    priceCard: {
        ...shadow,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
    price: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
    salePrice: { color: colors.sale },
    original: { fontSize: 15, color: colors.textFaint, textDecorationLine: 'line-through' },
    discount: { backgroundColor: colors.saleSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    discountText: { fontSize: 13, fontWeight: '700', color: colors.sale },
    save: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.brandText },
    stock: { marginTop: 12 },
    paragraph: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
    placeholder: { fontSize: 14, color: colors.textFaint },
    checks: { gap: 8 },
    check: { flexDirection: 'row', gap: 8 },
    checkIcon: { marginTop: 2 },
    checkText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    quantityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    quantityLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    muted: { fontSize: 13, color: colors.textMuted },
    link: { fontSize: 13, fontWeight: '600', color: colors.brandText },
    perks: {
        ...shadow,
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
    perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    perkIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    perkText: { flex: 1, fontSize: 14, color: colors.textSecondary },
    section: {
        ...shadow,
        gap: 10,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 18,
    },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    subsection: { gap: 8, marginTop: 8 },
    subTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    inBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    inBoxItem: {
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.tile,
        paddingHorizontal: 12,
        paddingVertical: 5,
    },
    inBoxText: { fontSize: 12, color: colors.textSecondary },
    spec: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    specLabel: { fontSize: 14, color: colors.textMuted },
    specValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: colors.text },
    review: { paddingVertical: 12, gap: 4 },
    reviewBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    reviewMeta: { fontSize: 12, color: colors.textFaint },
    reviewTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
    storeCard: {
        ...shadow,
        gap: 16,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        padding: 18,
    },
    storeHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    storeIcon: { width: 54, height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    soldBy: { fontSize: 11, fontWeight: '600', letterSpacing: 1.4, color: colors.textFaint },
    storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    storeName: { fontSize: 18, fontWeight: '700', color: colors.text },
    rows: { gap: 28, paddingTop: 12 },
    sticky: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    stickyPrice: { flex: 1, minWidth: 0 },
    stickyAmount: { fontSize: 18, fontWeight: '800', color: colors.text },
    stickyOriginal: { fontSize: 12, color: colors.textFaint, textDecorationLine: 'line-through' },
    stickyButton: { paddingHorizontal: 14 },
})
