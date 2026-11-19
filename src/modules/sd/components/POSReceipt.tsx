import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import type { PosReceipt as PosReceiptData } from '../services/posService'
import { branchLabel } from '../catalogs/branchCatalog'
import { encodeCode128, isCode128Encodable } from '../utils/code128'

type POSReceiptProps = {
    receipt: PosReceiptData
    /** Selected branch name (MM Organization Branch) when available. */
    branchName?: string | null
    /** Register of the cashier shift that collected the sale. */
    terminalCode?: string | null
    /** Name of the cashier that served the customer. */
    cashierName?: string | null
    className?: string
}

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

/** Dashed rule between receipt blocks. */
const Divider = ({ className }: { className?: string }) => (
    <div
        className={classNames(
            'my-2 border-t border-dashed border-black',
            className,
        )}
    />
)

/** Section caption centered between two rules — "──── ITEMS ────". */
const SectionTitle = ({ children }: { children: ReactNode }) => (
    <div className="my-2 flex items-center gap-2">
        <div className="h-px flex-1 bg-black" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
            {children}
        </span>
        <div className="h-px flex-1 bg-black" />
    </div>
)

/** Label left, value right, joined by a dotted leader. */
const Row = ({
    label,
    value,
    bold,
    small,
}: {
    label: ReactNode
    value: ReactNode
    bold?: boolean
    small?: boolean
}) => (
    <div
        className={classNames(
            'flex items-baseline gap-1',
            bold && 'font-bold',
            small && 'text-[10px]',
        )}
    >
        <span className="shrink-0">{label}</span>
        <span className="mb-[3px] min-w-2 flex-1 border-b border-dotted border-black/60" />
        <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
)

/** Meta line: small caption on the left, value wrapped on the right. */
const Meta = ({ label, value }: { label: string; value: string }) => (
    <div className="flex gap-2">
        <span className="w-[68px] shrink-0 text-[10px] uppercase tracking-wide">
            {label}
        </span>
        <span className="min-w-0 flex-1 break-words font-semibold">{value}</span>
    </div>
)

/** Code 128 of the receipt number — scannable for returns and look-ups. */
const ReceiptBarcode = ({ value }: { value: string }) => {
    if (!isCode128Encodable(value)) return null
    const { bars, modules } = encodeCode128(value)
    const quiet = 10
    const total = modules + quiet * 2
    return (
        <svg
            role="img"
            aria-label={`Barcode ${value}`}
            viewBox={`0 0 ${total} 40`}
            preserveAspectRatio="none"
            shapeRendering="crispEdges"
            className="mx-auto block h-12 w-full max-w-[250px]"
        >
            <rect width={total} height="40" fill="#fff" />
            {bars.map(([x, width]) => (
                <rect
                    key={x}
                    x={x + quiet}
                    y="0"
                    width={width}
                    height="40"
                    fill="#000"
                />
            ))}
        </svg>
    )
}

