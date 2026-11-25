import { Suspense } from 'react'
import OpeningBalancesPage from '@/modules/fico/pages/OpeningBalancesPage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <OpeningBalancesPage />
        </Suspense>
    )
}