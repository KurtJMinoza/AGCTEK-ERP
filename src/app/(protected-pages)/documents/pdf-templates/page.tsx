import { redirect } from 'next/navigation'

/** PDF templates removed; CRM › Emails is the retained entry. */
export default function DocumentsPdfTemplatesRedirect() {
    redirect('/emails')
}
