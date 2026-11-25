'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineArrowLeft,
    HiOutlineCheck,
    HiOutlineDocumentAdd,
    HiOutlineSave,
} from 'react-icons/hi'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import JournalEntryFormPanel from '../components/journal/JournalEntryFormPanel'
import type { JournalEditorLine } from '../components/journal/JournalLineEditor'
import { sumLineTotals } from '../components/journal/journalUi'
import {
    ficoErrorMessage,
    ficoGlAccountService,
    ficoJournalService,
    ficoPeriodService,
    ficoSettingsService,
} from '../services/ficoService'
import type { FicoGlAccount, FicoJournalSimulateResult } from '../types'

const LIST_ROUTE = '/modules/fico/journal-entries'

function toEditorLines(
    lines: Array<{
        id?: string
        glAccountId: string
        debitAmount: string
        creditAmount: string
        description?: string | null
        glAccount?: { accountCode: string; accountName: string }
    }>,
): JournalEditorLine[] {
    return lines.map((line, index) => ({
        key: line.id ?? `line-${index}`,
        glAccountId: line.glAccountId,
        accountCode: line.glAccount?.accountCode,
        accountName: line.glAccount?.accountName,
        debit: line.debitAmount,
        credit: line.creditAmount,
        description: line.description ?? '',
    }))
}

const JournalEntryFormPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const entryId = Array.isArray(idParam) ? idParam[0] : idParam
    const isEdit = Boolean(entryId)

    const {
        companyId,
        setCompanyId,
        companies,
        rows,
        loading: companyLoading,
    } = useFicoCompanies()
    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [postingDate, setPostingDate] = useState(
        () => new Date().toISOString().slice(0, 10),
    )
    const [documentDate, setDocumentDate] = useState(
        () => new Date().toISOString().slice(0, 10),
    )
    const [description, setDescription] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [currencyCode, setCurrencyCode] = useState('PHP')
    const [lines, setLines] = useState<JournalEditorLine[]>([
        {
            key: '1',
            glAccountId: '',
            debit: '',
            credit: '',
            description: '',
        },
        {
            key: '2',
            glAccountId: '',
            debit: '',
            credit: '',
            description: '',
        },
    ])
    const [periodLabel, setPeriodLabel] = useState<string | null>(null)
    const [periodStatus, setPeriodStatus] = useState<string | null>(null)
    const [simulation, setSimulation] =
        useState<FicoJournalSimulateResult | null>(null)
    const [busy, setBusy] = useState(false)

    const selectedCompany = useMemo(
        () => rows.find((r) => r.company.id === companyId)?.company,
        [rows, companyId],
    )
    const companyCode = selectedCompany?.code
    const companyName = selectedCompany?.name

    const chartId = useMemo(
        () =>
            rows.find((r) => r.company.id === companyId)?.settings
                ?.chartOfAccountsId,
        [rows, companyId],
    )

    const route = isEdit
        ? `/modules/fico/journal-entries/${entryId}/edit`
        : '/modules/fico/journal-entries/create'

    useEffect(() => {
        if (!chartId) {
            setAccounts([])
            return
        }
        ficoGlAccountService
            .list({
                chartOfAccountsId: chartId,
                companyId,
                status: 'ACTIVE',
            })
            .then(setAccounts)
            .catch((error) =>
                notifyError(error, 'Unable to load G/L accounts.'),
            )
    }, [chartId, companyId])

    useEffect(() => {
        if (!companyId) return
        ficoSettingsService
            .get(companyId)
            .then((settings) => {
                if (settings?.baseCurrency) {
                    setCurrencyCode(settings.baseCurrency)
                }
            })
            .catch(() => undefined)
    }, [companyId])

    useEffect(() => {
        if (!companyId || !postingDate) return
        ficoPeriodService
            .resolve(companyId, postingDate)
            .then((result) => {
                if (result.period) {
                    setPeriodLabel(
                        `FY ${result.period.fiscalYear} · P${result.period.periodNumber} (${result.period.name})`,
                    )
                    setPeriodStatus(result.period.status)
                } else {
                    setPeriodLabel(null)
                    setPeriodStatus(result.status)
                }
            })
            .catch(() => {
                setPeriodLabel(null)
                setPeriodStatus(null)
            })
    }, [companyId, postingDate])

    useEffect(() => {
        if (!isEdit || !entryId || !companyId) return
        ficoJournalService
            .get(entryId, companyId)
            .then((entry) => {
                if (entry.status !== 'DRAFT') {
                    router.replace(`/modules/fico/journal-entries/${entryId}`)
                    return
                }
                setPostingDate(entry.postingDate.slice(0, 10))
                setDocumentDate(
                    (entry.documentDate ?? entry.postingDate).slice(0, 10),
                )
                setDescription(entry.description ?? '')
                setSupplierId(entry.supplierId ?? '')
                setCurrencyCode(entry.currencyCode)
                setLines(
                    toEditorLines(entry.lines).length
                        ? toEditorLines(entry.lines)
                        : lines,
                )
            })
            .catch((error) =>
                notifyError(error, 'Unable to load journal draft.'),
            )
    }, [isEdit, entryId, companyId, router])

    const buildPayload = useCallback(() => {
        const parsedLines = lines
            .filter((line) => line.glAccountId)
            .map((line) => ({
                glAccountId: line.glAccountId,
                debitAmount: Number(line.debit) || 0,
                creditAmount: Number(line.credit) || 0,
                description: line.description || undefined,
            }))
        return {
            companyId,
            postingDate,
            description: description || undefined,
            currencyCode,
            supplierId: supplierId || null,
            lines: parsedLines,
        }
    }, [lines, companyId, postingDate, description, currencyCode, supplierId])

    const saveDraft = async () => {
        if (!companyId) return
        setBusy(true)
        try {
            const payload = buildPayload()
            if (isEdit && entryId) {
                await ficoJournalService.update(entryId, payload)
                notifySuccess('Draft saved.')
                router.push(`/modules/fico/journal-entries/${entryId}`)
            } else {
                const created = await ficoJournalService.create(payload)
                notifySuccess('Draft created.')
                router.push(`/modules/fico/journal-entries/${created.id}`)
            }
        } catch (error) {
            notifyError(error, ficoErrorMessage(error, 'Unable to save draft.'))
        } finally {
            setBusy(false)
        }
    }

    const runSimulate = async () => {
        if (!companyId) return
        setBusy(true)
        try {
            const result = await ficoJournalService.simulate(buildPayload())
            setSimulation(result)
            if (result.valid) {
                notifySuccess('Validation passed.')
            } else {
                notifyError(
                    new Error('Validation failed'),
                    result.errors?.map((e) => e.message).join('; ') ??
                        'Validation failed.',
                )
            }
        } catch (error) {
            notifyError(error, ficoErrorMessage(error, 'Simulation failed.'))
        } finally {
            setBusy(false)
        }
    }

    const totals = sumLineTotals(lines)

    const postEntry = async () => {
        if (!companyId || !totals.balanced) return
        setBusy(true)
        try {
            const payload = buildPayload()
            const targetId = isEdit && entryId
                ? entryId
                : (await ficoJournalService.create(payload)).id
            if (isEdit && entryId) {
                await ficoJournalService.update(targetId, payload)
            }
            await ficoJournalService.post(targetId)
            notifySuccess('Journal posted.')
            router.push(`/modules/fico/journal-entries/${targetId}`)
        } catch (error) {
            notifyError(error, ficoErrorMessage(error, 'Post failed.'))
        } finally {
            setBusy(false)
        }
    }

    const pageTitle = isEdit ? 'Edit journal draft' : 'New journal entry'

    return (
        <PageContainer>
            <PageHeader
                title={pageTitle}
                description="Balanced manual journal for one company — validate the period, assign G/L accounts, then save or post."
                breadcrumbs={buildErpBreadcrumbs(route, [
                    { label: pageTitle, href: route },
                ])}
                actions={
                    <Button
                        variant="plain"
                        icon={<HiOutlineArrowLeft />}
                        onClick={() => router.push(LIST_ROUTE)}
                    >
                        Journal list
                    </Button>
                }
            />

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="w-full min-w-0 xl:max-w-md">
                        <FormItem label="Posting company">
                            <FicoCompanySelect
                                allowAll={false}
                                className="w-full"
                                companies={companies}
                                value={companyId}
                                onChange={setCompanyId}
                                loading={companyLoading}
                            />
                        </FormItem>
                        {selectedCompany ? (
                            <p className="mt-1 text-xs text-gray-500">
                                Every line on this document posts to{' '}
                                <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">
                                    {selectedCompany.code}
                                </span>
                                .
                            </p>
                        ) : (
                            <p className="mt-1 text-xs text-gray-500">
                                Choose the company before entering lines.
                            </p>
                        )}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end xl:w-auto">
                        <Button
                            className="w-full sm:w-auto"
                            icon={<HiOutlineSave />}
                            loading={busy}
                            disabled={!companyId}
                            onClick={saveDraft}
                        >
                            Save draft
                        </Button>
                        <Button
                            className="w-full sm:w-auto"
                            variant="plain"
                            icon={<HiOutlineDocumentAdd />}
                            loading={busy}
                            disabled={!companyId}
                            onClick={runSimulate}
                        >
                            Validate
                        </Button>
                        <Button
                            className="w-full sm:w-auto"
                            variant="solid"
                            icon={<HiOutlineCheck />}
                            loading={busy}
                            disabled={!totals.balanced || !companyId}
                            onClick={postEntry}
                        >
                            Post
                        </Button>
                    </div>
                </div>
            </AdaptiveCard>

            {companyId ? (
                <JournalEntryFormPanel
                    postingDate={postingDate}
                    documentDate={documentDate}
                    currencyCode={currencyCode}
                    description={description}
                    supplierId={supplierId}
                    companyId={companyId}
                    periodLabel={periodLabel}
                    periodStatus={periodStatus}
                    companyCode={companyCode}
                    companyName={companyName}
                    lines={lines}
                    accounts={accounts}
                    simulation={simulation}
                    onPostingDate={setPostingDate}
                    onDocumentDate={setDocumentDate}
                    onDescription={setDescription}
                    onSupplierId={setSupplierId}
                    onLinesChange={setLines}
                />
            ) : (
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">
                        Select a posting company to start a journal entry.
                    </p>
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}

export default JournalEntryFormPage