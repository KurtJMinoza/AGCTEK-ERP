import { useRouter } from 'expo-router'
import { FlatList, StyleSheet, View } from 'react-native'
import { productKey } from '@/src/catalog'
import { ProductCard } from '@/src/components/ProductCard'
import { ScreenState } from '@/src/components/ScreenState'
import { useCatalog } from '@/src/context/CatalogContext'
import { useFavorites } from '@/src/context/FavoritesContext'
import { colors } from '@/src/theme'

/** Hearted products that are still sold. */
export default function FavoritesScreen() {
    const router = useRouter()
    const { products, ready } = useCatalog()
    const { favorites } = useFavorites()
    const items = products.filter((p) => favorites.has(productKey(p)))

    if (!ready) return <ScreenState kind="loading" />

    return (
        <FlatList
            style={styles.screen}
            data={items}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
                <View style={styles.empty}>
                    <ScreenState
                        kind="empty"
                        icon="heart-outline"
                        title="No favourites yet"
                        message="Tap the heart on any product to save it here."
                        action={{ title: 'Browse products', onPress: () => router.push('/products') }}
                    />
                </View>
            }
            renderItem={({ item }) => (
                <View style={styles.cell}>
                    <ProductCard product={item} style={styles.card} />
                </View>
            )}
        />
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    list: { padding: 16, flexGrow: 1 },
    row: { gap: 12 },
    cell: { flex: 1, maxWidth: '50%', paddingBottom: 12 },
    card: { flex: 1 },
    empty: { flex: 1, minHeight: 400 },
})
