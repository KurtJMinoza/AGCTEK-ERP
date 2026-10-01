import { redirect } from 'next/navigation'

/** Planning horizon is a parameter of the Demand Plan, not a separate page. */
export default function PlanningHorizonsRedirect() {
    redirect('/scm/demand-planning')
}
