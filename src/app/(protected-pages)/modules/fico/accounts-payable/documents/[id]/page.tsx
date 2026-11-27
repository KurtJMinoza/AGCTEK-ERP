import { Suspense } from 'react'
import AccountsPayableDocumentPage from '@/modules/fico/pages/AccountsPayableDocumentPage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountsPayableDocumentPage />
        </Suspense>
    )
}