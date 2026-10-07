import Dashboard from '@/modules/crm/pages/Dashboard'
import { requireRead } from '@/server/actions/permissions/getMyPermissions'

export default async function Page() {
    await requireRead('crm.dashboard')
    return <Dashboard />
}
