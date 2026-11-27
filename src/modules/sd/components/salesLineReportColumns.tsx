'use client'

import type { ColumnDef } from '@/components/shared/DataTable'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import { SdMoneyCell, formatSdMoney } from './SdDataTableCells'
import {
    formatSalesDueDate,
    salesChannelLabel,
    salesPaymentMethodLabel,
    type SalesLineReportRow,
} from '../services/salesAnalyticsService'

const formatQty = (value: number) =>
    Number.isInteger(value)
        ? value.toLocaleString('en-PH')
        : value.toLocaleString('en-PH', { maximumFractionDigits: 2 })

type ColumnOptions = {
    currency: string
    productByName: Map<string, { productName: string; sku: string | null }>
    onParticularClick?: (particular: string) => void
    variant: 'summary' | 'full'
}

/**
 * Header + cell alignment. `th` carries its own `text-left` from the table theme,
 * so the important modifier is needed for headers; cells inherit it too.
 */
const RIGHT = { className: '!text-right' } as const

const relaxed = (variant: ColumnOptions['variant']) => variant === 'full'

/** Fixed column widths (px). Tables scroll horizontally instead of squeezing columns. */
const WIDTHS = {
    customerName: { summary: 190, full: 200, min: 160 },
    salesChannel: { summary: 112, full: 120, min: 96 },
    location: { summary: 170, full: 170, min: 140 },
    barcode: { summary: 150, full: 150, min: 132 },
    accountTitle: { summary: 170, full: 170, min: 148 },
    particular: { summary: 300, full: 380, min: 260 },
    qty: { summary: 76, full: 76, min: 64 },
    uom: { summary: 80, full: 88, min: 68 },
    cost: { summary: 120, full: 120, min: 104 },
    totalCost: { summary: 128, full: 128, min: 112 },
    srp: { summary: 116, full: 116, min: 100 },
    sales: { summary: 116, full: 116, min: 100 },
    discount: { summary: 116, full: 116, min: 100 },
    subtotal: { summary: 128, full: 128, min: 112 },
    totalSales: { summary: 132, full: 132, min: 116 },
    paidStatus: { summary: 128, full: 128, min: 112 },
    balanceDue: { summary: 150, full: 150, min: 132 },
    paymentMethod: { summary: 230, full: 240, min: 200 },
    salesType: { summary: 128, full: 132, min: 112 },
    invoiceType: { summary: 130, full: 140, min: 112 },
    invoiceNumber: { summary: 170, full: 170, min: 150 },
    batchNumber: { summary: 140, full: 140, min: 120 },
    lotNumber: { summary: 130, full: 130, min: 112 },
    productExpiry: { summary: 130, full: 130, min: 112 },
    remarks: { summary: 200, full: 220, min: 160 },
} as const

type WidthKey = keyof typeof WIDTHS

const sized = (variant: ColumnOptions['variant'], key: WidthKey) => ({
    size: WIDTHS[key][relaxed(variant) ? 'full' : 'summary'],
    minSize: WIDTHS[key].min,
})

const Dash = () => <span className="text-gray-400">—</span>

const TextCell = ({
    value,
    className,
}: {
    value?: string | null
    className?: string
}) =>
    value?.trim() ? (
        <span
            className={classNames('block truncate text-sm', className)}
            title={value}
        >
            {value}
        </span>
    ) : (
        <Dash />
    )

const MonoCell = ({ value }: { value?: string | null }) =>
    value?.trim() ? (
        <span
            className="block max-w-[10.5rem] truncate font-mono text-xs text-gray-700 dark:text-gray-300"
            title={value}
        >
            {value}
        </span>
    ) : (
        <Dash />
    )

const PAID_TONE: Record<string, StatusTone> = {
    PAID: 'success',
    'PARTIALLY PAID': 'info',
    UNPAID: 'warning',
}

const paidTone = (status: string): StatusTone =>
    PAID_TONE[status.replace(/_/g, ' ').toUpperCase()] ?? 'default'

