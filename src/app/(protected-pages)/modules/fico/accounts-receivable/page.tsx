import { Suspense } from 'react'
import AccountsReceivablePage from '@/modules/fico/pages/AccountsReceivablePage'

export const metadata = {
    title: 'AR Open Items | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountsReceivablePage />
        </Suspense>
    )
}
