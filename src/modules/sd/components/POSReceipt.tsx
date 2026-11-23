import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import type { PosReceipt as PosReceiptData } from '../services/posService'
import { branchLabel } from '../catalogs/branchCatalog'

type POSReceiptProps = {
    receipt: PosReceiptData
    /** Selected branch name (MM Organization Branch) when available. */
    branchName?: string | null
    /** Optional name printed under "Checked By"; the line stays open for a signature. */
    checkedByName?: string | null
    /** Tighter spacing so the form fits half an A4 sheet (two copies per page). */
    compact?: boolean
    className?: string
}

/** Logo shown when the sale carries no company record (AWIC retail default). */
const FALLBACK_LOGO = '/storefront/aw-logo-new.png'

/** The form always shows at least this many item rows, like the paper receipt. */
const MIN_ITEM_ROWS = 6
/** Compact (two-per-page) form: no blank padding — long sales must stay on one sheet. */
const MIN_ITEM_ROWS_COMPACT = 0

const money = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)

const formatQty = (value: number) =>
    Number.isInteger(value)
        ? String(value)
        : value.toLocaleString('en-PH', { maximumFractionDigits: 3 })

const TENDER_LABEL: Record<string, string> = {
    CASH: 'Cash',
    GCASH: 'GCash',
    BANK_TRANSFER: 'Bank transfer',
    CARD: 'Card',
    CHEQUE: 'Cheque',
    SALARY_LOAN: 'Salary deduction',
}

/** BIR-style item markers after the line amount. */
const VAT_CODE: Record<string, string> = {
    VATABLE: 'V',
    VAT_EXEMPT: 'E',
    ZERO_RATED: 'Z',
}

/** Settlement the server recorded for a tender. */
const TENDER_STATUS: Record<string, string> = {
    Paid: 'Paid',
    Unpaid: 'Unpaid (salary deduction)',
    'Pending Verification': 'Pending verification',
    Authorized: 'Authorized (receivable)',
    Failed: 'Failed',
    Cancelled: 'Cancelled',
    Refunded: 'Refunded',
}

const initialsOf = (name: string) =>
    name
        .split(/\s+/)
        .filter((word) => /^[A-Za-z0-9]/.test(word))
        .slice(0, 3)
        .map((word) => word[0]!.toUpperCase())
        .join('')

const CELL = 'border border-black px-1.5 py-[3px] align-middle'
const HEAD =
    'whitespace-nowrap border border-black bg-white px-1 py-1.5 text-center text-[9.5px] font-bold uppercase'

/** "LABEL:" followed by the value on a ruled line. */
const Field = ({
    label,
    children,
    className,
}: {
    label: string
    children: ReactNode
    className?: string
}) => (
    <div className={classNames('flex min-w-0 items-baseline gap-2', className)}>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
            {label}
        </span>
        <span className="min-w-0 flex-1 truncate border-b border-dotted border-black/60 pb-px font-semibold">
            {children}
        </span>
    </div>
)

/** Label left, amount right inside the totals box. */
const TotalRow = ({
    label,
    value,
    strong,
}: {
    label: ReactNode
    value: ReactNode
    strong?: boolean
}) => (
    <div
        className={classNames(
            'flex items-baseline justify-between gap-3 px-2 py-[3px]',
            strong && 'font-bold',
        )}
    >
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
    </div>
)

/** Printable check box, marked with an X when ticked. */
const CheckBox = ({ checked, label }: { checked: boolean; label: string }) => (
    <span className="inline-flex items-center gap-1.5">
        <span
            className="inline-flex h-3.5 w-3.5 items-center justify-center border border-black text-[11px] font-black leading-none"
            aria-hidden
        >
            {checked ? 'X' : ''}
        </span>
        <span
            className={classNames('text-[11px]', checked && 'font-bold')}
            aria-label={`${label}${checked ? ' (selected)' : ''}`}
        >
            {label}
        </span>
    </span>
)

/**
 * A4 sales receipt (paper form layout): company header, date / customer,
 * item table (barcode, category, brand, description, qty, unit price,
 * discount, total), totals, payment mode and the Prepared / Checked /
 * Received signature row. Always black on white so it prints the same in
 * dark mode.
 */
