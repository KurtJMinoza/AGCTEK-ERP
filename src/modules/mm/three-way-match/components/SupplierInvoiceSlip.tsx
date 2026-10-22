'use client'

import classNames from '@/utils/classNames'
import MmEnterpriseDocumentHeader, {
    type MmDocumentCompanyBlock,
    type MmDocumentPartyBlock,
} from '@/modules/mm/shared/MmEnterpriseDocumentHeader'
import {
    fmtSlipDate,
    fmtSlipMoney,
} from '@/modules/mm/shared/documentSlipUtils'

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
    company?: MmDocumentCompanyBlock | string
    party?: MmDocumentPartyBlock | null
    totalAmount?: number | string
    taxAmount?: number | string
    lines: SupplierInvoiceSlipLine[]
    remarks?: string
}

const MetaItem = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {label}
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
    </div>
)

/** Enterprise supplier invoice document (print-ready). */
const SupplierInvoiceSlip = ({
    data,
    className,
}: {
    data: SupplierInvoiceSlipData
    className?: string
}) => {
    const lineCount = data.lines.length
    const qtyTotal = data.lines.reduce(
        (sum, l) => sum + Number(l.quantity || 0),
        0,
    )

    const company: MmDocumentCompanyBlock =
        typeof data.company === 'string'
            ? { name: data.company }
            : (data.company ?? { name: 'Company' })

    const party: MmDocumentPartyBlock | null =
        data.party ??
        (data.supplier
            ? {
                  title: 'Vendor',
                  name: data.supplier,
                  code: data.supplierCode,
              }
            : null)

    return (
        <article
            className={classNames(
                'mx-auto w-full max-w-[820px] bg-white px-8 py-8 text-gray-900 print:max-w-none print:px-6 print:py-6',
                className,
            )}
        >
            <MmEnterpriseDocumentHeader
                company={company}
                documentTitle="Supplier Invoice"
                documentSubtitle="Accounts payable · Three-way match"
                documentNumber={data.invoiceNumber}
                status={data.status}
                party={party}
            />

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                {data.invoiceDate ? (
                    <MetaItem label="Invoice date" value={fmtSlipDate(data.invoiceDate)} />
                ) : null}
                {data.postingDate ? (
                    <MetaItem label="Posting date" value={fmtSlipDate(data.postingDate)} />
                ) : null}
                {data.matchStatus ? (
                    <MetaItem label="Match status" value={data.matchStatus} />
                ) : null}
                {data.paymentEligible !== undefined ? (
                    <MetaItem
                        label="Payment eligible"
                        value={data.paymentEligible ? 'Yes' : 'No'}
                    />
                ) : null}
                {data.poNumber ? (
                    <MetaItem label="Purchase order" value={data.poNumber} />
                ) : null}
                {data.currency ? (
                    <MetaItem label="Currency" value={data.currency} />
                ) : null}
            </dl>

            <div className="mt-8">
                <div className="mb-2 flex items-end justify-between gap-4">
                    <h2 className="text-sm font-semibold text-gray-900">
                        Invoice lines
                    </h2>
                    <p className="text-xs text-gray-500">
                        {lineCount} line{lineCount === 1 ? '' : 's'} ·{' '}
                        {qtyTotal.toLocaleString()} total qty
                    </p>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                <th className="px-3 py-2.5">#</th>
                                <th className="px-3 py-2.5">Material</th>
                                <th className="px-3 py-2.5 text-right">Qty</th>
                                <th className="px-3 py-2.5">UoM</th>
                                <th className="px-3 py-2.5 text-right">Unit price</th>
                                <th className="px-3 py-2.5 text-right">Tax</th>
                                <th className="px-3 py-2.5 text-right">Line total</th>
                                <th className="px-3 py-2.5">GR ref</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.lines.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-3 py-8 text-center text-sm text-gray-500"
                                    >
                                        No invoice lines recorded.
                                    </td>
                                </tr>
                            ) : (
                                data.lines.map((line, idx) => {
                                    const code = line.materialCode ?? ''
                                    const name =
                                        line.materialName ?? 'Material'
                                    return (
                                        <tr
                                            key={`${code}-${name}-${idx}`}
                                            className="border-b border-gray-100 last:border-0"
                                        >
                                            <td className="px-3 py-2.5 text-gray-500">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {code ? (
                                                    <span className="block font-mono text-xs text-gray-500">
                                                        {code}
                                                    </span>
                                                ) : null}
                                                <span className="font-medium text-gray-900">
                                                    {name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                {Number(line.quantity).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-600">
                                                {line.uom ?? '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                {line.unitPrice !== undefined
                                                    ? fmtSlipMoney(
                                                          line.unitPrice,
                                                          data.currency,
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                                                {line.taxAmount !== undefined &&
                                                Number(line.taxAmount) > 0
                                                    ? fmtSlipMoney(
                                                          line.taxAmount,
                                                          data.currency,
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                                                {line.lineTotal !== undefined
                                                    ? fmtSlipMoney(
                                                          line.lineTotal,
                                                          data.currency,
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-gray-600">
                                                {line.grDocument ?? '—'}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                        {(data.taxAmount !== undefined ||
                            data.totalAmount !== undefined) &&
                        data.lines.length > 0 ? (
                            <tfoot>
                                {data.taxAmount !== undefined ? (
                                    <tr className="border-t border-gray-200 bg-gray-50/80">
                                        <td
                                            colSpan={6}
                                            className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500"
                                        >
                                            Tax total
                                        </td>
                                        <td
                                            colSpan={2}
                                            className="px-3 py-2 text-right font-medium tabular-nums"
                                        >
                                            {fmtSlipMoney(
                                                data.taxAmount,
                                                data.currency,
                                            )}
                                        </td>
                                    </tr>
                                ) : null}
                                {data.totalAmount !== undefined ? (
                                    <tr className="border-t border-gray-200 bg-gray-50">
                                        <td
                                            colSpan={6}
                                            className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-gray-700"
                                        >
                                            Invoice total
                                        </td>
                                        <td
                                            colSpan={2}
                                            className="px-3 py-2.5 text-right text-base font-semibold tabular-nums"
                                        >
                                            {fmtSlipMoney(
                                                data.totalAmount,
                                                data.currency,
                                            )}
                                        </td>
                                    </tr>
                                ) : null}
                            </tfoot>
                        ) : null}
                    </table>
                </div>
            </div>

            {data.remarks ? (
                <section className="mt-6 rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Remarks / vendor reference
                    </h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                        {data.remarks}
                    </p>
                </section>
            ) : null}

            <footer className="mt-10 grid grid-cols-1 gap-8 border-t border-gray-200 pt-6 sm:grid-cols-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Verified by
                    </p>
                    <div className="mt-8 border-b border-gray-400" />
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Approved by
                    </p>
                    <div className="mt-8 border-b border-gray-400" />
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Date
                    </p>
                    <div className="mt-8 border-b border-gray-400" />
                </div>
            </footer>

            <p className="mt-6 text-center text-[10px] text-gray-400">
                System document · {data.invoiceNumber}
            </p>
        </article>
    )
}

export default SupplierInvoiceSlip
