'use client'

import type { ColumnDef } from '@/components/shared/DataTable'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import { SdMoneyCell } from './SdDataTableCells'
import {
    salesChannelLabel,
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

const relaxed = (variant: ColumnOptions['variant']) => variant === 'full'

const fullHeaderClass =
    'whitespace-normal text-xs font-semibold uppercase leading-tight tracking-wide'

/** Full modal register — wide fixed columns; table scrolls horizontally. */
const FULL_COL = {
    customerName: { size: 200, min: 176 },
    location: { size: 148, min: 128 },
    barcode: { size: 148, min: 132 },
    accountTitle: { size: 168, min: 148 },
    particular: { size: 380, min: 320 },
    qty: { size: 72, min: 64 },
    uom: { size: 88, min: 76 },
    cost: { size: 116, min: 104 },
    totalCost: { size: 124, min: 112 },
    srp: { size: 112, min: 100 },
    sales: { size: 112, min: 100 },
    discount: { size: 112, min: 100 },
    subtotal: { size: 124, min: 112 },
} as const

const fullSize = (
    variant: ColumnOptions['variant'],
    key: keyof typeof FULL_COL,
    summary: { size: number; min: number },
) =>
    relaxed(variant)
        ? { size: FULL_COL[key].size, minSize: FULL_COL[key].min }
        : { size: summary.size, minSize: summary.min }

const ProductLineCell = ({
    row,
    productByName,
    onParticularClick,
    isRelaxed,
}: {
    row: SalesLineReportRow
    productByName: ColumnOptions['productByName']
    onParticularClick?: ColumnOptions['onParticularClick']
    isRelaxed: boolean
}) => {
    const linked = productByName.has(row.particular)
    const thumbClass = isRelaxed ? 'h-11 w-11' : 'h-10 w-10'
    const textClass = isRelaxed
        ? 'min-w-0 flex-1 whitespace-normal text-left text-sm leading-snug'
        : 'min-w-0 flex-1 truncate text-sm'

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
        <div className="flex min-w-0 items-center gap-2">
            <div
                className={`${thumbClass} shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800`}
            >
                {row.productImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={row.productImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase text-gray-500">
                        {row.particular.trim().slice(0, 2) || '—'}
                    </span>
                )}
            </div>
            {label}
        </div>
    )
}

const ALL_COLUMN_BUILDERS: Array<
  (opts: ColumnOptions) => ColumnDef<SalesLineReportRow>
