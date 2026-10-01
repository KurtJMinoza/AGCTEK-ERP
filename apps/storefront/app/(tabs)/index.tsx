import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native'
import { ProductCard } from '@/src/components/ProductCard'
import { ScreenState } from '@/src/components/ScreenState'
import { useProducts } from '@/src/hooks/useProducts'
import { colors } from '@/src/theme'

const SEARCH_DEBOUNCE_MS = 300

export default function ShopScreen() {
    const router = useRouter()
    const [input, setInput] = useState('')
    const [search, setSearch] = useState('')
    const { data, loading, refreshing, error, refresh } = useProducts({ search })

    useEffect(() => {
        const handle = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(handle)
    }, [input])

    return (
        <View style={styles.container}>
            <View style={styles.searchBar}>
                <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder="Search products"
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                    returnKeyType="search"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                />
            </View>

            {loading && !data ? (
                <ScreenState kind="loading" />
            ) : error && !data ? (
                <ScreenState kind="error" message={error} onRetry={refresh} />
            ) : (
                <FlatList
                    data={data ?? []}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={refresh}
                            tintColor={colors.brand}
                        />
                    }
                    ListEmptyComponent={
                        <ScreenState
                            kind="empty"
                            title="No products found"
                            message={search ? `Nothing matches “${search}”.` : undefined}
                        />
                    }
                    renderItem={({ item }) => (
                        <View style={styles.cell}>
                            <ProductCard
                                product={item}
                                onPress={() =>
                                    router.push({
                                        pathname: '/product/[id]',
                                        params: { id: item.id },
                                    })
                                }
                            />
                        </View>
                    )}
                />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    searchBar: {
        padding: 12,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    searchInput: {
        height: 44,
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 15,
        color: colors.text,
    },
    list: { padding: 12, gap: 12, flexGrow: 1 },
    row: { gap: 12 },
    cell: { flex: 1, maxWidth: '50%' },
})
