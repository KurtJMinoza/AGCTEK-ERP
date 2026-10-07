import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import {
    OFFICIAL_STORES,
    SORT_OPTIONS,
    isDivisionId,
    marketplaceCategories,
    matchesSearch,
    sortProducts,
    storeName,
    type SortKey,
} from '@/src/catalog'
import { Chip } from '@/src/components/Chip'
import { MarketplaceHeader } from '@/src/components/MarketplaceHeader'
import { ProductCard } from '@/src/components/ProductCard'
import { ScreenState } from '@/src/components/ScreenState'
import { useCatalog } from '@/src/context/CatalogContext'
import { colors, divisionTheme, radius } from '@/src/theme'

const PAGE_SIZE = 24

type Params = { store?: string; category?: string; sort?: string; q?: string }

const isSortKey = (value: string | undefined): value is SortKey =>
    SORT_OPTIONS.some((o) => o.value === value)

/** Full products page (mobile /shop/products): store, category, sort and search live in the route params. */
export default function ProductsScreen() {
    const router = useRouter()
    const params = useLocalSearchParams<Params>()
    const { products, ready, loading, refreshing, error, refresh } = useCatalog()

    const store = params.store && isDivisionId(params.store) ? params.store : null
    const category = params.category || null
    const sort: SortKey = isSortKey(params.sort) ? params.sort : 'recommended'
    const q = params.q?.trim() ?? ''

    const [limit, setLimit] = useState(PAGE_SIZE)
    const [sortOpen, setSortOpen] = useState(false)
    const listRef = useRef<FlatList>(null)

    const update = (next: Partial<Params>) => {
        router.setParams({ ...params, ...next } as Params)
    }

    useEffect(() => {
        setLimit(PAGE_SIZE)
        listRef.current?.scrollToOffset({ offset: 0, animated: false })
    }, [store, category, sort, q])

    const categories = useMemo(
        () => marketplaceCategories(store ? products.filter((p) => p.divisionId === store) : products),
        [products, store],
    )

    const results = useMemo(
        () =>
            sortProducts(
                products.filter(
                    (p) =>
                        (!store || p.divisionId === store) &&
                        (!category || p.category === category) &&
                        matchesSearch(p, q),
                ),
                sort,
            ),
        [products, store, category, q, sort],
    )

    const title = q
        ? `Results for “${q}”`
        : category ?? (store ? `${storeName(store)} Official Store` : 'All products')
    const activeFilters = Boolean(store || category || q || sort !== 'recommended')

    const header = (
        <View style={styles.filters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Chip label="All stores" selected={!store} onPress={() => update({ store: '', category: '' })} />
                {OFFICIAL_STORES.map((s) => (
                    <Chip
                        key={s.divisionId}
                        label={s.name}
                        icon={s.icon}
                        selected={store === s.divisionId}
                        onPress={() =>
                            update({ store: store === s.divisionId ? '' : s.divisionId, category: '' })
                        }
                    />
                ))}
            </ScrollView>
            {categories.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {categories.map((c) => (
                        <Chip
                            key={c.name}
                            label={`${c.name} (${c.count})`}
                            selected={category === c.name}
                            onPress={() => update({ category: category === c.name ? '' : c.name })}
                        />
                    ))}
                </ScrollView>
            ) : null}

            {store ? (
                <View style={[styles.banner, { backgroundColor: divisionTheme(store).soft }]}>
                    <Ionicons
                        name={OFFICIAL_STORES.find((s) => s.divisionId === store)?.icon ?? 'storefront-outline'}
                        size={18}
                        color={divisionTheme(store).text}
                    />
                    <Text style={[styles.bannerText, { color: divisionTheme(store).text }]}>
                        {storeName(store)} Official Store ·{' '}
                        {OFFICIAL_STORES.find((s) => s.divisionId === store)?.tagline}
                    </Text>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                </View>
            ) : null}

            <View style={styles.titleRow}>
                <View style={styles.titleText}>
                    <Text style={styles.title} numberOfLines={2}>
                        {title}
                    </Text>
                    <Text style={styles.count}>
                        {results.length} product{results.length === 1 ? '' : 's'}
                    </Text>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Sort: ${SORT_OPTIONS.find((o) => o.value === sort)?.label}`}
                    onPress={() => setSortOpen(true)}
                    style={styles.sortButton}
                >
                    <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} />
                    <Text style={styles.sortText}>{SORT_OPTIONS.find((o) => o.value === sort)?.label}</Text>
                </Pressable>
            </View>

            {activeFilters ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={() => update({ store: '', category: '', sort: '', q: '' })}
                    style={styles.clear}
                >
                    <Text style={styles.clearText}>Clear all filters</Text>
                </Pressable>
            ) : null}
        </View>
    )

    return (
        <View style={styles.screen}>
            <MarketplaceHeader showBack initialQuery={q} onSearch={(next) => update({ q: next })} />

            {loading && !ready ? (
                <ScreenState kind="loading" message="Loading products…" />
            ) : error && products.length === 0 ? (
                <ScreenState kind="error" message={error} onRetry={refresh} />
            ) : (
                <FlatList
                    ref={listRef}
                    data={results.slice(0, limit)}
                    keyExtractor={(p) => p.id}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.list}
                    ListHeaderComponent={header}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
                    }
                    onEndReachedThreshold={0.6}
                    onEndReached={() => {
                        if (limit < results.length) setLimit((l) => l + PAGE_SIZE)
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <ScreenState
                                kind="empty"
                                icon="search-outline"
                                title="No products found"
                                message={q ? `Nothing matches “${q}”. Try another word or store.` : 'Try another store or category.'}
                                action={{
                                    title: 'Clear filters',
                                    onPress: () => update({ store: '', category: '', sort: '', q: '' }),
                                }}
                            />
                        </View>
                    }
                    ListFooterComponent={
                        results.length > limit ? (
                            <Text style={styles.footer}>
                                Showing {limit} of {results.length}
                            </Text>
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <View style={styles.cell}>
                            <ProductCard product={item} style={styles.card} />
                        </View>
                    )}
                />
            )}

            <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setSortOpen(false)}>
                    <Pressable style={styles.sheet} onPress={() => undefined}>
                        <Text style={styles.sheetTitle}>Sort by</Text>
                        {SORT_OPTIONS.map((option) => {
                            const selected = option.value === sort
                            return (
                                <Pressable
                                    key={option.value}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: selected }}
                                    onPress={() => {
                                        setSortOpen(false)
                                        update({ sort: option.value === 'recommended' ? '' : option.value })
                                    }}
                                    style={styles.option}
                                >
                                    <Text style={[styles.optionText, selected && styles.optionSelected]}>
                                        {option.label}
                                    </Text>
                                    {selected ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
                                </Pressable>
                            )
                        })}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    list: { paddingBottom: 32, flexGrow: 1 },
    filters: { paddingTop: 12, paddingBottom: 12, gap: 10 },
    chips: { paddingHorizontal: 16, gap: 8 },
    banner: {
        marginHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginTop: 4 },
    titleText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    count: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    sortText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    clear: { alignSelf: 'flex-start', paddingHorizontal: 16 },
    clearText: { fontSize: 13, fontWeight: '600', color: colors.brandText },
    row: { gap: 12, paddingHorizontal: 16 },
    cell: { flex: 1, maxWidth: '50%', paddingBottom: 12 },
    card: { flex: 1 },
    empty: { minHeight: 320 },
    footer: { textAlign: 'center', fontSize: 12, color: colors.textFaint, paddingVertical: 12 },
    backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 34,
        gap: 4,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    optionText: { fontSize: 15, color: colors.textSecondary },
    optionSelected: { fontWeight: '700', color: colors.brandText },
})
