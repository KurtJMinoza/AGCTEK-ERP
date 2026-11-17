import { redirect } from 'next/navigation'

/** Transaction - FICO Posting Monitor is a tab of the G/L Accounts workspace. */
export default function Page() {
    redirect('/modules/fico/gl-accounts?tab=events')
}