const ProductLineCell = ({
    row,
    productByName,
    onParticularClick,
}: {
    row: SalesLineReportRow
    productByName: ColumnOptions['productByName']
    onParticularClick?: ColumnOptions['onParticularClick']
}) => {
    const linked = productByName.has(row.particular)
    const textClass =
        'min-w-0 flex-1 line-clamp-2 break-words text-left text-sm leading-snug'

    const label =
        linked && onParticularClick ? (
            <button
                type="button"
                className={`${textClass} font-medium heading-text hover:text-primary hover:underline`}
                title={row.particular}
                onClick={() => onParticularClick(row.particular)}
            >
                {row.particular}
            </button>
        ) : (
            <span className={`${textClass} heading-text`} title={row.particular}>
                {row.particular}
            </span>
        )

    return (
        <div className="flex min-w-0 max-w-[22rem] items-center gap-2.5">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                {row.productImageUrl ? (
                    <img
                        src={row.productImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-gray-500">
                        {row.particular.trim().slice(0, 2) || '—'}
                    </span>
                )}
            </div>
            {label}
        </div>
    )
}

const SALES_TYPE_CLASS = (type: string) =>
    classNames(
        'whitespace-nowrap text-[11px]',
        (type === 'CREDIT' || type === 'SALARY DEDUCTION') &&
            'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
        type === 'CHARGE' &&
            'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    )

const moneyColumn = (
    header: string,
    id: string,
    key: WidthKey,
    pick: (row: SalesLineReportRow) => number,
    options: { emphasize?: boolean; hideZero?: boolean; negative?: boolean } = {},
) =>
    (opts: ColumnOptions): ColumnDef<SalesLineReportRow> => ({
        header,
        id,
        meta: RIGHT,
        ...sized(opts.variant, key),
        cell: ({ row }) => {
            const amount = pick(row.original)
            if (options.hideZero && !(amount > 0)) return <Dash />
            return (
                <SdMoneyCell
                    amount={amount}
                    currency={opts.currency}
                    emphasize={options.emphasize}
                    negative={options.negative}
                />
            )
        },
    })

const ALL_COLUMN_BUILDERS: Array<
    (opts: ColumnOptions) => ColumnDef<SalesLineReportRow>
> = [
    (opts) => ({
        header: 'Customer name',
        id: 'customerName',
        ...sized(opts.variant, 'customerName'),
        cell: ({ row }) => (
            <TextCell
                value={row.original.customerName}
                className="max-w-[15rem] font-medium heading-text"
            />
        ),
    }),
    (opts) => ({
        header: 'Channel',
        id: 'salesChannel',
        ...sized(opts.variant, 'salesChannel'),
        cell: ({ row }) => (
            <Tag className="whitespace-nowrap text-[11px]">
                {salesChannelLabel(row.original.salesChannel)}
            </Tag>
        ),
    }),
    (opts) => ({
        header: 'Location',
        id: 'location',
        ...sized(opts.variant, 'location'),
        cell: ({ row }) => (
            <TextCell
                value={row.original.location}
                className="max-w-[11rem] text-gray-700 dark:text-gray-300"
            />
        ),
    }),
    (opts) => ({
        header: 'Barcode',
        id: 'barcode',
        ...sized(opts.variant, 'barcode'),
        cell: ({ row }) => <MonoCell value={row.original.barcode} />,
    }),
    (opts) => ({
        header: 'Account title',
        id: 'accountTitle',
        ...sized(opts.variant, 'accountTitle'),
        cell: ({ row }) => (
            <TextCell
                value={row.original.accountTitle}
                className="max-w-[11rem] uppercase"
            />
        ),
    }),
    (opts) => ({
        header: 'Particular',
        id: 'particular',
        ...sized(opts.variant, 'particular'),
        cell: ({ row }) => (
            <ProductLineCell
                row={row.original}
                productByName={opts.productByName}
                onParticularClick={opts.onParticularClick}
            />
        ),
    }),
    (opts) => ({
        header: 'Qty',
        id: 'qty',
        meta: RIGHT,
        ...sized(opts.variant, 'qty'),
        cell: ({ row }) => (
            <span className="text-sm font-medium tabular-nums">
                {formatQty(row.original.quantity)}
            </span>
        ),
    }),
    (opts) => ({
        header: 'UOM',
        id: 'uom',
        ...sized(opts.variant, 'uom'),
        cell: ({ row }) => (
            <span className="text-sm text-gray-600 dark:text-gray-300">
                {row.original.uom || '—'}
            </span>
        ),
    }),
    moneyColumn('Cost', 'cost', 'cost', (r) => r.unitCost),
    moneyColumn('Total cost', 'totalCost', 'totalCost', (r) => r.totalCost),
    moneyColumn('SRP', 'srp', 'srp', (r) => r.srp),
    moneyColumn('Sales', 'sales', 'sales', (r) => r.sales),
    moneyColumn('Discount', 'discount', 'discount', (r) => r.discount, {
        hideZero: true,
        negative: true,
    }),
    moneyColumn('Subtotal', 'subtotal', 'subtotal', (r) => r.subtotal, {
        emphasize: true,
    }),
    moneyColumn('Total sales', 'totalSales', 'totalSales', (r) => r.totalSales, {
        emphasize: true,
    }),
    (opts) => ({
        header: 'Paid status',
        id: 'paidStatus',
        ...sized(opts.variant, 'paidStatus'),
        cell: ({ row }) => {
            const status = row.original.paidStatus || 'Unpaid'
            return (
                <StatusBadge tone={paidTone(status)}>
                    {status.replace(/_/g, ' ')}
                </StatusBadge>
            )
        },
    }),
    (opts) => ({
        header: 'Balance due',
        id: 'balanceDue',
        meta: RIGHT,
        ...sized(opts.variant, 'balanceDue'),
        cell: ({ row }) =>
            row.original.balanceDue > 0.005 ? (
                <div className="leading-tight">
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
                        {formatSdMoney(row.original.balanceDue, opts.currency)}
                    </span>
                    {row.original.dueDate ? (
                        <div
                            className={classNames(
                                'whitespace-nowrap text-[11px]',
                                row.original.isOverdue
                                    ? 'font-semibold text-red-600 dark:text-red-400'
                                    : 'text-gray-500 dark:text-gray-400',
                            )}
                        >
                            {row.original.isOverdue ? 'Overdue · ' : 'Due '}
                            {formatSalesDueDate(row.original.dueDate)}
                        </div>
                    ) : null}
                </div>
            ) : (
                <Dash />
            ),
    }),
    (opts) => ({
        header: 'Payment method',
        id: 'paymentMethod',
        ...sized(opts.variant, 'paymentMethod'),
        cell: ({ row }) => {
            const { paymentMethod, payments } = row.original
            if (!paymentMethod) return <Dash />
            const isSplit = paymentMethod === 'SPLIT'
            // A charge sale lists the payments collected after the sale.
            const isCharge = paymentMethod === 'CHARGE'
            const showPayments = isSplit || (isCharge && payments.length > 0)
            return (
                <div className="min-w-0 max-w-[16rem] space-y-1">
                    <Tag
                        className={classNames(
                            'whitespace-nowrap text-[11px]',
                            isSplit &&
                                'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
                            isCharge &&
                                'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
                        )}
                    >
                        {salesPaymentMethodLabel(paymentMethod)}
                        {isSplit ? ` · ${payments.length}` : ''}
                    </Tag>
                    {showPayments
                        ? payments.map((payment, index) => (
                              <div
                                  key={`${payment.method}-${index}`}
                                  className="flex items-baseline justify-between gap-3 text-[11px] leading-tight"
                                  title={
                                      payment.reference
                                          ? `${salesPaymentMethodLabel(payment.method)} · Ref ${payment.reference}`
                                          : salesPaymentMethodLabel(payment.method)
                                  }
                              >
                                  <span className="truncate text-gray-600 dark:text-gray-300">
                                      {index + 1}.{' '}
                                      {salesPaymentMethodLabel(payment.method)}
                                      {payment.reference ? (
                                          <span className="ml-1 font-mono text-gray-400">
                                              #{payment.reference}
                                          </span>
                                      ) : null}
                                  </span>
                                  <span className="shrink-0 font-semibold tabular-nums heading-text">
                                      {formatSdMoney(payment.amount, opts.currency)}
                                  </span>
                              </div>
                          ))
                        : null}
                </div>
            )
        },
    }),
    (opts) => ({
        header: 'Sales type',
        id: 'salesType',
        ...sized(opts.variant, 'salesType'),
        cell: ({ row }) => (
            <Tag className={SALES_TYPE_CLASS(row.original.salesType)}>
                {row.original.salesType}
            </Tag>
        ),
    }),
    (opts) => ({
        header: 'Invoice type',
        id: 'invoiceType',
        ...sized(opts.variant, 'invoiceType'),
        cell: ({ row }) => (
            <TextCell
                value={row.original.invoiceType}
                className="max-w-[10rem] text-xs text-gray-600 dark:text-gray-300"
            />
        ),
    }),
    (opts) => ({
        header: 'Invoice number',
        id: 'invoiceNumber',
        ...sized(opts.variant, 'invoiceNumber'),
        cell: ({ row }) =>
            row.original.invoiceNumber ? (
                <span
                    className="block max-w-[10.5rem] truncate font-mono text-xs font-semibold text-primary"
                    title={row.original.invoiceNumber}
                >
                    {row.original.invoiceNumber}
                </span>
            ) : (
                <Dash />
            ),
    }),
    (opts) => ({
        header: 'Batch #',
        id: 'batchNumber',
        ...sized(opts.variant, 'batchNumber'),
        cell: ({ row }) => <MonoCell value={row.original.batchNumber} />,
    }),
    (opts) => ({
        header: 'Lot #',
        id: 'lotNumber',
        ...sized(opts.variant, 'lotNumber'),
        cell: ({ row }) => <MonoCell value={row.original.lotNumber} />,
    }),
    (opts) => ({
        header: 'Expiry',
        id: 'productExpiry',
        ...sized(opts.variant, 'productExpiry'),
        cell: ({ row }) => <MonoCell value={row.original.productExpiry} />,
    }),
    (opts) => ({
        header: 'Remarks',
        id: 'remarks',
        ...sized(opts.variant, 'remarks'),
        cell: ({ row }) => (
            <TextCell
                value={row.original.remarks}
                className="max-w-[14rem] text-xs text-gray-600 dark:text-gray-300"
            />
        ),
    }),
]

const SUMMARY_IDS = new Set([
    'customerName',
    'salesChannel',
    'location',
    'particular',
    'qty',
    'cost',
    'totalCost',
    'totalSales',
    'paidStatus',
    'balanceDue',
    'paymentMethod',
    'salesType',
    'invoiceNumber',
    'batchNumber',
    'lotNumber',
    'productExpiry',
])

export function buildSalesLineReportColumns(
    options: ColumnOptions,
): ColumnDef<SalesLineReportRow>[] {
    const built = ALL_COLUMN_BUILDERS.map((build) => build(options))
    if (options.variant === 'full') return built
    return built.filter((col) => col.id && SUMMARY_IDS.has(col.id as string))
}