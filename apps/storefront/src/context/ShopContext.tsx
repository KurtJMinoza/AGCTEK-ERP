import { useRouter } from 'expo-router'
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { StyleSheet, Text } from 'react-native'
import { productKey } from '../catalog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SellerTag } from '../components/SellerTag'
import { colors } from '../theme'
import type { Product } from '../types'
import { formatMoney } from '../utils/format'
import { useAuth } from './AuthContext'
import { MAX_LINE_QUANTITY, useCart } from './CartContext'
import { useToast } from './ToastContext'

type PendingAdd = { product: Product; quantity: number; buyNow: boolean }

type ShopContextValue = {
    /** Every add-to-cart: sign in first, then confirm before the cart changes. */
    requestAdd: (product: Product, quantity?: number, buyNow?: boolean) => void
    /** "+" on a product already in the cart. */
    increase: (product: Product) => void
    /** "−"; asks before removing the last unit. */
    decrease: (product: Product) => void
    requestRemove: (product: Product) => void
    openProduct: (product: Product) => void
    /** Called by the sign-in screen when it closes (drops an add that was waiting on sign-in). */
    signInClosed: () => void
}

const ShopContext = createContext<ShopContextValue | null>(null)

/** Marketplace actions shared by every screen (mirrors the web MarketplaceProvider). */
export function ShopProvider({ children }: { children: ReactNode }) {
    const router = useRouter()
    const { customer } = useAuth()
    const { quantityByKey, addItem, updateQuantity, removeItem } = useCart()
    const { notify } = useToast()

    const [pending, setPending] = useState<PendingAdd | null>(null)
    const [confirming, setConfirming] = useState(false)
    const [removal, setRemoval] = useState<Product | null>(null)
    const awaitingSignIn = useRef(false)
    const signedIn = useRef(false)
    signedIn.current = customer !== null

    useEffect(() => {
        if (customer && awaitingSignIn.current) {
            awaitingSignIn.current = false
            setConfirming(true)
        }
    }, [customer])

    const requestAdd = useCallback(
        (product: Product, quantity = 1, buyNow = false) => {
            setPending({ product, quantity, buyNow })
            if (signedIn.current) {
                setConfirming(true)
                return
            }
            awaitingSignIn.current = true
            router.push('/sign-in')
        },
        [router],
    )

    const signInClosed = useCallback(() => {
        if (awaitingSignIn.current && !signedIn.current) {
            awaitingSignIn.current = false
            setPending(null)
        }
    }, [])

    const cancelAdd = () => {
        setConfirming(false)
        setPending(null)
    }

    const confirmAdd = () => {
        if (!pending || !customer) return cancelAdd()
        const { product, quantity, buyNow } = pending
        addItem(product, quantity)
        cancelAdd()
        if (buyNow) {
            router.push('/cart')
            return
        }
        notify('success', 'Added to cart', `${quantity} × ${product.name}`)
    }

    const increase = useCallback(
        (product: Product) => {
            if (!signedIn.current) return requestAdd(product)
            const key = productKey(product)
            const current = quantityByKey.get(key) ?? 0
            if (current >= MAX_LINE_QUANTITY) {
                notify('danger', 'Limit reached', `You can order up to ${MAX_LINE_QUANTITY} per item.`)
                return
            }
            updateQuantity(key, current + 1)
        },
        [quantityByKey, updateQuantity, requestAdd, notify],
    )

    const decrease = useCallback(
        (product: Product) => {
            const key = productKey(product)
            const current = quantityByKey.get(key) ?? 0
            if (current <= 1) setRemoval(product)
            else updateQuantity(key, current - 1)
        },
        [quantityByKey, updateQuantity],
    )

    const openProduct = useCallback(
        (product: Product) => router.push({ pathname: '/product/[id]', params: { id: product.id } }),
        [router],
    )

    const value = useMemo<ShopContextValue>(
        () => ({
            requestAdd,
            increase,
            decrease,
            requestRemove: setRemoval,
            openProduct,
            signInClosed,
        }),
        [requestAdd, increase, decrease, openProduct, signInClosed],
    )

    return (
        <ShopContext.Provider value={value}>
            {children}

            <ConfirmDialog
                visible={confirming && pending !== null}
                title={pending?.buyNow ? 'Buy this now?' : 'Add to cart?'}
                confirmText={pending?.buyNow ? 'Add & view cart' : 'Add to cart'}
                onConfirm={confirmAdd}
                onCancel={cancelAdd}
            >
                {pending ? (
                    <>
                        <SellerTag divisionId={pending.product.divisionId} />
                        <Text style={styles.name}>{pending.product.name}</Text>
                        <Text style={styles.text}>
                            {pending.quantity} × {formatMoney(pending.product.price)} ={' '}
                            <Text style={styles.strong}>
                                {formatMoney(pending.product.price * pending.quantity)}
                            </Text>
                        </Text>
                        <Text style={styles.note}>
                            Final price, promos and delivery are confirmed at checkout.
                        </Text>
                    </>
                ) : null}
            </ConfirmDialog>

            <ConfirmDialog
                visible={removal !== null}
                tone="danger"
                title="Remove item?"
                confirmText="Remove"
                cancelText="Keep"
                onConfirm={() => {
                    if (removal) removeItem(productKey(removal))
                    setRemoval(null)
                }}
                onCancel={() => setRemoval(null)}
            >
                <Text style={styles.text}>Remove {removal?.name} from your cart?</Text>
            </ConfirmDialog>
        </ShopContext.Provider>
    )
}

export function useShop(): ShopContextValue {
    const ctx = useContext(ShopContext)
    if (!ctx) throw new Error('useShop must be used within ShopProvider')
    return ctx
}

const styles = StyleSheet.create({
    name: { fontSize: 15, fontWeight: '600', color: colors.text },
    text: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    strong: { fontWeight: '700', color: colors.text },
    note: { fontSize: 12, color: colors.textMuted },
})
