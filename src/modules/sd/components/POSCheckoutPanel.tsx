'use client'

import { useEffect, useState } from 'react'
import {
    HiOutlineSearch,
    HiOutlineUser,
    HiOutlineUserAdd,
    HiOutlineX,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import NumericInput from '@/components/shared/NumericInput'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import type { POSCartCustomer } from '../store/usePOSCartStore'

export type POSCustomerOption = {
    value: string
    label: string
    /** Company / customer name without the customer number suffix. */
    name: string
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
    customersLoading?: boolean
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
    customersLoading = false,
    canPay,
    onPay,
    onHold,
    onResume,
    onVoid,
    formatPrice,
}: POSCheckoutPanelProps) => {
    const [selectingExisting, setSelectingExisting] = useState(false)
    const [discountError, setDiscountError] = useState<string | null>(null)
    const total = amountDue ?? Number((subtotal - discountAmount).toFixed(2))

    useEffect(() => {
        if (!selectingExisting) return
        onLoadCustomers()
        // Load once when the picker opens; typing triggers onSearchCustomers.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid reload loop when options refresh
    }, [selectingExisting])

    useEffect(() => {
        if (customer) setSelectingExisting(false)
    }, [customer])

    const openExistingPicker = () => setSelectingExisting(true)

    const applyExistingCustomer = (option: POSCustomerOption | null) => {
        if (!option) return
        onCustomerChange({
            id: option.value,
            name: option.name || option.label,
            accountType: option.accountType,
        })
        setSelectingExisting(false)
    }

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
                        invalid={Boolean(discountError)}
                        value={discountAmount}
                        onValueChange={(v) => {
                            const typed = Math.max(v.floatValue ?? 0, 0)
                            setDiscountError(
                                typed > subtotal + 0.005
                                    ? `The discount cannot exceed the cart subtotal (${formatPrice(subtotal)}); it was set to the maximum.`
                                    : null,
                            )
                            onDiscountChange(Math.min(typed, subtotal))
                        }}
                    />
                    {discountError ? (
                        <p
                            role="alert"
                            className="mt-1 text-xs font-medium text-red-600 dark:text-red-400"
                        >
                            {discountError}
                        </p>
                    ) : null}
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Customer
                        </span>
                        {!customer && !selectingExisting ? (
                            <span className="text-[11px] text-gray-400">
                                Optional
                            </span>
                        ) : null}
                    </div>
                    <div
                        className={classNames(
                            'rounded-xl border px-3 py-3 dark:border-gray-700',
                            customer
                                ? 'border-primary/30 bg-primary-subtle/40 dark:bg-primary/10'
                                : 'border-gray-200 bg-white dark:bg-gray-900/20',
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <Avatar
                                size={36}
                                shape="circle"
                                className={classNames(
                                    customer
                                        ? 'bg-primary text-white'
                                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700',
                                )}
                                icon={<HiOutlineUser />}
                            />
                            <div className="min-w-0 flex-1">
                                <p
                                    className={classNames(
                                        'truncate text-sm font-semibold',
                                        customer
                                            ? 'heading-text'
                                            : 'text-gray-500',
                                    )}
                                >
                                    {customer?.name ?? 'Walk-in'}
                                </p>
                                <p className="truncate text-[11px] text-gray-500">
                                    {customer
                                        ? customer.accountType === 'CREDIT'
                                            ? 'Credit customer · linked'
                                            : 'Cash customer · linked'
                                        : selectingExisting
                                          ? 'Search Customer Master'
                                          : 'Leave as walk-in, or link a name'}
                                </p>
                            </div>
                            {customer ? (
                                <Tag className="shrink-0 bg-white/80 dark:bg-gray-800">
                                    {customer.accountType === 'CREDIT'
                                        ? 'Credit'
                                        : 'Cash'}
                                </Tag>
                            ) : null}
                        </div>

                        {selectingExisting ? (
                            <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3 dark:border-gray-700/80">
                                <Select<POSCustomerOption>
                                    options={customerOptions}
                                    isSearchable
                                    isLoading={customersLoading}
                                    placeholder="Type a name or customer no."
                                    noOptionsMessage={() =>
                                        customersLoading
                                            ? 'Loading…'
                                            : 'No matching customers'
                                    }
                                    filterOption={null}
                                    onInputChange={(value, meta) => {
                                        if (meta.action === 'input-change') {
                                            onSearchCustomers(value)
                                        }
                                        return value
                                    }}
                                    onChange={(option) =>
                                        applyExistingCustomer(option)
                                    }
                                    value={null}
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                        onClick={() =>
                                            setSelectingExisting(false)
                                        }
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                                        disabled={addingCustomer}
                                        onClick={() => {
                                            setSelectingExisting(false)
                                            onOpenCustomerDialog()
                                        }}
                                    >
                                        <HiOutlineUserAdd className="h-3.5 w-3.5" />
                                        New customer
                                    </button>
                                </div>
                            </div>
                        ) : customer ? (
                            <div className="mt-3 flex gap-2 border-t border-primary/15 pt-3">
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    icon={<HiOutlineSearch />}
                                    onClick={openExistingPicker}
                                >
                                    Change
                                </Button>
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    icon={<HiOutlineX />}
                                    disabled={addingCustomer}
                                    onClick={() => onCustomerChange(null)}
                                >
                                    Walk-in
                                </Button>
                            </div>
                        ) : (
                            <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3 dark:border-gray-700/80">
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    icon={<HiOutlineSearch />}
                                    onClick={openExistingPicker}
                                >
                                    Select existing
                                </Button>
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    icon={<HiOutlineUserAdd />}
                                    loading={addingCustomer}
                                    onClick={onOpenCustomerDialog}
                                >
                                    Add new
                                </Button>
                            </div>
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
