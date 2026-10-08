'use client'

import QuotationPage from '@/modules/crm/pages/QuotationPage'

/** `/quotations/new` is a static segment, so the compose state is passed explicitly. */
export default function NewQuotationPage() {
    return <QuotationPage quotationId="new" />
}