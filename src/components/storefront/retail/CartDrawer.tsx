'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/storefront/retail/StorefrontConfirmDialog'
import { HiOutlineTrash } from 'react-icons/hi'
import classNames from '@/utils/classNames'
import { useRetailCartStore } from '@/modules/storefront/retail/store/retailCartStore'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)

export default function CartDrawer() {
    const router = useRouter()
    const {
        items,
        isDrawerOpen,
        closeDrawer,
        updateQuantity,
        removeItem,
        subtotal,
    } = useRetailCartStore()
    const { client, openLogin } = useRetailClientStore()
    const total = subtotal()

    const [removeSku, setRemoveSku] = useState<string | null>(null)
    const [confirmCheckout, setConfirmCheckout] = useState(false)

    const removeTarget = items.find((item) => item.product.sku === removeSku)

    const handleCheckout = () => {
        if (items.length === 0) return
        setConfirmCheckout(true)
    }

    return (
        <>
            <Drawer
                isOpen={isDrawerOpen}
                onClose={closeDrawer}
                placement="right"
                width={400}
                title={
                    <span className="font-storefront-body text-base font-semibold text-brand-ink">
                        Your bag
                    </span>
                }
                bodyClass="p-0"
                footer={
                    <div className="space-y-4 border-t border-brand-line pt-1">
                        {client ? (
                            <div className="space-y-1">
                                <p className="font-storefront-body text-xs uppercase tracking-wide text-brand-ink/45">
                                    Deliver to
                                </p>
                                <p className="font-storefront-body text-sm text-brand-ink">
                                    {client.fullName}
                                </p>
                                <p className="font-storefront-body text-xs text-brand-ink/55">
                                    {client.addressLine1}, {client.city}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        closeDrawer()
                                        openLogin()
                                    }}
                                    className="font-storefront-body text-xs font-semibold text-brand-gold underline underline-offset-4"
                                >
                                    Change location
                                </button>
                            </div>
                        ) : null}
                        <div className="flex items-baseline justify-between">
                            <span className="font-storefront-body text-sm text-brand-ink/45">
                                Subtotal
                            </span>
                            <span className="font-storefront-body text-lg font-semibold text-brand-gold">
                                {formatPrice(total)}
                            </span>
                        </div>
                        <Button
                            block
                            disabled={items.length === 0}
                            variant="solid"
                            customColorClass={() =>
                                classNames(
                                    'h-12 rounded-none border-0 bg-brand-ink font-storefront-body text-sm font-semibold uppercase tracking-[0.1em] text-brand-gold-soft hover:bg-brand-deep',
                                    items.length === 0 &&
                                        'cursor-not-allowed opacity-40',
                                )
                            }
                            onClick={handleCheckout}
                        >
                            Check out
                        </Button>
                    </div>
                }
            >
                {items.length === 0 ? (
                    <div className="flex flex-col items-start gap-4 px-8 py-16">
                        <p className="font-storefront-body text-sm text-brand-ink">
                            Your cart is empty
                        </p>
                        <button
                            type="button"
                            onClick={closeDrawer}
                            className="font-storefront-body text-sm font-semibold text-brand-gold underline underline-offset-4"
                        >
                            Start shopping
                        </button>
                    </div>
                ) : (
                    <ul className="divide-y divide-brand-line">
                        {items.map((item) => (
                            <li
                                key={item.product.sku}
                                className="flex gap-3 px-6 py-5"
                            >
                                <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-brand-sage">
                                    <Image
                                        src={item.product.imageUrl}
                                        alt={item.product.name}
                                        fill
                                        unoptimized={item.product.imageUrl.endsWith(
                                            '.svg',
                                        )}
                                        className="object-cover"
                                        sizes="64px"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-storefront-body text-[13px] font-medium uppercase tracking-[0.04em] text-brand-ink">
                                        {item.product.name}
                                    </p>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="number"
                                            min={1}
                                            value={item.quantity}
                                            aria-label={`Quantity for ${item.product.name}`}
                                            onChange={(event) =>
                                                updateQuantity(
                                                    item.product.sku,
                                                    Number(event.target.value) ||
                                                        1,
                                                )
                                            }
                                            className="h-8 w-14 border border-brand-line bg-transparent px-2 text-sm text-brand-ink"
                                        />
                                        <span className="text-base font-semibold text-brand-gold">
                                            {formatPrice(item.itemTotal)}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="self-start p-1 text-brand-ink/30 hover:text-brand-ink"
                                    aria-label={`Remove ${item.product.name}`}
                                    onClick={() =>
                                        setRemoveSku(item.product.sku)
                                    }
                                >
                                    <HiOutlineTrash className="text-lg" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </Drawer>

            <ConfirmDialog
                isOpen={Boolean(removeSku)}
                tone="danger"
                title="Remove item?"
                confirmText="Remove"
                cancelText="Keep"
                onCancel={() => setRemoveSku(null)}
                onConfirm={() => {
                    if (removeSku) removeItem(removeSku)
                    setRemoveSku(null)
                }}
            >
                <p>
                    Remove{' '}
                    <span className="font-semibold text-brand-ink">
                        {removeTarget?.product.name ?? 'this item'}
                    </span>{' '}
                    from your bag?
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmCheckout}
                tone="caution"
                title="Go to checkout?"
                confirmText="Continue"
                cancelText="Cancel"
                onCancel={() => setConfirmCheckout(false)}
                onConfirm={() => {
                    setConfirmCheckout(false)
                    closeDrawer()
                    router.push('/awic/checkout')
                }}
            >
                <p>
                    Proceed to checkout with {items.length} item
                    {items.length === 1 ? '' : 's'} ({formatPrice(total)})?
                </p>
            </ConfirmDialog>
        </>
    )
}
