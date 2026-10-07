'use client'

import Table from '@/components/ui/Table'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import { crmTone, decimal, formatDate, formatEnumLabel, formatMoney } from '../../utils/format'
import type { Quotation } from '../../types'

const { THead, TBody, Tr, Th, Td } = Table

export const quotationLabel = (q: Pick<Quotation, 'quotationNumber' | 'revision'>) =>
    `${q.quotationNumber} rev ${q.revision}`

export function QuotationStatusBadge({ quotation }: { quotation: Pick<Quotation, 'effectiveStatus'> }) {
    return (
        <StatusBadge tone={crmTone(quotation.effectiveStatus)}>
            {formatEnumLabel(quotation.effectiveStatus)}
        </StatusBadge>
    )
}

/** Number, status, total and validity on one line. */
export function QuotationHeadline({ quotation }: { quotation: Quotation }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{quotationLabel(quotation)}</span>
            <QuotationStatusBadge quotation={quotation} />
            <span className="font-semibold">
                {formatMoney(decimal(quotation.totalAmount), quotation.currency)}
            </span>
            {quotation.validUntil ? (
                <span className="text-xs text-gray-500">valid until {formatDate(quotation.validUntil)}</span>
            ) : null}
        </div>
    )
}

/** Read-only lines as SD priced them. `highlight` marks line numbers (e.g. changed prices). */
export function QuotationLinesTable({
    quotation,
    highlight,
}: {
    quotation: Quotation
    highlight?: ReadonlySet<number>
}) {
    const issues = new Map(quotation.lineIssues.map((i) => [i.lineNumber, i.reason]))
    return (
        <Table compact hoverable={false}>
            <THead>
                <Tr>
                    <Th>#</Th>
                    <Th>Product</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit price</Th>
                    <Th className="text-right">Total</Th>
                </Tr>
            </THead>
            <TBody>
                {quotation.lines.map((line) => (
                    <Tr
                        key={line.id}
                        className={classNames(
                            (highlight?.has(line.lineNumber) || issues.has(line.lineNumber)) &&
                                'bg-amber-50 dark:bg-amber-500/10',
                        )}
                    >
                        <Td>{line.lineNumber}</Td>
                        <Td>
                            <div className="font-medium">{line.sku}</div>
                            <div className="text-xs text-gray-500">{line.description}</div>
                            {issues.has(line.lineNumber) ? (
                                <div className="text-xs text-amber-700 dark:text-amber-300">
                                    {issues.get(line.lineNumber) === 'INACTIVE'
                                        ? 'Product is inactive in the SD catalog'
                                        : 'Product no longer exists in the SD catalog'}
                                </div>
                            ) : null}
                        </Td>
                        <Td className="text-right">{Number(line.quantity)}</Td>
                        <Td className="text-right">{formatMoney(decimal(line.unitPrice), quotation.currency)}</Td>
                        <Td className="text-right">{formatMoney(decimal(line.lineTotal), quotation.currency)}</Td>
                    </Tr>
                ))}
            </TBody>
        </Table>
    )
}
