import { Suspense } from 'react'
import AccountsReceivableDetailPage from '@/modules/fico/pages/AccountsReceivableDetailPage'

export const metadata = {
    title: 'AR Document | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountsReceivableDetailPage />
        </Suspense>
    )
}
