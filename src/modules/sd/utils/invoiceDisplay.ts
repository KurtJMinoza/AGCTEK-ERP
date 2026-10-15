import type { StatusTone } from '@/components/shared/StatusBadge'
import type { BillingStatus } from '../services/invoiceService'

export const BILLING_ROUTE = '/modules/sd/billing'

export const invoiceDocumentHref = (invoiceId: string) =>
    `${BILLING_ROUTE}/${encodeURIComponent(invoiceId)}`

export const salesOrderHref = (orderNumber: string) =>
    `/modules/sd/sales-orders?search=${encodeURIComponent(orderNumber)}`

export const BILLING_STATUS_META: Record<
    BillingStatus | 'DRAFT',
    { label: string; tone: StatusTone }
> = {
    DRAFT: { label: 'Draft', tone: 'default' },
    UNPAID: { label: 'Unpaid', tone: 'warning' },
    OVERDUE: { label: 'Overdue', tone: 'danger' },
    PAID: { label: 'Paid', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'default' },
    REFUNDED: { label: 'Refunded', tone: 'default' },
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
    COD: 'Cash on delivery',
    CARD_DEMO: 'Card (demo)',
    WALLET_DEMO: 'E-wallet (demo)',
    QR_DEMO: 'QR (demo)',
    BANK_TRANSFER_DEMO: 'Bank transfer (demo)',
    CASH: 'Cash',
}

export const paymentMethodLabel = (method: string | null) =>
    method ? (PAYMENT_METHOD_LABEL[method] ?? method) : null

export const paymentTone = (status: string | null): StatusTone => {
    switch (status) {
        case 'Paid':
        case 'Verified':
            return 'success'
        case 'Failed':
        case 'Cancelled':
            return 'danger'
        case 'Refunded':
            return 'info'
        case null:
            return 'default'
        default:
            return 'warning'
    }
}

export const formatMoney = (value: string | number, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(
        Number(value) || 0,
    )

export const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : null

export const formatDateTime = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : null
