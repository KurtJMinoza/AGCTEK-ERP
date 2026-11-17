'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineArrowLeft,
    HiOutlineClipboardList,
    HiOutlineCog,
    HiOutlineDocumentText,
    HiOutlineHashtag,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlineRefresh,
    HiOutlineTrash,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import { ficoDocumentTypeService } from '../services/ficoService'
import type {
    FicoDocumentType,
    FicoDocumentTypeHistoryItem,
} from '../types'
import {
    DOCUMENT_AUDIT_ACTION_LABELS,
    DOCUMENT_AUDIT_ACTION_TONES,
    DOCUMENT_STATUS_TONES,
    DOCUMENT_TYPE_ROUTE,
    documentAccountTypeLabel,
    documentCategoryLabel,
    documentNumberRangeLabel,
    documentTypeHref,
} from '../components/documentTypeUi'
import {
    FicoStatusCell,
    formatFicoDate,
} from '../components/ficoTableUi'

function yesNo(value: boolean) {
    return value ? 'Yes' : 'No'
}

function performerName(
    item: FicoDocumentTypeHistoryItem | undefined,
): string | null {
    if (!item?.performer) return null
    const name = `${item.performer.firstName} ${item.performer.lastName}`.trim()
    return name || item.performer.userName || item.performer.email
}

const DocumentTypeDetailsPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const documentTypeId = Array.isArray(idParam) ? idParam[0] : idParam
    const { can } = usePermissions()
    const canUpdate = can('fico.document-types', 'update')
    const canDelete = can('fico.document-types', 'delete')

    const [record, setRecord] = useState<FicoDocumentType | null>(null)
    const [history, setHistory] = useState<FicoDocumentTypeHistoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [activeTab, setActiveTab] = useState('overview')
    const [action, setAction] = useState<
        'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | null
    >(null)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)

    const loadRecord = useCallback(() => {
        if (!documentTypeId) return
        setLoading(true)
        ficoDocumentTypeService
            .get(documentTypeId)
            .then(setRecord)
            .catch((error) =>
                notifyError(error, 'Unable to load the document type.'),
            )
            .finally(() => setLoading(false))
    }, [documentTypeId])

    const loadHistory = useCallback(() => {
        if (!documentTypeId) return
        setHistoryLoading(true)
        ficoDocumentTypeService
            .history(documentTypeId, { page: 1, pageSize: 50 })
            .then((response) => setHistory(response.items))
            .catch((error) =>
                notifyError(error, 'Unable to load the audit history.'),
            )
            .finally(() => setHistoryLoading(false))
    }, [documentTypeId])

    useEffect(() => {
        loadRecord()
    }, [loadRecord])

    useEffect(() => {
        loadHistory()
    }, [loadHistory])

    const createdEvent = useMemo(
        () =>
            [...history]
                .reverse()
                .find((item) => item.action === 'DOCUMENT_TYPE_CREATE'),
        [history],
    )
    const updatedEvent = useMemo(
        () =>
            history.find((item) =>
                [
                    'DOCUMENT_TYPE_UPDATE',
                    'DOCUMENT_TYPE_ACTIVATE',
                    'DOCUMENT_TYPE_DEACTIVATE',
                ].includes(item.action),
            ),
        [history],
    )

    const submitAction = async () => {
        if (!record || !action) return
        setSaving(true)
        try {
            if (action === 'ACTIVATE') {
                await ficoDocumentTypeService.activate(
                    record.id,
                    reason.trim() ? { reason: reason.trim() } : {},
                )
                notifySuccess('Document type activated.')
            } else if (action === 'DEACTIVATE') {
                await ficoDocumentTypeService.deactivate(
                    record.id,
                    reason.trim() ? { reason: reason.trim() } : {},
                )
                notifySuccess('Document type deactivated.')
            } else {
                await ficoDocumentTypeService.remove(record.id)
                notifySuccess('Document type deleted.')
                router.push(DOCUMENT_TYPE_ROUTE)
                return
            }
            setAction(null)
            setReason('')
            loadRecord()
            loadHistory()
        } catch (error) {
            notifyError(
                error,
                action === 'ACTIVATE'
                    ? 'Unable to activate the document type.'
                    : action === 'DEACTIVATE'
                      ? 'Unable to deactivate the document type.'
                      : 'Unable to delete the document type.',
            )
        } finally {
            setSaving(false)
        }
    }

    if (!documentTypeId) {
        return (
            <PageContainer>
                <PageHeader
                    title="Document Type Details"
                    breadcrumbs={buildErpBreadcrumbs(DOCUMENT_TYPE_ROUTE)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        No document type was selected.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    if (loading && !record) {
        return (
            <PageContainer>
                <PageHeader
                    title="Document Type Details"
                    description="Loading document type…"
                    breadcrumbs={buildErpBreadcrumbs(
                        documentTypeHref(documentTypeId),
                    )}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        Loading document type…
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    if (!record) {
        return (
            <PageContainer>
                <PageHeader
                    title="Document Type Details"
                    breadcrumbs={buildErpBreadcrumbs(
                        documentTypeHref(documentTypeId),
                    )}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        The document type could not be loaded.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    const usage = record.usage

    return (
        <PageContainer>
            <PageHeader
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-primary">
                            {record.code}
                        </span>
                        <span>{record.name}</span>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-2">
                        <span>{documentCategoryLabel(record.documentCategory)}</span>
                        <FicoStatusCell
                            status={record.status}
                            map={DOCUMENT_STATUS_TONES}
                        />
                        {record.company ? (
                            <span className="text-gray-500">
                                {record.company.code} — {record.company.name}
                            </span>
                        ) : null}
                    </span>
                }
                breadcrumbs={buildErpBreadcrumbs(
                    documentTypeHref(documentTypeId),
                    { detailLabel: record.code },
                )}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            onClick={() => router.push(DOCUMENT_TYPE_ROUTE)}
                        >
                            <HiOutlineArrowLeft className="mr-1.5 h-4 w-4" />
                            Back to Listing
                        </Button>
                        <Button
                            variant="plain"
                            onClick={() => {
                                loadRecord()
                                loadHistory()
                            }}
                            loading={loading}
                        >
                            <HiOutlineRefresh className="mr-1.5 h-4 w-4" />
                            Refresh
                        </Button>
                        {canUpdate ? (
                            <Button
                                variant="default"
                                onClick={() =>
                                    router.push(
                                        documentTypeHref(record.id, 'edit'),
                                    )
                                }
                            >
                                <HiOutlinePencil className="mr-1.5 h-4 w-4" />
                                Edit
                            </Button>
                        ) : null}
                        {canDelete && usage?.canDelete ? (
                            <Button
                                variant="default"
                                onClick={() => {
                                    setReason('')
                                    setAction('DELETE')
                                }}
                            >
                                <HiOutlineTrash className="mr-1.5 h-4 w-4" />
                                Delete
                            </Button>
                        ) : null}
                        {canUpdate && record.status === 'ACTIVE' ? (
                            <Button
                                variant="solid"
                                onClick={() => {
                                    setReason('')
                                    setAction('DEACTIVATE')
                                }}
                            >
                                <HiOutlineLockClosed className="mr-1.5 h-4 w-4" />
                                Deactivate
                            </Button>
                        ) : null}
                        {canUpdate && record.status !== 'ACTIVE' ? (
                            <Button
                                variant="solid"
                                onClick={() => {
                                    setReason('')
                                    setAction('ACTIVATE')
                                }}
                            >
                                <HiOutlineLockOpen className="mr-1.5 h-4 w-4" />
                                Activate
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <StatCard
                    label="Status"
                    value={record.status}
                    tone={record.status === 'ACTIVE' ? 'success' : 'warning'}
                />
                <StatCard
                    label="Number range"
                    value={record.numberRange?.rangeCode ?? '—'}
                    tone={record.numberRange ? 'info' : 'default'}
                />
                <StatCard
                    label="Account types"
                    value={record.allowedAccountTypes.length}
                    tone="default"
                />
                <StatCard
                    label="Reversal"
                    value={record.reversalAllowed ? 'Allowed' : 'Not allowed'}
                    tone={record.reversalAllowed ? 'success' : 'warning'}
                />
                <StatCard
                    label="Journal entries"
                    value={usage?.journalEntries ?? 0}
                    tone="default"
                />
            </div>

            <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(String(value))}
                className="mb-6"
            >
                <Tabs.TabList>
                    <Tabs.TabNav value="overview">Overview</Tabs.TabNav>
                    <Tabs.TabNav value="accounting">Accounting</Tabs.TabNav>
                    <Tabs.TabNav value="reversal">Reversal</Tabs.TabNav>
                    <Tabs.TabNav value="audit">Audit Trail</Tabs.TabNav>
                    <Tabs.TabNav value="usage">Usage</Tabs.TabNav>
                </Tabs.TabList>

                <Tabs.TabContent value="overview">
                    <div className="space-y-6">
                        <AdaptiveCard>
                            <SectionTitle
                                icon={<HiOutlineDocumentText />}
                                title="General information"
                            />
                            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <Field label="Document type code" value={record.code} mono />
                                <Field label="Document type name" value={record.name} />
                                <Field
                                    label="Company"
                                    value={
                                        record.company
                                            ? `${record.company.code} — ${record.company.name}`
                                            : record.companyId
                                    }
                                />
                                <Field
                                    label="Category"
                                    value={documentCategoryLabel(
                                        record.documentCategory,
                                    )}
                                />
                                <Field
                                    label="Description"
                                    value={record.description ?? '—'}
                                    className="sm:col-span-2 lg:col-span-4"
                                />
                                <Field
                                    label="Remarks"
                                    value={record.remarks ?? '—'}
                                    className="sm:col-span-2 lg:col-span-4"
                                />
                            </dl>
                        </AdaptiveCard>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <AdaptiveCard>
                                <SectionTitle
                                    icon={<HiOutlineHashtag />}
                                    title="Numbering configuration"
                                />
                                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field
                                        label="Number range"
                                        value={documentNumberRangeLabel(
                                            record.numberRange,
                                        )}
                                    />
                                    <Field
                                        label="Range category"
                                        value={documentCategoryLabel(
                                            record.numberRange?.documentCategory,
                                        )}
                                    />
                                    <Field
                                        label="Number assignment"
                                        value={record.numberAssignment}
                                    />
                                    <Field
                                        label="External number allowed"
                                        value={yesNo(
                                            record.externalNumberAllowed,
                                        )}
                                    />
                                    <Field
                                        label="Number range required"
                                        value={yesNo(record.numberRangeRequired)}
                                    />
                                    <Field
                                        label="Range validity"
                                        value={
                                            record.numberRange
                                                ? `${
                                                      record.numberRange.validFrom?.slice(
                                                          0,
                                                          10,
                                                      ) ?? 'Open'
                                                  } → ${
                                                      record.numberRange.validTo?.slice(
                                                          0,
                                                          10,
                                                      ) ?? 'Open'
                                                  }`
                                                : '—'
                                        }
                                    />
                                </dl>
                            </AdaptiveCard>

                            <AdaptiveCard>
                                <SectionTitle
                                    icon={<HiOutlineCog />}
                                    title="Allowed account types"
                                />
                                <div className="flex flex-wrap gap-2">
                                    {record.allowedAccountTypes.length ? (
                                        record.allowedAccountTypes.map(
                                            (accountType) => (
                                                <Tag
                                                    key={accountType}
                                                    className="border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                                >
                                                    {documentAccountTypeLabel(
                                                        accountType,
                                                    )}
                                                </Tag>
                                            ),
                                        )
                                    ) : (
                                        <p className="text-sm text-gray-500">
                                            No account types configured.
                                        </p>
                                    )}
                                </div>
                            </AdaptiveCard>
                        </div>
                    </div>
                </Tabs.TabContent>

                <Tabs.TabContent value="accounting">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <AdaptiveCard>
                            <SectionTitle
                                icon={<HiOutlineCog />}
                                title="Posting controls"
                            />
                            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field
                                    label="Debit posting allowed"
                                    value={yesNo(record.debitPostingAllowed)}
                                />
                                <Field
                                    label="Credit posting allowed"
                                    value={yesNo(record.creditPostingAllowed)}
                                />
                                <Field
                                    label="Negative posting allowed"
                                    value={yesNo(record.negativePostingAllowed)}
                                />
                                <Field
                                    label="Reference required"
                                    value={yesNo(record.referenceRequired)}
                                />
                                <Field
                                    label="Header text required"
                                    value={yesNo(record.headerTextRequired)}
                                />
                                <Field
                                    label="Line text required"
                                    value={yesNo(record.lineTextRequired)}
                                />
                            </dl>
                        </AdaptiveCard>

                        <AdaptiveCard>
                            <SectionTitle
                                icon={<HiOutlineClipboardList />}
                                title="Audit information"
                            />
                            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field
                                    label="Created by"
                                    value={
                                        performerName(createdEvent) ??
                                        record.createdBy ??
                                        '—'
                                    }
                                />
                                <Field
                                    label="Created at"
                                    value={formatFicoDate(record.createdAt)}
                                />
                                <Field
                                    label="Last updated by"
                                    value={
                                        performerName(updatedEvent) ??
                                        record.updatedBy ??
                                        '—'
                                    }
                                />
                                <Field
                                    label="Last updated at"
                                    value={formatFicoDate(record.updatedAt)}
                                />
                            </dl>
                        </AdaptiveCard>
                    </div>
                </Tabs.TabContent>

                <Tabs.TabContent value="reversal">
                    <AdaptiveCard>
                        <SectionTitle
                            icon={<HiOutlineRefresh />}
                            title="Reversal settings"
                        />
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <Field
                                label="Reversal allowed"
                                value={yesNo(record.reversalAllowed)}
                            />
                            <Field
                                label="Reversal document type"
                                value={
                                    record.reversalDocumentType
                                        ? `${record.reversalDocumentType.code} — ${record.reversalDocumentType.name}`
                                        : '—'
                                }
                            />
                            <Field
                                label="Original reference required"
                                value={yesNo(
                                    record.originalDocumentReferenceRequired,
                                )}
                            />
                            <Field
                                label="Reversal reason required"
                                value={yesNo(record.reversalReasonRequired)}
                            />
                        </dl>
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="audit">
                    <AdaptiveCard>
                        <SectionTitle
                            icon={<HiOutlineClipboardList />}
                            title="Audit trail"
                        />
                        {historyLoading ? (
                            <p className="py-6 text-center text-sm text-gray-500">
                                Loading audit history…
                            </p>
                        ) : history.length ? (
                            <div className="space-y-3">
                                {history.map((item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {DOCUMENT_AUDIT_ACTION_LABELS[
                                                        item.action
                                                    ] ?? item.action}
                                                </span>
                                                <Tag
                                                    className={
                                                        DOCUMENT_AUDIT_ACTION_TONES[
                                                            item.action
                                                        ] === 'danger'
                                                            ? 'border-red-200 bg-red-50 text-red-700'
                                                            : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                                    }
                                                >
                                                    {item.action}
                                                </Tag>
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {formatFicoDate(item.createdAt)}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {performerName(item) ||
                                                item.actorId ||
                                                'System'}
                                            {item.reason
                                                ? ` · ${item.reason}`
                                                : ''}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="py-6 text-center text-sm text-gray-500">
                                No audit events were recorded for this document
                                type.
                            </p>
                        )}
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="usage">
                    <AdaptiveCard>
                        <SectionTitle
                            icon={<HiOutlineClipboardList />}
                            title="Usage and dependency checks"
                        />
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <Field
                                label="Journal entries"
                                value={String(usage?.journalEntries ?? 0)}
                            />
                            <Field
                                label="Document sequences"
                                value={String(usage?.documentSequences ?? 0)}
                            />
                            <Field
                                label="Reversal references"
                                value={String(usage?.reversalReferences ?? 0)}
                            />
                            <Field
                                label="Safe to delete"
                                value={yesNo(Boolean(usage?.canDelete))}
                            />
                        </dl>
                        <p className="mt-4 text-sm text-gray-500">
                            Document types with dependent configuration or
                            historical references cannot be deleted. Deactivate
                            them instead so historical documents keep their
                            original classification.
                        </p>
                    </AdaptiveCard>
                </Tabs.TabContent>
            </Tabs>

            <ConfirmDialog
                isOpen={Boolean(action)}
                type={
                    action === 'DELETE'
                        ? 'danger'
                        : action === 'DEACTIVATE'
                          ? 'warning'
                          : 'info'
                }
                title={
                    action === 'ACTIVATE'
                        ? 'Activate Document Type'
                        : action === 'DEACTIVATE'
                          ? 'Deactivate Document Type'
                          : 'Delete Document Type'
                }
                confirmText={
                    action === 'ACTIVATE'
                        ? 'Activate'
                        : action === 'DEACTIVATE'
                          ? 'Deactivate'
                          : 'Delete'
                }
                confirmButtonProps={{ loading: saving }}
                onConfirm={submitAction}
                onCancel={() => {
                    setAction(null)
                    setReason('')
                }}
            >
                <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {record.code} — {record.name}
                    </p>
                    <p className="text-sm text-gray-500">
                        {action === 'ACTIVATE'
                            ? 'Activation validates the number range, account types, posting controls, and reversal references.'
                            : action === 'DEACTIVATE'
                              ? 'Inactive document types remain on historical documents but cannot be used for new transactions.'
                              : 'Deletion is permanent. The backend blocks deletion when journal entries, document sequences, or reversal references exist.'}
                    </p>
                    {action !== 'DELETE' ? (
                        <FormItem label="Reason (optional)">
                            <Input
                                textArea
                                rows={2}
                                maxLength={500}
                                value={reason}
                                placeholder="Explain the status change"
                                onChange={(event) =>
                                    setReason(event.target.value)
                                }
                            />
                        </FormItem>
                    ) : null}
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

function Field({
    label,
    value,
    mono = false,
    className,
}: {
    label: string
    value: ReactNode
    mono?: boolean
    className?: string
}) {
    return (
        <div className={className}>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {label}
            </dt>
            <dd
                className={`mt-1 text-sm text-gray-900 dark:text-gray-100 ${
                    mono ? 'font-mono' : ''
                }`}
            >
                {value}
            </dd>
        </div>
    )
}

function SectionTitle({
    icon,
    title,
}: {
    icon: ReactNode
    title: string
}) {
    return (
        <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                {icon}
            </span>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
            </h3>
        </div>
    )
}

export default DocumentTypeDetailsPage
