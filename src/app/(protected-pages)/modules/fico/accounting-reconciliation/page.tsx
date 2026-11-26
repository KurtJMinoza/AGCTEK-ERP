import { Suspense } from 'react'
import AccountingReconciliationPage from '@/modules/fico/pages/AccountingReconciliationPage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountingReconciliationPage />
        </Suspense>
    )
}