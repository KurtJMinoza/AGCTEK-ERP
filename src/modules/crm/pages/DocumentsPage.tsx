'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import usePermissions from '@/utils/hooks/usePermissions'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import {
    listPdfLayoutProfiles,
    listQuotationEmailTemplates,
    PDF_LAYOUT_MARGIN_MAX,
    PDF_LAYOUT_MARGIN_MIN,
    QUOTATION_EMAIL_PLACEHOLDERS,
    updatePdfLayoutProfile,
    updateQuotationEmailTemplate,
    type PdfLayoutProfile,
    type QuotationEmailTemplate,
} from '@/modules/sd/services/quotationService'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import { formatDate } from '../utils/format'

const { TabList, TabNav, TabContent } = Tabs
const TABS = ['email-templates', 'pdf-templates'] as const
type DocumentsTab = (typeof TABS)[number]

type Loaded<T> = { key: number; rows: T[]; error: string | null }

/** Loads `load()` whenever `refresh` changes; state is only set from the promise. */
function useRows<T>(load: () => Promise<T[]>, refresh: number, fallback: string) {
    const [result, setResult] = useState<Loaded<T> | null>(null)
    useEffect(() => {
        let active = true
        load()
            .then((rows) => active && setResult({ key: refresh, rows, error: null }))
            .catch((err) => active && setResult({ key: refresh, rows: [], error: getApiErrorMessage(err, fallback) }))
        return () => {
            active = false
        }
        // `load` is a stable module function.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh])
    return result?.key === refresh ? result : null
}

/** Quotation cover emails (SD `sd_email_templates`); the PDF is always attached separately. */
function EmailTemplatesTab({ canEdit }: { canEdit: boolean }) {
    const [refresh, setRefresh] = useState(0)
    const loaded = useRows(listQuotationEmailTemplates, refresh, 'Unable to load email templates')
    const [editing, setEditing] = useState<QuotationEmailTemplate | null>(null)
    const [form, setForm] = useState({ name: '', subject: '', bodyText: '', isDefault: false, isActive: true })
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
        if (!form.name.trim() || !form.subject.trim() || !form.bodyText.trim()) {
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

    if (!loaded) return <p className="text-sm text-gray-500">Loading email templates…</p>
    return (
        <>
            {loaded.error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {loaded.error}
                </Alert>
            ) : null}
            {loaded.rows.length === 0 && !loaded.error ? (
                <p className="py-6 text-center text-sm text-gray-500">No email templates yet.</p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {loaded.rows.map((template) => (
                    <AdaptiveCard key={template.key}>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h6 className="mr-auto">{template.name}</h6>
                            {template.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
                            {!template.isActive ? <StatusBadge tone="warning">Inactive</StatusBadge> : null}
                        </div>
                        <p className="text-sm font-medium">{template.subject}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-gray-500">
                            {template.bodyText}
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                            <span className="mr-auto">
                                {template.key} · updated {formatDate(template.updatedAt)}
                            </span>
                            {canEdit ? (
                                <Button size="xs" onClick={() => open(template)}>
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
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Subject" asterisk>
                    <Input
                        maxLength={300}
                        value={form.subject}
                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Message" asterisk>
                    <Input
                        textArea
                        rows={12}
                        maxLength={20_000}
                        value={form.bodyText}
                        onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                    />
                </FormItem>
                <p className="mb-4 text-xs text-gray-500">
                    Placeholders: {QUOTATION_EMAIL_PLACEHOLDERS.map((p) => `{{${p}}}`).join(' ')}
                </p>
                <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm">
                        <Switcher
                            checked={form.isDefault}
                            onChange={(checked) => setForm((f) => ({ ...f, isDefault: checked }))}
                        />
                        Default for first emails
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <Switcher
                            checked={form.isActive}
                            onChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                        />
                        Active (offered in the composer)
                    </label>
                </div>
            </FormDialog>
        </>
    )
}

type LayoutForm = {
    name: string
    showTin: boolean
    showOpportunity: boolean
    showPaymentTerms: boolean
    marginTop: string
    marginSide: string
    disclaimer: string
}

const marginValid = (value: string) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= PDF_LAYOUT_MARGIN_MIN && n <= PDF_LAYOUT_MARGIN_MAX
}

/** Quotation PDF look (SD `sd_pdf_layout_profiles`); quotation data and prices never change here. */
function PdfTemplatesTab({ canEdit }: { canEdit: boolean }) {
    const [refresh, setRefresh] = useState(0)
    const loaded = useRows(listPdfLayoutProfiles, refresh, 'Unable to load PDF templates')
    const [editing, setEditing] = useState<PdfLayoutProfile | null>(null)
    const [form, setForm] = useState<LayoutForm | null>(null)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const open = (profile: PdfLayoutProfile) => {
        setEditing(profile)
        setForm({
            name: profile.name,
            showTin: profile.layout.showTin,
            showOpportunity: profile.layout.showOpportunity,
            showPaymentTerms: profile.layout.showPaymentTerms,
            marginTop: String(profile.layout.marginTop),
            marginSide: String(profile.layout.marginSide),
            disclaimer: profile.layout.disclaimer,
        })
        setFormError(null)
    }

    const save = async () => {
        if (!editing || !form) return
        if (!marginValid(form.marginTop) || !marginValid(form.marginSide)) {
            setFormError(`Margins must be whole points from ${PDF_LAYOUT_MARGIN_MIN} to ${PDF_LAYOUT_MARGIN_MAX}`)
            return
        }
        setSaving(true)
        setFormError(null)
        try {
            await updatePdfLayoutProfile(editing.key, {
                name: form.name.trim() || editing.name,
                config: {
                    showTin: form.showTin,
                    showOpportunity: form.showOpportunity,
                    showPaymentTerms: form.showPaymentTerms,
                    marginTop: Number(form.marginTop),
                    marginSide: Number(form.marginSide),
                    disclaimer: form.disclaimer.trim(),
                },
            })
            setEditing(null)
            setRefresh((n) => n + 1)
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'PDF template was not saved'))
        } finally {
            setSaving(false)
        }
    }

    const toggle = (field: 'showTin' | 'showOpportunity' | 'showPaymentTerms', label: string) =>
        form ? (
            <label className="flex items-center gap-2 text-sm">
                <Switcher
                    checked={form[field]}
                    onChange={(checked) => setForm((f) => (f ? { ...f, [field]: checked } : f))}
                />
                {label}
            </label>
        ) : null

    if (!loaded) return <p className="text-sm text-gray-500">Loading PDF templates…</p>
    return (
        <>
            {loaded.error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {loaded.error}
                </Alert>
            ) : null}
            <p className="mb-4 text-sm text-gray-500">
                The default profile styles every quotation PDF downloaded or emailed from now on. PDFs already
                emailed keep their stored copy.
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {loaded.rows.map((profile) => (
                    <AdaptiveCard key={profile.key}>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <h6 className="mr-auto">{profile.name}</h6>
                            {profile.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
                            {!profile.isActive ? <StatusBadge tone="warning">Inactive</StatusBadge> : null}
                        </div>
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                            <dt className="text-gray-500">Company TIN</dt>
                            <dd>{profile.layout.showTin ? 'Shown' : 'Hidden'}</dd>
                            <dt className="text-gray-500">Opportunity</dt>
                            <dd>{profile.layout.showOpportunity ? 'Shown' : 'Hidden'}</dd>
                            <dt className="text-gray-500">Payment terms</dt>
                            <dd>{profile.layout.showPaymentTerms ? 'Shown when set' : 'Hidden'}</dd>
                            <dt className="text-gray-500">Margins</dt>
                            <dd>
                                {profile.layout.marginTop} pt top · {profile.layout.marginSide} pt sides
                            </dd>
                            <dt className="text-gray-500">Footer</dt>
                            <dd className="text-gray-600 dark:text-gray-300">{profile.layout.disclaimer}</dd>
                        </dl>
                        {canEdit ? (
                            <div className="mt-3 flex justify-end">
                                <Button size="xs" onClick={() => open(profile)}>
                                    Edit
                                </Button>
                            </div>
                        ) : null}
                    </AdaptiveCard>
                ))}
            </div>
            <FormDialog
                isOpen={Boolean(editing && form)}
                onClose={() => setEditing(null)}
                size="lg"
                title={`Edit ${editing?.name ?? 'PDF template'}`}
                description="Changes the PDF look only; lines, prices and totals always come from the SD quotation."
                onSubmit={save}
                confirmText="Save"
                confirmLoading={saving}
            >
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                {form ? (
                    <>
                        <FormItem label="Name">
                            <Input
                                maxLength={120}
                                value={form.name}
                                onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                            />
                        </FormItem>
                        <div className="mb-4 flex flex-wrap gap-6">
                            {toggle('showTin', 'Company TIN')}
                            {toggle('showOpportunity', 'Opportunity name')}
                            {toggle('showPaymentTerms', 'Payment terms')}
                        </div>
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label={`Top margin (pt, ${PDF_LAYOUT_MARGIN_MIN}–${PDF_LAYOUT_MARGIN_MAX})`}>
                                <Input
                                    type="number"
                                    min={PDF_LAYOUT_MARGIN_MIN}
                                    max={PDF_LAYOUT_MARGIN_MAX}
                                    value={form.marginTop}
                                    onChange={(e) => setForm((f) => (f ? { ...f, marginTop: e.target.value } : f))}
                                />
                            </FormItem>
                            <FormItem label={`Side margins (pt, ${PDF_LAYOUT_MARGIN_MIN}–${PDF_LAYOUT_MARGIN_MAX})`}>
                                <Input
                                    type="number"
                                    min={PDF_LAYOUT_MARGIN_MIN}
                                    max={PDF_LAYOUT_MARGIN_MAX}
                                    value={form.marginSide}
                                    onChange={(e) => setForm((f) => (f ? { ...f, marginSide: e.target.value } : f))}
                                />
                            </FormItem>
                        </div>
                        <FormItem label="Footer disclaimer" extra="Leave empty to use the standard disclaimer.">
                            <Input
                                textArea
                                rows={3}
                                maxLength={500}
                                value={form.disclaimer}
                                onChange={(e) => setForm((f) => (f ? { ...f, disclaimer: e.target.value } : f))}
                            />
                        </FormItem>
                    </>
                ) : null}
            </FormDialog>
        </>
    )
}

/** CRM › Documents: quotation email templates and the PDF layout profile (SD stores both). */
export default function DocumentsPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const tabParam = searchParams.get('tab')
    const tab: DocumentsTab = (TABS as readonly string[]).includes(tabParam ?? '')
        ? (tabParam as DocumentsTab)
        : 'email-templates'
    const { can } = usePermissions()
    const canEdit = can('sd.quotations', 'update')

    const selectTab = (next: string) => {
        const query = new URLSearchParams(searchParams.toString())
        query.set('tab', next)
        router.replace(`${pathname}?${query.toString()}`, { scroll: false })
    }

    return (
        <PageContainer>
            <PageHeader
                title="Documents"
                description="Cover-email templates and the PDF layout used when quotations go to customers."
                breadcrumbs={crmPageBreadcrumbs('/crm/documents')}
            />
            <Tabs value={tab} onChange={selectTab}>
                <TabList className="mb-4">
                    <TabNav value="email-templates">Email templates</TabNav>
                    <TabNav value="pdf-templates">PDF templates</TabNav>
                </TabList>
                <TabContent value="email-templates">
                    <EmailTemplatesTab canEdit={canEdit} />
                </TabContent>
                <TabContent value="pdf-templates">
                    <PdfTemplatesTab canEdit={canEdit} />
                </TabContent>
            </Tabs>
        </PageContainer>
    )
}
