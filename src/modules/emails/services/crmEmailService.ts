import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type CrmEmailFolder = 'sent' | 'drafts' | 'starred' | 'inbox' | 'spam'

export type CrmEmailAttachment = {
    id: string
    kind: 'QUOTATION_PDF' | 'UPLOAD'
    fileName: string
    mimeType: string | null
    byteSize: number
    quotationDocumentId: string | null
    createdAt: string
}

export type CrmEmailMessage = {
    id: string
    direction: string
    status: 'DRAFT' | 'SENT' | 'FAILED' | 'RECEIVED' | string
    toEmail: string
    toName: string | null
    fromEmail: string | null
    subject: string
    bodyText: string
    bodyHtml: string | null
    customerId: string | null
    customer: { id: string; companyName: string; email: string } | null
    opportunityId: string | null
    opportunity: { id: string; name: string } | null
    quotationId: string | null
    quotationRevision: number | null
    quotation: {
        id: string
        quotationNumber: string
        revision: number
        status: string
    } | null
    templateKey: string | null
    starred: boolean
    isSpam: boolean
    provider: string | null
    receivedAt: string | null
    sentAt: string | null
    lastError: string | null
    createdAt: string
    updatedAt: string
    attachments: CrmEmailAttachment[]
    delivery?: {
        sent: boolean
        error?: string
        skippedReason?: string
        to?: string
        subject?: string
    }
}

export type CrmEmailInboundSyncResult = {
    fetched: number
    imported: number
    skipped: number
}

export type UpsertCrmEmailDraftInput = {
    id?: string
    toEmail: string
    toName?: string
    subject?: string
    bodyText?: string
    bodyHtml?: string
    customerId?: string
    opportunityId?: string
    quotationId?: string
    templateKey?: string
}

export async function listCrmEmails(
    folder: CrmEmailFolder = 'sent',
    options?: { q?: string },
) {
    const { data } = await ErpAxiosBase.get<CrmEmailMessage[]>('/crm/emails', {
        params: {
            folder,
            ...(options?.q?.trim() ? { q: options.q.trim() } : {}),
        },
    })
    return data
}

export async function setCrmEmailStarred(id: string, starred: boolean) {
    const { data } = await ErpAxiosBase.patch<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}/star`,
        { starred },
    )
    return data
}

export async function setCrmEmailSpam(id: string, isSpam: boolean) {
    const { data } = await ErpAxiosBase.patch<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}/spam`,
        { isSpam },
    )
    return data
}

export async function syncCrmEmailInbound() {
    const { data } = await ErpAxiosBase.post<CrmEmailInboundSyncResult>(
        '/crm/emails/inbound/sync',
    )
    return data
}

export async function getCrmEmail(id: string) {
    const { data } = await ErpAxiosBase.get<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}`,
    )
    return data
}

export async function upsertCrmEmailDraft(body: UpsertCrmEmailDraftInput) {
    const { data } = await ErpAxiosBase.post<CrmEmailMessage>(
        '/crm/emails/drafts',
        body,
    )
    return data
}

export async function updateCrmEmailDraft(
    id: string,
    body: Partial<UpsertCrmEmailDraftInput>,
) {
    const { data } = await ErpAxiosBase.patch<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}`,
        body,
    )
    return data
}

export async function uploadCrmEmailAttachment(
    id: string,
    body: { fileName: string; mimeType?: string; contentBase64: string },
) {
    const { data } = await ErpAxiosBase.post<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}/attachments`,
        body,
    )
    return data
}

export async function removeCrmEmailAttachment(
    id: string,
    attachmentId: string,
) {
    const { data } = await ErpAxiosBase.delete<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    )
    return data
}

export async function sendCrmEmail(id: string) {
    const { data } = await ErpAxiosBase.post<CrmEmailMessage>(
        `/crm/emails/${encodeURIComponent(id)}/send`,
    )
    return data
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = String(reader.result ?? '')
            const base64 = result.includes(',') ? result.split(',')[1] : result
            resolve(base64)
        }
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
        reader.readAsDataURL(file)
    })
}
