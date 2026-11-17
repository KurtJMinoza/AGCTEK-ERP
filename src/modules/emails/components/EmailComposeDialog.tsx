'use client'

import { useEffect, useRef, useState } from 'react'
import {
    HiOutlineChevronDown,
    HiOutlineMail,
    HiOutlinePaperClip,
    HiOutlineTemplate,
    HiOutlineX,
} from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import classNames from '@/components/ui/utils/classNames'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { getCustomers } from '@/modules/sd/services/customerMasterService'
import {
    listQuotations,
    listQuotationEmailTemplates,
    type Quotation,
    type QuotationEmailTemplate,
} from '@/modules/sd/services/quotationService'
import {
    fileToBase64,
    removeCrmEmailAttachment,
    sendCrmEmail,
    updateCrmEmailDraft,
    uploadCrmEmailAttachment,
    upsertCrmEmailDraft,
    type CrmEmailMessage,
} from '../services/crmEmailService'

type EmailComposeDialogProps = {
    open: boolean
    initial?: CrmEmailMessage | null
    onClose: () => void
    onSaved: () => void
}

const selectClass =
    'w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800'

const iconButtonClass =
    'rounded-full p-1.5 text-gray-500 transition hover:bg-gray-200/80 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700'

/** Mail-client style compose window (aligned with QuotationEmailComposer chrome). */
export default function EmailComposeDialog({
    open,
    initial,
    onClose,
    onSaved,
}: EmailComposeDialogProps) {
    const [draftId, setDraftId] = useState<string | null>(null)
    const [toEmail, setToEmail] = useState('')
    const [toName, setToName] = useState('')
    const [customerId, setCustomerId] = useState('')
    const [quotationId, setQuotationId] = useState('')
    const [templateKey, setTemplateKey] = useState('')
    const [subject, setSubject] = useState('')
    const [bodyText, setBodyText] = useState('')
    const [templates, setTemplates] = useState<QuotationEmailTemplate[]>([])
    const [quotations, setQuotations] = useState<Quotation[]>([])
    const [customers, setCustomers] = useState<
        { id: string; companyName: string; email: string }[]
    >([])
    const [attachments, setAttachments] = useState<CrmEmailMessage['attachments']>(
        [],
    )
    const [saving, setSaving] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [linksOpen, setLinksOpen] = useState(false)
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        setError(null)
        setTemplateMenuOpen(false)
        setDraftId(initial?.id ?? null)
        setToEmail(initial?.toEmail ?? '')
        setToName(initial?.toName ?? '')
        setCustomerId(initial?.customerId ?? '')
        setQuotationId(initial?.quotationId ?? '')
        setTemplateKey(initial?.templateKey ?? '')
        setSubject(initial?.subject ?? '')
        setBodyText(initial?.bodyText ?? '')
        setAttachments(initial?.attachments ?? [])
        setLinksOpen(
            Boolean(initial?.customerId || initial?.quotationId || initial?.templateKey),
        )

        Promise.all([
            listQuotationEmailTemplates().catch(() => []),
            listQuotations({ limit: 100 }).catch(() => []),
            getCustomers().catch(() => []),
        ]).then(([templateRows, quoteRows, customerRows]) => {
            setTemplates(templateRows.filter((t) => t.isActive))
            setQuotations(
                quoteRows.filter((q) =>
                    ['SENT', 'ACCEPTED'].includes(q.effectiveStatus),
                ),
            )
            setCustomers(
                customerRows.map((c) => ({
                    id: c.id,
                    companyName: c.companyName,
                    email: c.email,
                })),
            )
        })
    }, [open, initial])

    useEffect(() => {
        if (!templateMenuOpen) return
        const onDoc = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setTemplateMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
    }, [templateMenuOpen])

    const persist = async () => {
        if (!toEmail.trim()) {
            setError('Recipient email is required.')
            return null
        }
        setSaving(true)
        setError(null)
        try {
            const payload = {
                id: draftId ?? undefined,
                toEmail: toEmail.trim(),
                toName: toName.trim() || undefined,
                subject,
                bodyText,
                customerId: customerId || undefined,
                quotationId: quotationId || undefined,
                templateKey: templateKey || undefined,
            }
            const saved = draftId
                ? await updateCrmEmailDraft(draftId, payload)
                : await upsertCrmEmailDraft(payload)
            setDraftId(saved.id)
            setAttachments(saved.attachments)
            return saved
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not save draft'))
            return null
        } finally {
            setSaving(false)
        }
    }

    const onSaveDraft = async () => {
        const saved = await persist()
        if (saved) {
            onSaved()
            onClose()
        }
    }

    const onSend = async () => {
        const saved = await persist()
        if (!saved) return
        setSending(true)
        setError(null)
        try {
            const result = await sendCrmEmail(saved.id)
            if (result.delivery && !result.delivery.sent) {
                setError(
                    result.delivery.error ??
                        result.delivery.skippedReason ??
                        'Email was not delivered.',
                )
                onSaved()
                return
            }
            onSaved()
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not send email'))
            onSaved()
        } finally {
            setSending(false)
        }
    }

    const onPickFiles = async (files: FileList | null) => {
        if (!files?.length) return
        let id = draftId
        if (!id) {
            const saved = await persist()
            if (!saved) return
            id = saved.id
        }
        setSaving(true)
        setError(null)
        try {
            let current = await updateCrmEmailDraft(id, {
                toEmail: toEmail.trim(),
                subject,
                bodyText,
            })
            for (const file of Array.from(files)) {
                const contentBase64 = await fileToBase64(file)
                current = await uploadCrmEmailAttachment(id, {
                    fileName: file.name,
                    mimeType: file.type || undefined,
                    contentBase64,
                })
            }
            setAttachments(current.attachments)
            onSaved()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not upload file'))
        } finally {
            setSaving(false)
        }
    }

    const onRemoveUpload = async (attachmentId: string) => {
        if (!draftId) return
        setSaving(true)
        setError(null)
        try {
            const updated = await removeCrmEmailAttachment(draftId, attachmentId)
            setAttachments(updated.attachments)
            onSaved()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not remove attachment'))
        } finally {
            setSaving(false)
        }
    }

    const applyTemplate = (key: string) => {
        setTemplateKey(key)
        setTemplateMenuOpen(false)
        const template = templates.find((t) => t.key === key)
        if (!template) return
        setSubject(template.subject)
        setBodyText(template.bodyText)
    }

    const selectCustomer = (id: string) => {
        setCustomerId(id)
        const customer = customers.find((c) => c.id === id)
        if (customer) {
            setToEmail(customer.email)
            setToName(customer.companyName)
        }
    }

    const selectedTemplate = templates.find((t) => t.key === templateKey)
    const canSend =
        Boolean(toEmail.trim()) &&
        Boolean(subject.trim()) &&
        Boolean(bodyText.trim()) &&
        !sending

    return (
        <Dialog
            isOpen={open}
            onClose={onClose}
            closable={false}
            shouldCloseOnOverlayClick={false}
            shouldCloseOnEsc={!sending}
            width={720}
            contentClassName="!overflow-hidden !rounded-xl !p-0"
            overlayClassName="!bg-black/20"
        >
            <div className="flex max-h-[min(85dvh,720px)] min-h-[480px] w-full flex-col bg-white dark:bg-gray-900">
                <header className="flex shrink-0 items-center justify-between gap-3 bg-gray-100 px-4 py-2.5 dark:bg-gray-800">
                    <div className="flex min-w-0 items-center gap-2">
                        <HiOutlineMail className="shrink-0 text-base text-gray-500" />
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {draftId ? 'Edit draft' : 'New message'}
                        </span>
                    </div>
                    <button
                        type="button"
                        title="Close"
                        aria-label="Close"
                        className={iconButtonClass}
                        onClick={onClose}
                        disabled={sending}
                    >
                        <HiOutlineX className="text-lg" />
                    </button>
                </header>

                {error ? (
                    <div className="shrink-0 px-4 pt-3">
                        <Alert showIcon type="danger">
                            {error}
                        </Alert>
                    </div>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="shrink-0 px-4">
                        <div className="flex items-center gap-2 border-b border-gray-200 py-2.5 dark:border-gray-700">
                            <span className="w-8 shrink-0 text-sm text-gray-500">
                                To
                            </span>
                            <input
                                type="email"
                                aria-label="To email"
                                placeholder="recipient@example.com"
                                value={toEmail}
                                onChange={(e) => setToEmail(e.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-gray-100"
                            />
                            <input
                                aria-label="Display name"
                                placeholder="Name"
                                value={toName}
                                onChange={(e) => setToName(e.target.value)}
                                className="hidden w-36 shrink-0 bg-transparent text-right text-xs text-gray-500 outline-none placeholder:text-gray-400 sm:block dark:text-gray-300"
                            />
                        </div>

                        <input
                            aria-label="Subject"
                            placeholder="Subject"
                            maxLength={500}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="w-full border-b border-gray-200 bg-transparent py-3 text-sm font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 dark:border-gray-700 dark:text-gray-100"
                        />
                    </div>

                    <textarea
                        aria-label="Message"
                        placeholder="Write your message…"
                        maxLength={50_000}
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        className="min-h-40 w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200"
                    />

                    <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
                        {attachments.map((a) => (
                            <span
                                key={a.id}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            >
                                <HiOutlinePaperClip className="shrink-0 text-sm text-gray-400" />
                                <span className="truncate">{a.fileName}</span>
                                {a.kind === 'QUOTATION_PDF' ? (
                                    <span className="shrink-0 text-[10px] font-medium tracking-wide text-gray-400">
                                        PDF
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        className="shrink-0 text-gray-400 hover:text-red-500"
                                        title="Remove"
                                        disabled={saving || sending}
                                        onClick={() => void onRemoveUpload(a.id)}
                                    >
                                        <HiOutlineX />
                                    </button>
                                )}
                            </span>
                        ))}
                        {attachments.some((a) => a.kind === 'QUOTATION_PDF') ? (
                            <span className="text-xs text-gray-400">
                                Quotation PDF attached when linked
                            </span>
                        ) : null}
                    </div>
                </div>

                {linksOpen ? (
                    <div className="shrink-0 space-y-2 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block space-y-1">
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                    Customer
                                </span>
                                <select
                                    className={selectClass}
                                    value={customerId}
                                    onChange={(e) => selectCustomer(e.target.value)}
                                >
                                    <option value="">—</option>
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.companyName} ({c.email})
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block space-y-1">
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                    Quotation
                                </span>
                                <select
                                    className={selectClass}
                                    value={quotationId}
                                    onChange={(e) => setQuotationId(e.target.value)}
                                >
                                    <option value="">—</option>
                                    {quotations.map((q) => (
                                        <option key={q.id} value={q.id}>
                                            {q.quotationNumber} rev {q.revision} ·{' '}
                                            {q.effectiveStatus}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            Linking a quotation attaches its PDF on send.
                        </p>
                    </div>
                ) : null}

                <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-gray-200 px-4 py-2.5 dark:border-gray-700">
                    <Button
                        variant="solid"
                        size="sm"
                        className="!rounded-full !px-5"
                        loading={sending}
                        disabled={!canSend || saving}
                        onClick={() => void onSend()}
                    >
                        Send
                    </Button>

                    <Button
                        size="sm"
                        variant="plain"
                        loading={saving && !sending}
                        disabled={sending}
                        onClick={() => void onSaveDraft()}
                    >
                        Save draft
                    </Button>

                    <div className="relative" ref={menuRef}>
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineTemplate />}
                            onClick={() =>
                                setTemplateMenuOpen((value) => !value)
                            }
                        >
                            <span className="max-w-[9rem] truncate">
                                {selectedTemplate?.name ?? 'Templates'}
                            </span>
                            <HiOutlineChevronDown className="ml-1 text-xs opacity-60" />
                        </Button>
                        {templateMenuOpen ? (
                            <div className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700">
                                    Cover templates
                                </div>
                                <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                                    onClick={() => {
                                        setTemplateKey('')
                                        setTemplateMenuOpen(false)
                                    }}
                                >
                                    None
                                </button>
                                {templates.map((t) => (
                                    <button
                                        key={t.key}
                                        type="button"
                                        className={classNames(
                                            'block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60',
                                            templateKey === t.key &&
                                                'bg-primary/5 font-medium text-primary',
                                        )}
                                        onClick={() => applyTemplate(t.key)}
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlinePaperClip />}
                        disabled={saving || sending}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Attach
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                        onChange={(e) => {
                            void onPickFiles(e.target.files)
                            e.target.value = ''
                        }}
                    />

                    <Button
                        size="sm"
                        variant="plain"
                        className="ml-auto"
                        onClick={() => setLinksOpen((v) => !v)}
                    >
                        {linksOpen ? 'Hide links' : 'CRM links'}
                    </Button>
                </footer>
            </div>
        </Dialog>
    )
}
