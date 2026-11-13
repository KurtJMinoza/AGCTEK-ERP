'use client'

import {
    HiOutlinePencil,
    HiOutlineUser,
    HiOutlineUserAdd,
    HiOutlineX,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import NumericInput from '@/components/shared/NumericInput'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import type { POSCartCustomer } from '../store/usePOSCartStore'

export type POSCustomerOption = {
    value: string
    label: string
    accountType: string
}

type POSCheckoutPanelProps = {
    itemCount: number
    lineCount: number
    subtotal: number
    /** Transaction-level discount of the running sale. */
    discountAmount: number
    onDiscountChange: (value: number) => void
    /** Amount due quoted by the server (prices, discount and MM tax). */
    amountDue: number | null
    /** Tax the server added on top of the catalogue price. */
    taxAmount: number | null
    customer: POSCartCustomer | null
    onCustomerChange: (customer: POSCartCustomer | null) => void
    customerOptions: POSCustomerOption[]
    onLoadCustomers: () => void
    /** Server-side search of the Customer Master while the cashier types. */
    onSearchCustomers: (term: string) => void
    /** Opens the full customer form (a new customer with details). */
    onOpenCustomerDialog: () => void
    addingCustomer?: boolean
    /** The terminal can take money without an opened shift. */
    canPay: boolean
    onPay: () => void
    onHold: () => void
    onResume: () => void
    onVoid: () => void
    formatPrice: (value: number) => string
}

/**
 * Order summary of the running sale: subtotal, transaction discount, tax note
 * and the customer. The totals are a preview — the server owns the tax, the
 * total and the change of the receipt.
 */
const POSCheckoutPanel = ({
    itemCount,
    lineCount,
    subtotal,
    discountAmount,
    onDiscountChange,
    amountDue,
    taxAmount,
    customer,
    onCustomerChange,
    customerOptions,
    onLoadCustomers,
    onSearchCustomers,
    onOpenCustomerDialog,
    addingCustomer = false,
    canPay,
    onPay,
    onHold,
    onResume,
    onVoid,
    formatPrice,
}: POSCheckoutPanelProps) => {
    const total = amountDue ?? Number((subtotal - discountAmount).toFixed(2))
    return (
        <AdaptiveCard className="border border-gray-200 shadow-sm dark:border-gray-700 xl:sticky xl:top-4">
            <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-lg font-bold heading-text">
                        Order summary
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {lineCount} line{lineCount === 1 ? '' : 's'} ·{' '}
                        {itemCount} item{itemCount === 1 ? '' : 's'}
                    </p>
                </div>
                <Tag className="shrink-0 font-semibold tabular-nums">
                    {itemCount}
                </Tag>
            </div>

            <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span className="font-medium tabular-nums text-gray-700 dark:text-gray-200">
                            {formatPrice(subtotal)}
                        </span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm text-gray-500">
                        <span>Transaction discount</span>
                        <span className="font-medium tabular-nums text-gray-700 dark:text-gray-200">
                            −{formatPrice(discountAmount)}
                        </span>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">
                        Tax is calculated from the MM tax configuration at
                        checkout.
                    </p>
                    {taxAmount ? (
                        <div className="mt-2 flex justify-between text-sm text-gray-500">
                            <span>Tax</span>
                            <span className="font-medium tabular-nums text-gray-700 dark:text-gray-200">
                                {formatPrice(taxAmount)}
                            </span>
                        </div>
                    ) : null}
                    <div className="mt-2 flex justify-between border-t border-gray-200 pt-3 dark:border-gray-600">
                        <span className="text-base font-semibold heading-text">
                            Total
                        </span>
                        <span className="text-xl font-bold tabular-nums heading-text">
                            {formatPrice(total)}
                        </span>
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="pos-discount"
                        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                        Discount amount
                    </label>
                    <NumericInput
                        id="pos-discount"
                        placeholder="0.00"
                        thousandSeparator=","
                        decimalScale={2}
                        fixedDecimalScale
                        allowNegative={false}
                        value={discountAmount}
                        onValueChange={(v) =>
                            onDiscountChange(
                                Math.min(
                                    Math.max(v.floatValue ?? 0, 0),
                                    subtotal,
                                ),
                            )
                        }
                    />
                </div>

                <div>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Customer name
                    </span>
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <Avatar
                                size={40}
                                shape="circle"
                                className={classNames(
                                    customer
                                        ? 'bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light'
                                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700',
                                )}
                                icon={<HiOutlineUser />}
                            />
                            <div className="min-w-0 flex-1">
                                <p
                                    className={classNames(
                                        'truncate font-semibold',
                                        customer
                                            ? 'heading-text'
                                            : 'text-gray-400',
                                    )}
                                >
                                    {customer?.name ?? 'Walk-in customer'}
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    {customer
                                        ? 'Linked to this sale'
                                        : 'Add the customer details to link a name to this sale'}
                                </p>
                            </div>
                            {customer ? (
                                <Tag className="shrink-0">
                                    {customer.accountType === 'CREDIT'
                                        ? 'Credit'
                                        : 'Cash'}
                                </Tag>
                            ) : null}
                        </div>
                        {customer ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button
                                    size="sm"
                                    icon={<HiOutlinePencil />}
                                    loading={addingCustomer}
                                    onClick={onOpenCustomerDialog}
                                >
                                    Change
                                </Button>
                                <Button
                                    size="sm"
                                    icon={<HiOutlineX />}
                                    disabled={addingCustomer}
                                    onClick={() => onCustomerChange(null)}
                                >
                                    Walk-in
                                </Button>
                            </div>
                        ) : (
                            <Button
                                block
                                size="sm"
                                className="mt-3"
                                icon={<HiOutlineUserAdd />}
                                loading={addingCustomer}
                                onClick={onOpenCustomerDialog}
                            >
                                Add customer with details
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                    <Button
                        block
                        size="lg"
                        variant="solid"
                        className="h-12"
                        disabled={!canPay}
                        onClick={onPay}
                    >
                        Pay / Tender
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            size="sm"
                            disabled={lineCount === 0}
                            onClick={onHold}
                        >
                            Hold sale
                        </Button>
                        <Button size="sm" onClick={onResume}>
                            Resume sale
                        </Button>
                    </div>
                    <Button
                        block
                        size="lg"
                        variant="solid"
                        className={classNames(
                            'h-12',
                            'bg-red-500 hover:bg-red-600 text-white border-red-500',
                        )}
                        disabled={lineCount === 0}
                        onClick={onVoid}
                    >
                        Void cart
                    </Button>
                </div>
            </div>
        </AdaptiveCard>
    )
}

export default POSCheckoutPanel
