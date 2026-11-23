import ActivityCalendar from '@/modules/crm/pages/ActivityCalendar'
import { requireRead } from '@/server/actions/permissions/getMyPermissions'

export default async function Page() {
    await requireRead('crm.activities')
    return <ActivityCalendar />
}
