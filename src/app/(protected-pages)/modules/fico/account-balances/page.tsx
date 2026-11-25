import { Suspense } from 'react'
import AccountBalancesPage from '@/modules/fico/pages/AccountBalancesPage'

export const metadata = {
    title: 'Account Balances | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AccountBalancesPage />
        </Suspense>
    )
}