import { Suspense } from 'react'
import AccountsReceivablePage from '@/modules/fico/pages/AccountsReceivablePage'

export const metadata = {
    title: 'Accounts Receivable | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountsReceivablePage />
        </Suspense>
    )
}
