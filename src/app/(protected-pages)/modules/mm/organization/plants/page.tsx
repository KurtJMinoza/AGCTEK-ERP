import { redirect } from 'next/navigation'

/** Plants removed from org model — legacy route. */
export default function OrganizationPlantsRedirect() {
    redirect('/modules/mm/organization/branches')
}