> = [
  (opts) => ({
    header: 'Customer name',
    id: 'customerName',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'customerName', { size: 180, min: 140 }),
    cell: ({ row }) => (
      <span
        className={
          relaxed(opts.variant)
            ? 'block whitespace-normal text-sm font-medium leading-snug heading-text'
            : 'block max-w-[16rem] truncate text-sm font-medium heading-text'
        }
        title={row.original.customerName}
      >
        {row.original.customerName}
      </span>
    ),
  }),
  (opts) => ({
    header: 'Channel',
    id: 'salesChannel',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    size: relaxed(opts.variant) ? 120 : 104,
    minSize: relaxed(opts.variant) ? 100 : 88,
    cell: ({ row }) => (
      <Tag className="whitespace-nowrap text-[11px]">
        {salesChannelLabel(row.original.salesChannel)}
      </Tag>
    ),
  }),
  (opts) => ({
    header: 'Location',
    id: 'location',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'location', { size: 120, min: 96 }),
    cell: ({ row }) => (
      <span
        className={
          relaxed(opts.variant)
            ? 'block whitespace-normal text-sm leading-snug'
            : 'whitespace-nowrap text-sm'
        }
      >
        {row.original.location}
      </span>
    ),
  }),
  (opts) => ({
    header: 'Barcode',
    id: 'barcode',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'barcode', { size: 130, min: 130 }),
    cell: ({ row }) => (
      <span
        className={classNames(
          'whitespace-nowrap font-mono text-gray-600 dark:text-gray-300',
          relaxed(opts.variant) ? 'text-sm' : 'text-xs',
        )}
      >
        {row.original.barcode}
      </span>
    ),
  }),
  (opts) => ({
    header: 'Account title',
    id: 'accountTitle',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'accountTitle', { size: 120, min: 110 }),
    cell: ({ row }) => (
      <span
        className={
          relaxed(opts.variant)
            ? 'block whitespace-normal text-sm uppercase leading-snug'
            : 'block max-w-[10rem] truncate text-sm uppercase'
        }
      >
        {row.original.accountTitle || '—'}
      </span>
    ),
  }),
  (opts) => ({
    header: 'Particular',
    id: 'particular',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'particular', { size: 200, min: 160 }),
    cell: ({ row }) => (
      <ProductLineCell
        row={row.original}
        productByName={opts.productByName}
        onParticularClick={opts.onParticularClick}
        isRelaxed={relaxed(opts.variant)}
      />
    ),
  }),
  (opts) => ({
    header: 'Qty',
    id: 'qty',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'qty', { size: 72, min: 56 }),
    cell: ({ row }) => (
      <span
        className={classNames(
          'tabular-nums',
          relaxed(opts.variant) ? 'text-sm' : 'text-[11px]',
        )}
      >
        {formatQty(row.original.quantity)}
      </span>
    ),
  }),
  (opts) => ({
    header: 'UOM',
    id: 'uom',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'uom', { size: 72, min: 56 }),
    cell: ({ row }) => (
      <span
        className={classNames(
          'text-gray-600 dark:text-gray-300',
          relaxed(opts.variant) ? 'text-sm' : 'text-[11px]',
        )}
      >
        {row.original.uom || '—'}
      </span>
    ),
  }),
  (opts) => ({
    header: 'Cost',
    id: 'cost',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'cost', { size: 112, min: 96 }),
    cell: ({ row }) => (
      <SdMoneyCell amount={row.original.unitCost} currency={opts.currency} />
    ),
  }),
  (opts) => ({
    header: 'Total cost',
    id: 'totalCost',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'totalCost', { size: 118, min: 104 }),
    cell: ({ row }) => (
      <SdMoneyCell amount={row.original.totalCost} currency={opts.currency} />
    ),
  }),
  (opts) => ({
    header: 'SRP',
    id: 'srp',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'srp', { size: 104, min: 88 }),
    cell: ({ row }) => (
      <SdMoneyCell amount={row.original.srp} currency={opts.currency} />
    ),
  }),
  (opts) => ({
    header: 'Sales',
    id: 'sales',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'sales', { size: 104, min: 88 }),
    cell: ({ row }) => (
      <SdMoneyCell amount={row.original.sales} currency={opts.currency} />
    ),
  }),
  (opts) => ({
    header: 'Discount',
    id: 'discount',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'discount', { size: 104, min: 88 }),
    cell: ({ row }) =>
      row.original.discount > 0 ? (
        <SdMoneyCell
          amount={row.original.discount}
          currency={opts.currency}
          negative
        />
      ) : (
        <span className="text-gray-400">—</span>
      ),
  }),
  (opts) => ({
    header: 'Subtotal',
    id: 'subtotal',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    ...fullSize(opts.variant, 'subtotal', { size: 112, min: 96 }),
    cell: ({ row }) => (
      <SdMoneyCell
        emphasize
        amount={row.original.subtotal}
        currency={opts.currency}
      />
    ),
  }),
  (opts) => ({
    header: 'Total sales',
    id: 'totalSales',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    size: relaxed(opts.variant) ? 68 : 118,
    minSize: relaxed(opts.variant) ? 56 : 104,
    cell: ({ row }) => (
      <SdMoneyCell
        emphasize
        amount={row.original.totalSales}
        currency={opts.currency}
      />
    ),
  }),
  (opts) => ({
    header: 'Sales type',
    id: 'salesType',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    size: relaxed(opts.variant) ? 64 : 108,
    minSize: relaxed(opts.variant) ? 52 : 92,
    cell: ({ row }) => (
      <Tag
        className={classNames(
          relaxed(opts.variant) && 'text-[10px]',
          row.original.salesType === 'CREDIT' &&
            'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
        )}
      >
        {row.original.salesType}
      </Tag>
    ),
  }),
  (opts) => ({
    header: 'Invoice type',
    id: 'invoiceType',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    size: relaxed(opts.variant) ? 80 : 116,
    minSize: relaxed(opts.variant) ? 64 : 108,
    cell: ({ row }) => (
      <span className="whitespace-normal text-[10px] leading-tight text-gray-600 dark:text-gray-300">
        {row.original.invoiceType}
      </span>
    ),
  }),
  (opts) => ({
    header: 'Invoice number',
    id: 'invoiceNumber',
    meta: relaxed(opts.variant)
        ? { className: fullHeaderClass }
        : undefined,
    size: relaxed(opts.variant) ? 88 : 124,
    minSize: relaxed(opts.variant) ? 72 : 120,
    cell: ({ row }) => (
      <span className="break-all font-mono text-[10px] text-primary">
        {row.original.invoiceNumber || '—'}
      </span>
    ),
  }),
]

const SUMMARY_IDS = new Set([
  'customerName',
  'salesChannel',
  'location',
  'particular',
  'qty',
  'totalSales',
  'salesType',
  'invoiceNumber',
])

export function buildSalesLineReportColumns(
  options: ColumnOptions,
): ColumnDef<SalesLineReportRow>[] {
  const built = ALL_COLUMN_BUILDERS.map((build) => build(options))
  if (options.variant === 'full') return built
  return built.filter((col) => col.id && SUMMARY_IDS.has(col.id as string))
}
