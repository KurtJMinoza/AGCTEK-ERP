import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { productsRoute, type BrowseQuery } from '@/src/browse'
import { discountPercent, marketplaceCategories, type MarketplaceCategory } from '@/src/catalog'
import { CategoryGrid } from '@/src/components/home/CategoryGrid'
import { OfficialStores } from '@/src/components/home/OfficialStores'
import { StorePromoCarousel } from '@/src/components/home/StorePromoCarousel'
import { MarketplaceHeader } from '@/src/components/MarketplaceHeader'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ProductRow } from '@/src/components/ProductRow'
import { ScreenState } from '@/src/components/ScreenState'
import { useCatalog } from '@/src/context/CatalogContext'
import { colors, radius, shadow } from '@/src/theme'
import type { DivisionId } from '@/src/types'

const SHELF_SIZE = 12

/** Marketplace landing (mobile version of /shop): every browse action opens the products page. */
export default function HomeScreen() {
    const router = useRouter()
    const { products, ready, loading, refreshing, error, refresh } = useCatalog()

    const shelves = useMemo(() => {
        const ofDivision = (divisionId: DivisionId) =>
            products.filter((p) => p.divisionId === divisionId).slice(0, SHELF_SIZE)
        const deals = products
            .filter((p) => discountPercent(p))
            .sort((a, b) => (discountPercent(b) ?? 0) - (discountPercent(a) ?? 0))
            .slice(0, SHELF_SIZE)
        return {
            deals,
            appliances: ofDivision('DIV_APPLIANCES'),
            wellness: ofDivision('DIV_RETAIL'),
            energy: ofDivision('DIV_LPG'),
        }
    }, [products])

    const categories = useMemo(() => marketplaceCategories(products), [products])
    const storeCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const p of products) counts.set(p.divisionId, (counts.get(p.divisionId) ?? 0) + 1)
        return counts
    }, [products])

    const browse = (query: BrowseQuery = {}) => router.push(productsRoute(query))
    const shopStore = (divisionId: DivisionId) => browse({ store: divisionId })
    const shopCategory = (category: MarketplaceCategory) =>
        browse({ store: category.divisionId ?? undefined, category: category.name })

    return (
        <View style={styles.screen}>
            <MarketplaceHeader />
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
                }
            >
                <View style={styles.hero}>
                    <View style={styles.heroGlow} />
                    <Ionicons name="bag-handle-outline" size={180} color="#d1fae5" style={styles.heroIcon} />
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>Three official stores · One cart</Text>
                    </View>
                    <Text style={styles.heroTitle}>
                        One Platform, <Text style={styles.heroAccent}>Everything You Need</Text>
                    </Text>
                    <Text style={styles.heroBody}>
                        Vitamins, bags, LPG refills and home appliances from AWIC, LPG and MCONPINCO. Pay cash on
                        delivery.
                    </Text>
                    <PrimaryButton title="Shop Now" onPress={() => browse()} style={styles.heroButton} />
                </View>

                {loading && !ready ? (
                    <View style={styles.state}>
                        <ScreenState kind="loading" message="Loading products…" />
                    </View>
                ) : error && products.length === 0 ? (
                    <View style={styles.state}>
                        <ScreenState kind="error" message={error} onRetry={refresh} />
                    </View>
                ) : products.length === 0 ? (
                    <View style={styles.state}>
                        <ScreenState
                            kind="empty"
                            icon="storefront-outline"
                            title="No products yet"
                            message="The official stores haven’t listed products. Pull to refresh."
                        />
                    </View>
                ) : (
                    <>
                        <StorePromoCarousel products={products} onShop={shopStore} />

                        <Section title="Explore Official Brand Stores" subtitle="Shop directly from AGC's verified divisions.">
                            <OfficialStores counts={storeCounts} onSelect={shopStore} />
                        </Section>

                        <Section title="Explore Popular Categories" subtitle="Find what you need across every store.">
                            <CategoryGrid categories={categories} onSelect={shopCategory} />
                        </Section>

                        <ProductRow
                            title="Today's Best Deals"
                            products={shelves.deals}
                            onViewAll={() => browse({ sort: 'discount' })}
                        />
                        <ProductRow
                            title="Bestsellers In Home Appliances"
                            products={shelves.appliances}
                            onViewAll={() => shopStore('DIV_APPLIANCES')}
                        />
                        <ProductRow
                            title="Health & Wellness"
                            products={shelves.wellness}
                            onViewAll={() => shopStore('DIV_RETAIL')}
                        />
                        <ProductRow
                            title="Energy & Gas Essentials"
                            products={shelves.energy}
                            onViewAll={() => shopStore('DIV_LPG')}
                        />

                        <View style={styles.cta}>
                            <Text style={styles.ctaTitle}>Looking for something else?</Text>
                            <Text style={styles.ctaBody}>
                                Browse all {products.length} products from every official store.
                            </Text>
                            <PrimaryButton title="View all products" onPress={() => browse()} />
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.sectionSubtitle}>{subtitle}</Text>
            </View>
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 16, paddingBottom: 32, gap: 28 },
    hero: {
        ...shadow,
        marginHorizontal: 16,
        padding: 22,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.brandBorder,
        backgroundColor: '#f0fdf4',
        overflow: 'hidden',
        gap: 10,
    },
    heroGlow: {
        position: 'absolute',
        top: -60,
        right: -60,
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(253,230,138,0.45)',
    },
    heroIcon: { position: 'absolute', right: -36, bottom: -40 },
    pill: {
        alignSelf: 'flex-start',
        backgroundColor: '#d1fae5',
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.brandText },
    heroTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.text, letterSpacing: -0.6 },
    heroAccent: { color: colors.brand },
    heroBody: { fontSize: 14, lineHeight: 21, color: colors.textMuted, maxWidth: 420 },
    heroButton: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 22 },
    state: { minHeight: 260 },
    section: { gap: 14 },
    sectionHeader: { paddingHorizontal: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    sectionSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    cta: {
        marginHorizontal: 16,
        alignItems: 'center',
        gap: 10,
        padding: 24,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.brandBorder,
        backgroundColor: '#f0fdf4',
    },
    ctaTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
    ctaBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
})
