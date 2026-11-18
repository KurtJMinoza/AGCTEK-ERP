import * as XLSX from 'xlsx'
import {
    salesPaymentMethodLabel,
    type SalesLineReportRow,
} from '../services/salesAnalyticsService'

const money = (value: number) =>
    Number.isFinite(value) ? Number(value.toFixed(2)) : 0

/** Download the filtered complete sales line report as an Excel workbook. */
export function downloadSalesLineReportExcel(
    rows: SalesLineReportRow[],
    periodLabel?: string,
) {
    const sheetRows = rows.map((row) => ({
        'Customer name': row.customerName,
        Channel: row.salesChannel,
        Location: row.location,
        Barcode: row.barcode,
        'Account title': row.accountTitle,
        Particular: row.particular,
        Qty: money(row.quantity),
        UOM: row.uom,
        'Unit cost': money(row.unitCost),
        'Total cost': money(row.totalCost),
        SRP: money(row.srp),
        Sales: money(row.sales),
        Discount: money(row.discount),
        Subtotal: money(row.subtotal),
        'Total sales': money(row.totalSales),
        'Sales type': row.salesType,
        'Paid status': row.paidStatus || 'Unpaid',
        'Balance due': money(row.balanceDue ?? 0),
        'Payment method': row.paymentMethod
            ? salesPaymentMethodLabel(row.paymentMethod)
            : '',
        'Payment breakdown': (row.payments ?? [])
            .map(
                (payment) =>
                    `${salesPaymentMethodLabel(payment.method)} ${money(payment.amount).toFixed(2)}${payment.reference ? ` (Ref ${payment.reference})` : ''}`,
            )
            .join(' + '),
        'Invoice type': row.invoiceType,
        'Invoice number': row.invoiceNumber,
        'Order number': row.orderNumber,
        'Sold at': row.createdAt
            ? new Date(row.createdAt).toLocaleString('en-PH')
            : '',
        Remarks: row.remarks || '',
    }))

    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(sheetRows)
    sheet['!cols'] = Object.keys(sheetRows[0] ?? { A: '' }).map((key) => ({
        wch: Math.min(36, Math.max(12, key.length + 2)),
    }))
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sales lines')

    const stamp = new Date().toISOString().slice(0, 10)
    const period = (periodLabel ?? 'sales')
        .replace(/[^\w\-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60)
    XLSX.writeFile(workbook, `sales-line-report-${period}-${stamp}.xlsx`)
}