const POSReceipt = ({
    receipt,
    branchName,
    checkedByName,
    compact = false,
    className,
}: POSReceiptProps) => {
    const completedAt = new Date(receipt.completedAt)
    const voided = receipt.status === 'CANCELLED'
    // Sales recorded before the VAT snapshot existed carry no classification.
    // The VAT details block (and the V/E/Z markers) only appear when the sale
    // actually includes VATable products.
    const hasVat =
        (receipt.vatAmount ?? 0) > 0 ||
        receipt.lines.some((line) => line.taxClassification === 'VATABLE')
    const vatRates = [
        ...new Set(
            receipt.lines
                .filter(
                    (line) =>
                        line.taxClassification === 'VATABLE' && line.taxRate,
                )
                .map((line) => line.taxRate),
        ),
    ]
    const vatRateLabel = vatRates.length === 1 ? ` (${vatRates[0]}%)` : ''

    const business = receipt.business ?? null
    const companyName = business?.name || AWIC_BRAND.fullName
    const logoUrl = business ? business.logoUrl?.trim() || null : FALLBACK_LOGO
    const monogram = initialsOf(business?.name ?? '') || AWIC_BRAND.initials

    const balance = Number(receipt.outstandingBalance ?? 0)
    const hasBalance = balance > 0.005
    // Subtotal / total / tendered / change are not printed; the box only holds
    // the adjustments and the balance due when there are any.
    const hasTotalsBox =
        Boolean(receipt.discountAmount) ||
        Boolean(receipt.taxAmount) ||
        hasBalance
    const paymentStatus = String(
        receipt.paymentStatus || (hasBalance ? 'Partially Paid' : 'Paid'),
    )
    // Charge sale: the customer took the goods and pays later.
    const isCharge = receipt.paymentMode === 'CHARGE'
    const hasTenders = receipt.tenders.length > 0
    const paidInCash = receipt.tenders.some(
        (tender) => tender.method === 'CASH',
    )
    const otherTenders = receipt.tenders.filter(
        (tender) => tender.method !== 'CASH',
    )
    const onCredit = isCharge || hasBalance
    // Full name of the user that served the sale (resolved by the server).
    const preparedBy = receipt.cashierName?.trim() || null

    const signLineGap = compact ? 'mt-4' : 'mt-6'

    const blankRows = Math.max(
        0,
        (compact ? MIN_ITEM_ROWS_COMPACT : MIN_ITEM_ROWS) -
            receipt.lines.length,
    )

    return (
        <div
            className={classNames(
                'relative mx-auto w-full max-w-[190mm] bg-white p-1 font-sans text-[11px] leading-snug text-black',
                className,
            )}
        >
            {voided ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
                >
                    <span className="-rotate-[20deg] rounded-md border-[6px] border-black/30 px-8 py-2 text-7xl font-black uppercase tracking-[0.2em] text-black/30">
                        Voided
                    </span>
                </div>
            ) : null}

            {/* Header: logo, company, address */}
            <header
                className={classNames(
                    'relative flex min-h-[100px] items-center justify-center px-28 pt-1 text-center',
                    compact ? 'pb-1.5' : 'pb-3',
                )}
            >
                <div className="absolute left-0 top-0 flex h-[100px] w-[100px] items-center justify-center">
                    {logoUrl ? (
                        <img
                            src={logoUrl}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                        />
                    ) : (
                        <div className="inline-flex h-14 min-w-14 items-center justify-center rounded-full border-2 border-black px-2 text-base font-black tracking-wider">
                            {monogram}
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="text-[17px] font-extrabold uppercase leading-tight tracking-wide">
                        {companyName}
                    </div>
                    {business?.address ? (
                        <div className="mt-0.5 whitespace-pre-line break-words text-[10.5px] italic text-gray-800">
                            {business.address}
                        </div>
                    ) : null}
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-700">
                        {branchLabel(receipt.branchId, branchName)}
                    </div>
                </div>
            </header>

            {/* Title + document numbers */}
            <div className="flex items-end justify-between gap-4 border-b-2 border-black pb-1">
                <h1 className="text-[16px] font-extrabold uppercase tracking-[0.12em]">
                    Sales Receipt
                </h1>
                <div className="text-right text-[10.5px] leading-tight">
                    <div>
                        <span className="font-bold uppercase tracking-wide">
                            Receipt No.
                        </span>{' '}
                        <span className="font-mono text-[12px] font-bold">
                            {receipt.receiptNumber}
                        </span>
                    </div>
                    <div className="text-gray-700">
                        Order {receipt.orderNumber}
                    </div>
                </div>
            </div>

            {/* Date / customer */}
            <div
                className={classNames(
                    'grid grid-cols-2 gap-x-8',
                    compact ? 'mb-2 mt-1.5 gap-y-1' : 'mb-3 mt-2.5 gap-y-1.5',
                )}
            >
                <Field label="Date:">
                    {completedAt.toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                    })}
                    <span className="mx-2 font-normal">@</span>
                    {completedAt.toLocaleTimeString('en-PH', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </Field>
                <Field label="Customer name:" className="col-span-2">
                    {receipt.customerName || '—'}
                </Field>
            </div>

            {/* Items */}
            <table className="w-full table-fixed border-collapse border border-black">
                <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '23%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '13%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th className={HEAD}>Barcode</th>
                        <th className={HEAD}>Category</th>
                        <th className={HEAD}>Brand</th>
                        <th className={HEAD}>Description</th>
                        <th className={HEAD}>Qty</th>
                        <th className={HEAD}>Unit price</th>
                        <th className={HEAD}>Cost</th>
                        <th className={HEAD}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {receipt.lines.map((line, index) => (
                        <tr
                            key={`${line.sku}-${index}`}
                            className="break-inside-avoid"
                        >
                            <td
                                className={classNames(
                                    CELL,
                                    'break-all font-mono text-[9.5px]',
                                )}
                            >
                                {line.barcode || line.sku}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'break-words text-[10px]',
                                )}
                            >
                                {line.category || ''}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'break-words text-[10px]',
                                )}
                            >
                                {line.brand || ''}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'break-words font-semibold',
                                )}
                            >
                                {line.description ?? line.sku}
                                {line.variantName ? (
                                    <span className="block text-[10px] font-normal text-gray-700">
                                        {line.variantName}
                                    </span>
                                ) : null}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'text-center tabular-nums',
                                )}
                            >
                                {formatQty(line.quantity)}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'text-right tabular-nums',
                                )}
                            >
                                {money(line.unitPrice)}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'text-right tabular-nums text-gray-700',
                                )}
                            >
                                {Number(line.unitCost ?? 0) > 0
                                    ? money(Number(line.unitCost))
                                    : '—'}
                            </td>
                            <td
                                className={classNames(
                                    CELL,
                                    'text-right font-bold tabular-nums',
                                )}
                            >
                                {money(line.lineTotal)}
                                <span className="ml-0.5 inline-block w-2 text-center text-[10px] font-bold">
                                    {hasVat
                                        ? (VAT_CODE[
                                              line.taxClassification ?? ''
                                          ] ?? '')
                                        : ''}
                                </span>
                            </td>
                        </tr>
                    ))}
                    {Array.from({ length: blankRows }, (_, index) => (
                        <tr key={`blank-${index}`} aria-hidden>
                            {Array.from({ length: 8 }, (_, cell) => (
                                <td
                                    key={cell}
                                    className={classNames(
                                        CELL,
                                        compact ? 'h-[18px]' : 'h-[22px]',
                                    )}
                                />
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Payment mode + totals */}
            <div
                className={classNames(
                    'grid grid-cols-[1fr_72mm] items-start gap-4 break-inside-avoid',
                    compact ? 'mt-2' : 'mt-3',
                )}
            >
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-1">
                        <CheckBox checked={paidInCash} label="cash" />
                        <CheckBox checked={onCredit} label="credit" />
                    </div>
                    {otherTenders.length ? (
                        <div className="space-y-0.5 text-[10.5px]">
                            {otherTenders.map((tender, index) => (
                                <div
                                    key={`${tender.method}-${index}`}
                                    className="break-words"
                                >
                                    <span className="font-bold">
                                        {TENDER_LABEL[tender.method] ??
                                            tender.method}
                                    </span>{' '}
                                    {money(tender.amount)}
                                    {tender.referenceNumber
                                        ? ` · Ref ${tender.referenceNumber}`
                                        : ''}
                                    {tender.employeeName
                                        ? ` · ${tender.employeeName}`
                                        : ''}
                                    {tender.status && tender.status !== 'Paid'
                                        ? ` · ${TENDER_STATUS[tender.status] ?? tender.status}`
                                        : ''}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {isCharge && !hasTenders ? (
                        <div className="text-[10.5px]">
                            Charge sale: to be paid later.
                        </div>
                    ) : null}
                    <div className="inline-block border border-black px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em]">
                        {isCharge ? `Charge · ${paymentStatus}` : paymentStatus}
                    </div>
                </div>

                {hasTotalsBox ? (
                    <div className="border border-black">
                        {receipt.discountAmount ? (
                            <TotalRow
                                label="Less: Discount"
                                value={`-${money(receipt.discountAmount)}`}
                            />
                        ) : null}
                        {receipt.taxAmount ? (
                            <TotalRow
                                label="VAT (added)"
                                value={money(receipt.taxAmount)}
                            />
                        ) : null}
                        {hasBalance ? (
                            <div className="border-t-2 border-black">
                                {receipt.downPaymentPct ? (
                                    <TotalRow
                                        label={`Down payment (${Number(receipt.downPaymentPct)}%)`}
                                        value={money(
                                            Number(
                                                receipt.downPaymentAmount ?? 0,
                                            ),
                                        )}
                                    />
                                ) : receipt.downPaymentAmount ? (
                                    <TotalRow
                                        label="Down payment"
                                        value={money(
                                            Number(receipt.downPaymentAmount),
                                        )}
                                    />
                                ) : null}
                                <div className="flex items-baseline justify-between gap-3 px-2 py-1.5 font-extrabold">
                                    <span className="text-[11px] uppercase tracking-wider">
                                        Balance due
                                    </span>
                                    <span className="text-[14px] tabular-nums">
                                        PHP {money(balance)}
                                    </span>
                                </div>
                                {receipt.dueDate ? (
                                    <div className="px-2 pb-1 text-right text-[10px]">
                                        Due on{' '}
                                        {new Date(
                                            String(receipt.dueDate),
                                        ).toLocaleDateString('en-PH', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: '2-digit',
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* Charge sale: the customer acknowledges the goods and the debt */}
            {isCharge && hasBalance ? (
                <p className="mt-3 text-[10px] italic">
                    Goods received in good order. I agree to pay the balance due
                    on the date above.
                </p>
            ) : null}

            {receipt.remarks ? (
                <p className="mt-3 whitespace-pre-line break-words text-[10.5px]">
                    <span className="font-bold uppercase tracking-wide">
                        Remarks:{' '}
                    </span>
                    {receipt.remarks}
                </p>
            ) : null}

            {/* Signatures */}
            <div
                className={classNames(
                    'grid grid-cols-3 gap-8 break-inside-avoid',
                    compact ? 'mt-4' : 'mt-8',
                )}
            >
                <div>
                    <div className="text-[10px] font-bold">Prepared By:</div>
                    <div
                        className={classNames(
                            'border-b border-black',
                            signLineGap,
                        )}
                    />
                    <div className="mt-1 text-[10.5px] font-bold uppercase">
                        {preparedBy ?? '\u00a0'}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-bold">Checked By:</div>
                    <div
                        className={classNames(
                            'border-b border-black',
                            signLineGap,
                        )}
                    />
                    <div className="mt-1 text-[10.5px] font-bold uppercase">
                        {checkedByName?.trim() || '\u00a0'}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-bold">Received:</div>
                    <div
                        className={classNames(
                            'border-b border-black',
                            signLineGap,
                        )}
                    />
                    <div className="mt-1 text-[10.5px] font-bold uppercase">
                        {receipt.customerName || '\u00a0'}
                    </div>
                    <div className="text-[9px] text-gray-600">
                        Signature over printed name
                    </div>
                </div>
            </div>

            {/* VAT breakdown - only for sales that include VATable products */}
            {hasVat ? (
                <div
                    className={classNames(
                        'break-inside-avoid border-t border-black pt-2',
                        compact ? 'mt-3' : 'mt-6',
                    )}
                >
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide">
                        VAT details
                    </div>
                    <div className="grid grid-cols-4 gap-x-6 gap-y-0.5 text-[10px]">
                        <div className="flex justify-between gap-2">
                            <span>VATable Sales</span>
                            <span className="tabular-nums">
                                {money(receipt.vatableSales ?? 0)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>{`VAT${vatRateLabel}`}</span>
                            <span className="tabular-nums">
                                {money(receipt.vatAmount ?? 0)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>VAT-Exempt Sales</span>
                            <span className="tabular-nums">
                                {money(receipt.vatExemptSales ?? 0)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>Zero-Rated Sales</span>
                            <span className="tabular-nums">
                                {money(receipt.zeroRatedSales ?? 0)}
                            </span>
                        </div>
                        {receipt.nonVatSales ? (
                            <div className="flex justify-between gap-2">
                                <span>Non-VAT Sales</span>
                                <span className="tabular-nums">
                                    {money(receipt.nonVatSales)}
                                </span>
                            </div>
                        ) : null}
                    </div>
                    <div className="mt-1 text-[9px] text-gray-700">
                        V = VATable · E = VAT-exempt · Z = Zero-rated
                    </div>
                </div>
            ) : null}

            {receipt.warnings.length ? (
                <div className="mt-2 space-y-0.5 text-[10px]">
                    {receipt.warnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                    ))}
                </div>
            ) : null}

            {voided && receipt.voidReason ? (
                <div className="mt-3 border border-black px-2 py-1.5 text-[10.5px]">
                    <span className="font-bold uppercase tracking-wide">
                        Voided:{' '}
                    </span>
                    {receipt.voidReason} ·{' '}
                    {new Date(
                        receipt.voidedAt ?? receipt.completedAt,
                    ).toLocaleString('en-PH')}
                </div>
            ) : null}
        </div>
    )
}

export default POSReceipt
