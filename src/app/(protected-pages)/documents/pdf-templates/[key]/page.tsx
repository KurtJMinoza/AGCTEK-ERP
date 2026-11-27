import { redirect } from 'next/navigation'

/** PDF layout editor removed. */
export default function DocumentsPdfLayoutRedirect() {
    redirect('/emails')
}
