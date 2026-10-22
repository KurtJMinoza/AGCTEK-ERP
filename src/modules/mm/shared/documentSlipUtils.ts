import type { MmDocumentCompanyBlock, MmDocumentPartyBlock } from './MmEnterpriseDocumentHeader'

export function fmtSlipDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export function fmtSlipMoney(
    n: number | string | null | undefined,
    currency?: string,
) {
    const num = Number(n || 0)
    const s = num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    return currency ? `${currency} ${s}` : s
}

export function companyFromApi(
    company?:
        | {
              name?: string | null
              code?: string | null
              logoUrl?: string | null
              address?: string | null
              tin?: string | null
          }
        | null,
    fallbackName?: string,
): MmDocumentCompanyBlock {
    return {
        name: company?.name ?? fallbackName ?? 'Company',
        legalName: company?.name,
        logoUrl: company?.logoUrl,
        code: company?.code,
        address: company?.address,
        tin: company?.tin,
    }
}

export function supplierPartyFromApi(
    supplier?:
        | {
              supplierName?: string | null
              supplierCode?: string | null
              name?: string | null
              code?: string | null
              billingAddress?: string | null
              shippingAddress?: string | null
              taxId?: string | null
              email?: string | null
              phone?: string | null
          }
        | null,
): MmDocumentPartyBlock | null {
    if (!supplier) return null
    const name =
        supplier.supplierName ?? supplier.name ?? supplier.supplierCode ?? ''
    if (!name.trim()) return null
    return {
        title: 'Supplier',
        name,
        code: supplier.supplierCode ?? supplier.code,
        address: supplier.billingAddress ?? supplier.shippingAddress,
        taxId: supplier.taxId,
        email: supplier.email,
        phone: supplier.phone,
    }
}
