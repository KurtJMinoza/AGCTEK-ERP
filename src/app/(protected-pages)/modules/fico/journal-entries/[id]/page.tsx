import { Suspense } from 'react'
import JournalEntryDetailsPage from '@/modules/fico/pages/JournalEntryDetailsPage'

export const metadata = {
    title: 'Journal Entry | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <JournalEntryDetailsPage />
        </Suspense>
    )
}