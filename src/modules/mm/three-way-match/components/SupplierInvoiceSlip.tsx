'use client'

import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'

export type SupplierInvoiceSlipLine = {
    materialCode?: string
    materialName?: string
    quantity: number | string
    uom?: string
    unitPrice?: number | string
    lineTotal?: number | string
    taxAmount?: number | string
    grDocument?: string
}

export type SupplierInvoiceSlipData = {
    invoiceNumber: string
    status?: string
    matchStatus?: string | null
    paymentEligible?: boolean
    invoiceDate?: string
    postingDate?: string | null
    supplier?: string
    supplierCode?: string
    poNumber?: string
    currency?: string
    company?: string
    totalAmount?: number | string
    taxAmount?: number | string
    lines: SupplierInvoiceSlipLine[]
    remarks?: string
}

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
        <span className="text-right">{value}</span>
    </div>
)

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function fmtMoney(n: number | string | null | undefined, currency?: string) {
    const num = Number(n || 0)
    const s = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return currency ? `${currency} ${s}` : s
}

/** Vendor invoice slip — same print style as goods receipt. */
const SupplierInvoiceSlip = ({
    data,
    className,
}: {
    data: SupplierInvoiceSlipData
    className?: string
}) => {
    const lineCount = data.lines.length
    const qtyTotal = data.lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0)

    return (
        <div
            className={classNames(
                'mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-xs leading-snug text-black',
                className,
            )}
        >
            <div className="text-center">
                <div className="text-sm font-bold uppercase">{AWIC_BRAND.shortName}</div>
                <div className="text-[10px]">{AWIC_BRAND.fullName}</div>
                <div className="mt-2 text-sm font-bold">SUPPLIER INVOICE</div>
                <div className="text-[10px]">Accounts payable / three-way match</div>
            </div>
            <Divider />
            <Row label="Invoice #" value={data.invoiceNumber} bold />
            {data.status ? <Row label="Status" value={data.status} /> : null}
            {data.matchStatus ? <Row label="Match" value={data.matchStatus} /> : null}
            {data.paymentEligible !== undefined ? (
                <Row label="Pay eligible" value={data.paymentEligible ? 'Yes' : 'No'} />
            ) : null}
            {data.invoiceDate ? <Row label="Invoice date" value={fmtDate(data.invoiceDate)} /> : null}
            {data.postingDate ? <Row label="Posting" value={fmtDate(data.postingDate)} /> : null}
            {data.company ? <Row label="Company" value={data.company} /> : null}
            {data.supplier ? <Row label="Supplier" value={data.supplier} /> : null}
            {data.poNumber ? <Row label="PO #" value={data.poNumber} /> : null}
            <Divider />
            {data.lines.map((line, idx) => {
                const code = line.materialCode ?? ''
                const name = line.materialName ?? 'Material'
                const label = code ? `${code} — ${name}` : name
                return (
                    <div key={`${label}-${idx}`} className="mb-2">
                        <div className="break-words font-semibold">{label}</div>
                        <Row
                            label="Qty"
                            value={`${line.quantity} ${line.uom ?? ''}`.trim()}
                        />
                        {line.unitPrice !== undefined ? (
                            <Row label="Unit price" value={fmtMoney(line.unitPrice, data.currency)} />
                        ) : null}
                        {line.taxAmount !== undefined && Number(line.taxAmount) > 0 ? (
                            <Row label="Tax" value={fmtMoney(line.taxAmount, data.currency)} />
                        ) : null}
                        {line.lineTotal !== undefined ? (
                            <Row label="Line total" value={fmtMoney(line.lineTotal, data.currency)} bold />
                        ) : null}
                        {line.grDocument ? (
                            <div className="text-[10px] text-gray-700">GR: {line.grDocument}</div>
                        ) : null}
                    </div>
                )
            })}
            <Divider />
            <Row label={`Lines (${lineCount})`} value={`${qtyTotal} total qty`} bold />
            {data.taxAmount !== undefined ? (
                <Row label="Tax total" value={fmtMoney(data.taxAmount, data.currency)} />
            ) : null}
            {data.totalAmount !== undefined ? (
                <Row label="Invoice total" value={fmtMoney(data.totalAmount, data.currency)} bold />
            ) : null}
            {data.remarks ? (
                <>
                    <Divider />
                    <div className="text-[10px]">
                        <div className="font-bold">Remarks / vendor ref</div>
                        <div className="mt-0.5 whitespace-pre-wrap">{data.remarks}</div>
                    </div>
                </>
            ) : null}
            <Divider />
            <div className="text-center text-[10px]">
                <div>Verified by: ___________________</div>
                <div className="mt-2">Approved by: ___________________</div>
                <div className="mt-2">Date / time: ___________________</div>
                <div className="mt-3">{data.invoiceNumber}</div>
            </div>
        </div>
    )
}

export default SupplierInvoiceSlip
