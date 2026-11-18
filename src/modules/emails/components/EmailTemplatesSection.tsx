'use client'

import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { formatDate } from '@/modules/crm/utils/format'
import {
    listQuotationEmailTemplates,
    QUOTATION_EMAIL_PLACEHOLDERS,
    updateQuotationEmailTemplate,
    type QuotationEmailTemplate,
} from '@/modules/sd/services/quotationService'
import { useRows } from '../hooks/useRows'

/** Quotation cover emails (CRM › Emails; SD `sd_email_templates`). The PDF is always attached separately. */
export default function EmailTemplatesSection({
    canEdit,
}: {
    canEdit: boolean
}) {
    const [refresh, setRefresh] = useState(0)
    const loaded = useRows(
        listQuotationEmailTemplates,
        refresh,
        'Unable to load email templates',
    )
    const [editing, setEditing] = useState<QuotationEmailTemplate | null>(null)
    const [form, setForm] = useState({
        name: '',
        subject: '',
        bodyText: '',
        isDefault: false,
        isActive: true,
    })
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const open = (template: QuotationEmailTemplate) => {
        setEditing(template)
        setForm({
            name: template.name,
            subject: template.subject,
            bodyText: template.bodyText,
            isDefault: template.isDefault,
            isActive: template.isActive,
        })
        setFormError(null)
    }

    const save = async () => {
        if (!editing) return
        if (
            !form.name.trim() ||
            !form.subject.trim() ||
            !form.bodyText.trim()
        ) {
            setFormError('Name, subject and message are required')
            return
        }
        setSaving(true)
        setFormError(null)
        try {
            await updateQuotationEmailTemplate(editing.key, {
                name: form.name.trim(),
                subject: form.subject.trim(),
                bodyText: form.bodyText,
                isDefault: form.isDefault,
                isActive: form.isActive,
            })
            setEditing(null)
            setRefresh((n) => n + 1)
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Template was not saved'))
        } finally {
            setSaving(false)
        }
    }

    if (!loaded)
        return <p className="text-sm text-gray-500">Loading email templates…</p>
    return (
        <>
            {loaded.error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {loaded.error}
                </Alert>
            ) : null}
            {loaded.rows.length === 0 && !loaded.error ? (
                <p className="py-6 text-center text-sm text-gray-500">
                    No email templates yet.
                </p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {loaded.rows.map((template) => (
                    <AdaptiveCard key={template.key}>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h6 className="mr-auto">{template.name}</h6>
                            {template.isDefault ? (
                                <StatusBadge tone="info">Default</StatusBadge>
                            ) : null}
                            {!template.isActive ? (
                                <StatusBadge tone="warning">
                                    Inactive
                                </StatusBadge>
                            ) : null}
                        </div>
                        <p className="text-sm font-medium">
                            {template.subject}
                        </p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-gray-500">
                            {template.bodyText}
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                            <span className="mr-auto">
                                {template.key} · updated{' '}
                                {formatDate(template.updatedAt)}
                            </span>
                            {canEdit ? (
                                <Button
                                    size="xs"
                                    onClick={() => open(template)}
                                >
                                    Edit
                                </Button>
                            ) : null}
                        </div>
                    </AdaptiveCard>
                ))}
            </div>
            <FormDialog
                isOpen={Boolean(editing)}
                onClose={() => setEditing(null)}
                size="lg"
                title={`Edit ${editing?.name ?? 'template'}`}
                description="Cover letter only: the quotation PDF stays the commercial document and is attached automatically."
                onSubmit={save}
                confirmText="Save"
                confirmLoading={saving}
            >
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <FormItem label="Name" asterisk>
                    <Input
                        maxLength={120}
                        value={form.name}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, name: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Subject" asterisk>
                    <Input
                        maxLength={300}
                        value={form.subject}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, subject: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Message" asterisk>
                    <Input
                        textArea
                        rows={12}
                        maxLength={20_000}
                        value={form.bodyText}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, bodyText: e.target.value }))
                        }
                    />
                </FormItem>
                <p className="mb-4 text-xs text-gray-500">
                    Placeholders:{' '}
                    {QUOTATION_EMAIL_PLACEHOLDERS.map((p) => `{{${p}}}`).join(
                        ' ',
                    )}
                </p>
                <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm">
                        <Switcher
                            checked={form.isDefault}
                            onChange={(checked) =>
                                setForm((f) => ({ ...f, isDefault: checked }))
                            }
                        />
                        Default for first emails
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <Switcher
                            checked={form.isActive}
                            onChange={(checked) =>
                                setForm((f) => ({ ...f, isActive: checked }))
                            }
                        />
                        Active (offered in the composer)
                    </label>
                </div>
            </FormDialog>
        </>
    )
}
