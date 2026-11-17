import { redirect } from 'next/navigation'

/** Documents moved to CRM › Emails; keep old CRM links working. */
export default function CrmDocumentsRedirect() {
    redirect('/emails')
}
