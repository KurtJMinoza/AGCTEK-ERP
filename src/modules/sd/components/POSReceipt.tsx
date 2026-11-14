import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import type { PosReceipt as PosReceiptData } from '../services/posService'
import { branchLabel } from '../catalogs/branchCatalog'

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

const Divider = () => (
    <div className="my-2 border-t border-dashed border-black" />
)

const Row = ({
    label,
    value,
    bold,
}: {
    label: string
    value: string
    bold?: boolean
}) => (
    <div className={classNames('flex justify-between gap-2', bold && 'font-bold')}>
        <span>{label}</span>
        <span>{value}</span>
    </div>
)

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
    'Pending Verification': 'Pending verification',
    Authorized: 'Authorized (receivable)',
    Failed: 'Failed',
    Cancelled: 'Cancelled',
    Refunded: 'Refunded',
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

    return (
        <div
            className={classNames(
                'mx-auto w-full max-w-[300px] bg-white p-3 font-mono text-xs leading-snug text-black',
                className,
            )}
        >
            <div className="text-center">
                <div className="text-sm font-bold uppercase">
                    {AWIC_BRAND.shortName}
                </div>
                <div>{AWIC_BRAND.fullName}</div>
                <div className="mt-1">OFFICIAL RECEIPT</div>
                {voided ? (
                    <div className="mt-1 border border-black px-2 py-0.5 text-sm font-bold uppercase">
                        VOIDED
                    </div>
                ) : null}
            </div>
            <Divider />
            <Row label="Branch" value={branchLabel(receipt.branchId, branchName)} />
            <Row label="Receipt #" value={receipt.receiptNumber} />
            <Row label="Order #" value={receipt.orderNumber} />
            <Row label="Date" value={completedAt.toLocaleDateString('en-PH')} />
            <Row label="Time" value={completedAt.toLocaleTimeString('en-PH')} />
            {receipt.cashierUserId || cashierName ? (
                <Row
                    label="Cashier"
                    value={cashierName ?? receipt.cashierUserId ?? '—'}
                />
            ) : null}
            {terminalCode ? (
                <Row label="Register" value={terminalCode} />
            ) : null}
            {receipt.customerName ? (
                <Row label="Customer" value={receipt.customerName} />
            ) : null}
            <Divider />
            {receipt.lines.map((line, index) => (
                <div key={`${line.sku}-${index}`} className="mb-1.5">
                    <div className="break-words">
                        {line.description ?? line.sku}
                    </div>
                    {line.variantName ? (
                        <div className="break-words text-[10px]">
                            Variant: {line.variantName}
                        </div>
                    ) : null}
                    {line.barcode ? (
                        <div className="break-words text-[10px]">
                            Barcode: {line.barcode}
                        </div>
                    ) : null}
                    <Row
                        label={`  ${line.quantity} x ${money(line.unitPrice)}`}
                        value={`${money(line.lineTotal)} ${VAT_CODE[line.taxClassification ?? ''] ?? ' '}`}
                    />
                </div>
            ))}
            <Divider />
            <Row
                label={`Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})`}
                value={money(receipt.subtotal)}
            />
            {receipt.discountAmount ? (
                <Row label="Discount" value={`-${money(receipt.discountAmount)}`} />
            ) : null}
            {receipt.taxAmount ? (
                <Row label="VAT (added)" value={money(receipt.taxAmount)} />
            ) : null}
            <Row label="TOTAL" value={`PHP ${money(receipt.total)}`} bold />
            <Divider />
            <Row label="VATable Sales" value={money(receipt.vatableSales ?? 0)} />
            <Row label={`VAT${vatRateLabel}`} value={money(receipt.vatAmount ?? 0)} />
            <Row label="VAT-Exempt Sales" value={money(receipt.vatExemptSales ?? 0)} />
            <Row label="Zero-Rated Sales" value={money(receipt.zeroRatedSales ?? 0)} />
            {receipt.nonVatSales ? (
                <Row label="Non-VAT Sales" value={money(receipt.nonVatSales)} />
            ) : null}
            {hasVat ? (
                <div className="mt-1 text-[10px]">V = VATable · E = VAT-exempt · Z = Zero-rated</div>
            ) : null}
            <Divider />
            {receipt.tenders.map((tender, index) => (
                <div key={`${tender.method}-${index}`} className="mb-1">
                    <Row
                        label={TENDER_LABEL[tender.method] ?? tender.method}
                        value={money(tender.amount)}
                    />
                    {tender.referenceNumber ? (
                        <div className="break-words text-[10px]">
                            Ref: {tender.referenceNumber}
                        </div>
                    ) : null}
                    {tender.status && tender.status !== 'Paid' ? (
                        <div className="text-[10px] font-semibold uppercase">
                            {TENDER_STATUS[tender.status] ?? tender.status}
                        </div>
                    ) : null}
                    {tender.changeAmount ? (
                        <div className="text-[10px]">
                            Change: {money(tender.changeAmount)}
                        </div>
                    ) : null}
                </div>
            ))}
            <Row label="Tendered" value={money(receipt.tendered)} />
            <Row label="Change" value={money(receipt.change)} />
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
            <Divider />
            {voided && receipt.voidReason ? (
                <>
                    <Row label="Void reason" value={receipt.voidReason} />
                    <Row
                        label="Voided at"
                        value={new Date(
                            receipt.voidedAt ?? receipt.completedAt,
                        ).toLocaleString('en-PH')}
                    />
                    <Divider />
                </>
            ) : null}
            <div className="text-center">
                <div>Thank you for shopping!</div>
                <div className="mt-1 text-[10px]">{receipt.receiptNumber}</div>
            </div>
        </div>
    )
}

export default POSReceipt