/** 80mm thermal-style receipt; always black on white so it prints the same in dark mode. */
const POSReceipt = ({
    receipt,
    branchName,
    terminalCode,
    cashierName,
    className,
}: POSReceiptProps) => {
    const completedAt = new Date(receipt.completedAt)
    const itemCount = receipt.lines.reduce((sum, line) => sum + line.quantity, 0)
    const voided = receipt.status === 'CANCELLED'
    // Sales recorded before the VAT snapshot existed carry no classification.
    const hasVat = receipt.lines.some((line) => line.taxClassification)
    const vatRates = [
        ...new Set(
            receipt.lines
                .filter((line) => line.taxClassification === 'VATABLE' && line.taxRate)
                .map((line) => line.taxRate),
        ),
    ]
    const vatRateLabel = vatRates.length === 1 ? ` (${vatRates[0]}%)` : ''

    const business = receipt.business ?? null
    const companyName = business?.name || AWIC_BRAND.fullName
    const logoUrl = business?.logoUrl?.trim() || null
    const monogram =
        initialsOf(business?.name ?? '') || AWIC_BRAND.initials

    const balance = Number(receipt.outstandingBalance ?? 0)
    const hasBalance = balance > 0.005
    const paymentStatus = String(
        receipt.paymentStatus || (hasBalance ? 'Partially Paid' : 'Paid'),
    )
    const settled = !hasBalance && /^paid$/i.test(paymentStatus)
    const isSplit = receipt.tenders.length > 1
    const preparedBy = cashierName ?? receipt.cashierUserId ?? null

    return (
        <div
            className={classNames(
                'mx-auto w-full max-w-[300px] bg-white p-3 font-mono text-[11px] leading-snug text-black',
                className,
            )}
        >
            {/* Header — company, address, TIN */}
            <div className="text-center">
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt=""
                        className="mx-auto mb-1.5 max-h-12 w-auto object-contain"
                        style={{ filter: 'grayscale(1) contrast(1.6)' }}
                    />
                ) : (
                    <div className="mx-auto mb-1.5 inline-flex h-10 min-w-10 items-center justify-center rounded-md border-2 border-black px-2 font-sans text-base font-black tracking-wider">
                        {monogram}
                    </div>
                )}
                <div className="font-sans text-[15px] font-extrabold uppercase leading-tight tracking-wide">
                    {companyName}
                </div>
                {business?.address ? (
                    <div className="mt-0.5 whitespace-pre-line break-words text-[10px]">
                        {business.address}
                    </div>
                ) : null}
                {business?.tin ? (
                    <div className="text-[10px]">VAT REG TIN: {business.tin}</div>
                ) : null}
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider">
                    {branchLabel(receipt.branchId, branchName)}
                </div>
            </div>

            {/* Document title */}
            <div className="mt-2 bg-black py-1 text-center font-sans text-[12px] font-bold uppercase tracking-[0.3em] text-white">
                Official Receipt
            </div>
            {voided ? (
                <div className="mt-2 border-2 border-black py-1 text-center font-sans text-base font-black uppercase tracking-[0.35em]">
                    Voided
                </div>
            ) : null}

            {/* Transaction meta */}
            <div className="mt-2 space-y-0.5">
                <Meta label="Receipt No." value={receipt.receiptNumber} />
                <Meta label="Order No." value={receipt.orderNumber} />
                <Meta
                    label="Date"
                    value={completedAt.toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                    })}
                />
                <Meta
                    label="Time"
                    value={completedAt.toLocaleTimeString('en-PH', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                />
                {preparedBy ? <Meta label="Cashier" value={preparedBy} /> : null}
                {terminalCode ? (
                    <Meta label="Register" value={terminalCode} />
                ) : null}
                {receipt.customerName ? (
                    <Meta label="Customer" value={receipt.customerName} />
                ) : null}
            </div>

            {/* Items */}
            <SectionTitle>Items</SectionTitle>
            <div className="space-y-2">
                {receipt.lines.map((line, index) => (
                    <div key={`${line.sku}-${index}`}>
                        <div className="flex gap-1.5">
                            <span className="w-4 shrink-0 text-right text-[10px]">
                                {index + 1}.
                            </span>
                            <span className="min-w-0 flex-1 break-words font-semibold">
                                {line.description ?? line.sku}
                            </span>
                        </div>
                        {line.variantName || line.barcode ? (
                            <div className="ml-[22px] break-words text-[10px]">
                                {[
                                    line.variantName,
                                    line.barcode ? `#${line.barcode}` : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </div>
                        ) : null}
                        <div className="ml-[22px]">
                            <Row
                                label={`${formatQty(line.quantity)} x ${money(line.unitPrice)}`}
                                value={
                                    <>
                                        {money(line.lineTotal)}{' '}
                                        <span className="inline-block w-2 text-center text-[10px] font-bold">
                                            {VAT_CODE[line.taxClassification ?? ''] ??
                                                ''}
                                        </span>
                                    </>
                                }
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Totals */}
            <Divider />
            <div className="space-y-0.5">
                <Row
                    label={`Subtotal (${formatQty(itemCount)} item${itemCount === 1 ? '' : 's'})`}
                    value={money(receipt.subtotal)}
                />
                {receipt.discountAmount ? (
                    <Row
                        label="Discount"
                        value={`-${money(receipt.discountAmount)}`}
                    />
                ) : null}
                {receipt.taxAmount ? (
                    <Row label="VAT (added)" value={money(receipt.taxAmount)} />
                ) : null}
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 border-y-[3px] border-double border-black py-1.5 font-sans">
                <span className="text-[12px] font-bold uppercase tracking-[0.2em]">
                    Total
                </span>
                <span className="text-[19px] font-black tabular-nums leading-none">
                    PHP {money(receipt.total)}
                </span>
            </div>

            {/* Payment */}
            <SectionTitle>{isSplit ? 'Split payment' : 'Payment'}</SectionTitle>
            <div className="space-y-1">
                {receipt.tenders.map((tender, index) => (
                    <div key={`${tender.method}-${index}`}>
                        <Row
                            label={
                                isSplit
                                    ? `${index + 1}. ${TENDER_LABEL[tender.method] ?? tender.method}`
                                    : (TENDER_LABEL[tender.method] ?? tender.method)
                            }
                            value={money(tender.amount)}
                            bold
                        />
                        {tender.referenceNumber ? (
                            <div className="break-words pl-3 text-[10px]">
                                Ref: {tender.referenceNumber}
                            </div>
                        ) : null}
                        {tender.employeeName ? (
                            <div className="break-words pl-3 text-[10px]">
                                Employee: {tender.employeeName}
                            </div>
                        ) : null}
                        {tender.status && tender.status !== 'Paid' ? (
                            <div className="pl-3 text-[10px] font-semibold uppercase">
                                {TENDER_STATUS[tender.status] ?? tender.status}
                            </div>
                        ) : null}
                        {tender.changeAmount ? (
                            <div className="pl-3 text-[10px]">
                                Change: {money(tender.changeAmount)}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
            <Divider />
            <div className="space-y-0.5">
                <Row label="Amount tendered" value={money(receipt.tendered)} />
                <Row label="Change" value={money(receipt.change)} />
            </div>
            <div
                className={classNames(
                    'mt-2 py-1 text-center font-sans text-[12px] font-extrabold uppercase tracking-[0.25em]',
                    settled
                        ? 'border-2 border-black'
                        : 'border-2 border-dashed border-black',
                )}
            >
                {paymentStatus}
            </div>

            {/* Balance due — down payment / partial settlement */}
            {hasBalance ? (
                <div className="mt-2 border-2 border-black p-2">
                    <div className="mb-1 text-center font-sans text-[10px] font-bold uppercase tracking-[0.25em]">
                        Amount still to pay
                    </div>
                    {receipt.downPaymentPct ? (
                        <Row
                            label={`Down payment (${Number(receipt.downPaymentPct)}%)`}
                            value={money(Number(receipt.downPaymentAmount ?? 0))}
                        />
                    ) : receipt.downPaymentAmount ? (
                        <Row
                            label="Down payment"
                            value={money(Number(receipt.downPaymentAmount))}
                        />
                    ) : null}
                    <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-black pt-1 font-sans">
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                            Balance due
                        </span>
                        <span className="text-[16px] font-black tabular-nums leading-none">
                            PHP {money(balance)}
                        </span>
                    </div>
                    {receipt.dueDate ? (
                        <div className="mt-1 text-center text-[10px]">
                            Due on{' '}
                            {new Date(String(receipt.dueDate)).toLocaleDateString(
                                'en-PH',
                                { year: 'numeric', month: 'short', day: '2-digit' },
                            )}
                        </div>
                    ) : null}
                    <div className="mt-1 text-center text-[10px]">
                        Present this receipt when paying the balance.
                    </div>
                </div>
            ) : null}

            {/* VAT breakdown */}
            <SectionTitle>VAT details</SectionTitle>
            <div className="space-y-0.5 text-[10px]">
                <Row small label="VATable Sales" value={money(receipt.vatableSales ?? 0)} />
                <Row
                    small
                    label={`VAT${vatRateLabel}`}
                    value={money(receipt.vatAmount ?? 0)}
                />
                <Row
                    small
                    label="VAT-Exempt Sales"
                    value={money(receipt.vatExemptSales ?? 0)}
                />
                <Row
                    small
                    label="Zero-Rated Sales"
                    value={money(receipt.zeroRatedSales ?? 0)}
                />
                {receipt.nonVatSales ? (
                    <Row small label="Non-VAT Sales" value={money(receipt.nonVatSales)} />
                ) : null}
            </div>
            {hasVat ? (
                <div className="mt-1 text-[9px]">
                    V = VATable · E = VAT-exempt · Z = Zero-rated
                </div>
            ) : null}

            {receipt.remarks ? (
                <>
                    <SectionTitle>Remarks</SectionTitle>
                    <div className="whitespace-pre-line break-words text-[10px]">
                        {receipt.remarks}
                    </div>
                </>
            ) : null}

            {receipt.warnings.length ? (
                <>
                    <Divider />
                    {receipt.warnings.map((warning) => (
                        <div key={warning} className="text-[10px]">
                            {warning}
                        </div>
                    ))}
                </>
            ) : null}

            {voided && receipt.voidReason ? (
                <>
                    <SectionTitle>Void</SectionTitle>
                    <div className="space-y-0.5">
                        <Meta label="Reason" value={receipt.voidReason} />
                        <Meta
                            label="Voided at"
                            value={new Date(
                                receipt.voidedAt ?? receipt.completedAt,
                            ).toLocaleString('en-PH')}
                        />
                    </div>
                </>
            ) : null}

            {/* Footer */}
            <Divider className="mt-3" />
            <div className="text-center">
                <div className="font-sans text-[13px] font-extrabold uppercase tracking-[0.15em]">
                    Thank you!
                </div>
                <div className="text-[10px]">
                    Please come again · Keep this receipt for returns or
                    exchanges.
                </div>
                <div className="mt-2">
                    <ReceiptBarcode value={receipt.receiptNumber} />
                </div>
                <div className="mt-0.5 text-[10px] font-semibold tracking-widest">
                    {receipt.receiptNumber}
                </div>
                <div className="mt-2 text-[9px] uppercase tracking-wider">
                    This serves as your official receipt
                </div>
                <div className="text-[9px]">
                    Printed {new Date().toLocaleString('en-PH')}
                </div>
            </div>
        </div>
    )
}

export default POSReceipt
