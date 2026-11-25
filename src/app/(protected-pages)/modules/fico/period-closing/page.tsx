import { Suspense } from 'react'
import PeriodClosingPage from '@/modules/fico/pages/PeriodClosingPage'

export default function Page() {
    return (
        <Suspense fallback={null}>
            <PeriodClosingPage />
        </Suspense>
    )
}