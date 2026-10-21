'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { CHECKOUT_PATH, MARKETPLACE_PATH } from '../host'
import { useMarketplace } from '../MarketplaceProvider'
import {
    marketplaceCartItemKey,
    useMarketplaceCartStore,
} from '../store/useMarketplaceCartStore'
import MarketplaceHeader from '../components/MarketplaceHeader'
import MarketplaceCartDrawer from '../components/MarketplaceCartDrawer'
import { LPG_DIVISION_ID, isLpgAddon } from '@/modules/sd/catalogs/lpgCatalog'
import {
    calculateCartPricing,
    type CartPricing,
    type PricingItem,
} from '@/modules/sd/services/ecommerceService'
import type { SalesDivisionId } from '@/modules/sd/services/pricingEngine'
import { notify } from '../MarketplaceProvider'

const MarketplaceCartPageContent = () => {
    const router = useRouter()
    const {
        signedInClient,
    } = useMarketplace()

    const items = useMarketplaceCartStore((s) => s.items)
    const selectedKeys = useMarketplaceCartStore((s) => s.selectedKeys)
    const updateQuantity = useMarketplaceCartStore((s) => s.updateQuantity)
    const removeItem = useMarketplaceCartStore((s) => s.removeItem)
    const clearCart = useMarketplaceCartStore((s) => s.clearCart)
    const toggleSelect = useMarketplaceCartStore((s) => s.toggleSelect)
    const setSelectAll = useMarketplaceCartStore((s) => s.setSelectAll)
    const removeItems = useMarketplaceCartStore((s) => s.removeItems)

    const [pendingRemoval, setPendingRemoval] = useState<{
        key: string
        name: string
    } | null>(null)
    const [confirmClearOpen, setConfirmClearOpen] = useState(false)

    // Selective pricing for checked items
    const pricingItems = useMemo<PricingItem[]>(() => {
        return items
            .filter((item) =>
                selectedKeys.includes(marketplaceCartItemKey(item)),
            )
            .map((item) => ({
                divisionId: item.product.divisionId as SalesDivisionId,
                sku: item.product.sku,
                quantity: item.quantity,
                // The selected variant is the stock item — it must travel with
                // the line so the order reserves the right material.
                variantId: item.variant?.variantId,
                variantName: item.variant?.variantName,
                unitPrice: item.variant?.unitPrice,
            }))
    }, [items, selectedKeys])

    const pricing = useMemo<CartPricing | null>(() => {
        if (pricingItems.length === 0) return null
        try {
            return calculateCartPricing(pricingItems)
        } catch {
            return null
        }
    }, [pricingItems])

    const decreaseItem = (key: string, name: string, quantity: number) => {
        if (quantity <= 1) {
            setPendingRemoval({ key, name })
            return
        }
        updateQuantity(key, quantity - 1)
    }

    const handleCheckout = () => {
        const selected = items.filter((item) =>
            selectedKeys.includes(marketplaceCartItemKey(item)),
        )
        if (selected.length === 0) return

        const lpgItems = selected.filter(
            (item) => item.product.divisionId === LPG_DIVISION_ID,
        )
        if (
            lpgItems.length > 0 &&
            lpgItems.every((item) => isLpgAddon(item.product))
        ) {
            notify(
                'danger',
                'Add an LPG refill or set',
                'LPG add-ons cannot be ordered alone. Add at least one LPG refill or set.',
            )
            return
        }

        router.push(CHECKOUT_PATH)
    }

    return (
        <div className="min-h-screen bg-gray-50/50 pb-16">
            <MarketplaceHeader />

            {/* Breadcrumb navigation */}
            <div className="border-b border-gray-100 bg-white">
                <div className="container mx-auto max-w-6xl px-4 py-3 text-xs text-gray-500">
                    <nav className="flex items-center gap-2">
                        <Link
                            href={MARKETPLACE_PATH}
                            className="text-gray-500 hover:text-shop-700 hover:underline"
                        >
                            Home
                        </Link>
                        <span>/</span>
                        <span className="font-semibold text-gray-900">
                            Shopping Cart
                        </span>
                    </nav>
                </div>
            </div>

            {/* Standalone Full-Page Cart */}
            <main>
                <MarketplaceCartDrawer
                    items={items}
                    pricing={pricing}
                    signedIn={Boolean(signedInClient)}
                    selectedKeys={selectedKeys}
                    onIncrease={updateQuantity}
                    onDecrease={decreaseItem}
                    onRemove={(key, name) => setPendingRemoval({ key, name })}
                    onToggleSelect={toggleSelect}
                    onSelectAll={setSelectAll}
                    onRemoveSelected={() => removeItems(selectedKeys)}
                    onCheckout={handleCheckout}
                    onClear={() => setConfirmClearOpen(true)}
                />
            </main>

            {/* Confirm Single Item Removal Dialog */}
            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                type="danger"
                title="Remove item?"
                confirmButtonProps={{
                    variant: 'solid',
                    className: 'bg-red-600 hover:bg-red-700',
                }}
                confirmText="Remove"
                cancelText="Keep"
                onClose={() => setPendingRemoval(null)}
                onCancel={() => setPendingRemoval(null)}
                onConfirm={() => {
                    if (pendingRemoval) {
                        removeItem(pendingRemoval.key)
                        setPendingRemoval(null)
                    }
                }}
            >
                <p className="text-sm text-gray-600">
                    Remove{' '}
                    <span className="font-semibold text-gray-900">
                        {pendingRemoval?.name}
                    </span>{' '}
                    from your cart?
                </p>
            </ConfirmDialog>

            {/* Confirm Clear Cart Dialog */}
            <ConfirmDialog
                isOpen={confirmClearOpen}
                type="danger"
                title="Clear entire cart?"
                confirmButtonProps={{
                    variant: 'solid',
                    className: 'bg-red-600 hover:bg-red-700',
                }}
                confirmText="Clear cart"
                cancelText="Cancel"
                onClose={() => setConfirmClearOpen(false)}
                onCancel={() => setConfirmClearOpen(false)}
                onConfirm={() => {
                    clearCart()
                    setConfirmClearOpen(false)
                }}
            >
                <p className="text-sm text-gray-600">
                    This will remove all items from your shopping cart. This action cannot be undone.
                </p>
            </ConfirmDialog>
        </div>
    )
}

const MarketplaceCartPage = () => (
    <Suspense
        fallback={
            <div className="flex min-h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-shop-600 border-t-transparent" />
            </div>
        }
    >
        <MarketplaceCartPageContent />
    </Suspense>
)

export default MarketplaceCartPage
