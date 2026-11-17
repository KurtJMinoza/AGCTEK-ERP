import { redirect } from 'next/navigation'

/** Account Determination is a tab of the G/L Accounts workspace. */
export default function Page() {
    redirect('/modules/fico/gl-accounts?tab=determination')
}
