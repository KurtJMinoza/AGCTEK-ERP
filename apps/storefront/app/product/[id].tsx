import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card } from '@/src/components/Card'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ProductImage } from '@/src/components/ProductImage'
import { QuantityStepper } from '@/src/components/QuantityStepper'
import { ScreenState } from '@/src/components/ScreenState'
import { MAX_LINE_QUANTITY, useCart } from '@/src/context/CartContext'
import { useProduct } from '@/src/hooks/useProducts'
import { colors } from '@/src/theme'
import { formatMoney } from '@/src/utils/format'

export default function ProductDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const { data: product, loading, error, refresh } = useProduct(id)
    const { addItem, getQuantity } = useCart()
    const [quantity, setQuantity] = useState(1)
    const [justAdded, setJustAdded] = useState(false)

    if (loading && !product) return <ScreenState kind="loading" />
    if (error) return <ScreenState kind="error" message={error} onRetry={refresh} />
    if (!product) return <ScreenState kind="empty" title="Product not found" />

    const inCart = getQuantity(product.id)
    const maxAddable = Math.max(1, MAX_LINE_QUANTITY - inCart)

    const handleAdd = () => {
        addItem(product, quantity)
        setQuantity(1)
        setJustAdded(true)
    }

    return (
        <>
            <Stack.Screen options={{ title: product.name }} />
            <ScrollView contentContainerStyle={styles.content}>
                <ProductImage product={product} style={styles.image} />
                <Card>
                    <Text style={styles.category}>{product.category}</Text>
                    <Text style={styles.name}>{product.name}</Text>
                    <Text style={styles.sku}>SKU {product.sku}</Text>
                    <Text style={styles.price}>
                        {formatMoney(product.unitPrice, product.currency)}
                        <Text style={styles.uom}> / {product.uom}</Text>
                    </Text>
                    <Text
                        style={[
                            styles.availability,
                            { color: product.available ? colors.success : colors.danger },
                        ]}
                    >
                        {product.available ? 'Available' : 'Currently unavailable'}
                    </Text>
                </Card>
                <Card title="Description">
                    <Text style={styles.description}>{product.description}</Text>
                </Card>

                {product.available ? (
                    <Card title="Quantity">
                        <View style={styles.qtyRow}>
                            <QuantityStepper
                                value={Math.min(quantity, maxAddable)}
                                onChange={(next) => {
                                    setQuantity(next)
                                    setJustAdded(false)
                                }}
                                max={maxAddable}
                            />
                            {inCart > 0 ? (
                                <Text style={styles.inCart}>{inCart} in cart</Text>
                            ) : null}
                        </View>
                    </Card>
                ) : null}

                <PrimaryButton
                    title={product.available ? 'Add to cart' : 'Unavailable'}
                    disabled={!product.available || inCart >= MAX_LINE_QUANTITY}
                    onPress={handleAdd}
                />
                {justAdded ? (
                    <PrimaryButton
                        title="Added — view cart"
                        variant="secondary"
                        onPress={() => router.push('/cart')}
                    />
                ) : null}
            </ScrollView>
        </>
    )
}

const styles = StyleSheet.create({
    content: { padding: 16, gap: 16 },
    image: { borderRadius: 14 },
    category: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
    name: { fontSize: 20, fontWeight: '700', color: colors.text },
    sku: { fontSize: 13, color: colors.textMuted },
    price: { marginTop: 6, fontSize: 22, fontWeight: '800', color: colors.brand },
    uom: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
    availability: { fontSize: 13, fontWeight: '600' },
    description: { fontSize: 14, lineHeight: 20, color: colors.text },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    inCart: { fontSize: 13, color: colors.textMuted },
})
