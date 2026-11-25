import { Suspense } from 'react'
import JournalEntryFormPage from '@/modules/fico/pages/JournalEntryFormPage'

export const metadata = {
    title: 'New Journal Entry | FICO | AGCTEK ERP',
}

export default function Page() {
    return (
        <Suspense fallback={null}>
            <JournalEntryFormPage />
        </Suspense>
    )
}