'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import FormDialog from '@/components/shared/FormDialog'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineExclamation,
    HiOutlineLightningBolt,
    HiOutlineLink,
    HiOutlinePause,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSwitchHorizontal,
    HiOutlineTrash,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from './FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from './FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoStatusCell,
    FicoTwoLineCell,
    formatFicoDate,
} from './ficoTableUi'
import {
    ficoAccountDeterminationService,
    ficoGlAccountService,
} from '../services/ficoService'
import type {
    FicoAccountDetermination,
    FicoAccountMapping,
    FicoGlAccount,
    FicoTransactionKey,
} from '../types'

type DeterminationTab = 'all' | 'attention'

/** One table row: a mapping, or a placeholder for a key with no active mapping. */
type DeterminationRow = {
    id: string
    key: FicoTransactionKey
    mapping: FicoAccountMapping | null
}

type MappingForm = {
    transactionKeyCode: string
    valuationClassId: string
    debitAccountId: string
    creditAccountId: string
    effectiveFrom: string
    effectiveTo: string
}

const emptyForm: MappingForm = {
    transactionKeyCode: '',
    valuationClassId: '',
    debitAccountId: '',
    creditAccountId: '',
    effectiveFrom: '',
    effectiveTo: '',
}

/** A key MM posts through that has no active mapping: those postings fail. */
function needsAttention(key: FicoTransactionKey) {
    return key.postsAutomatically && key.status === 'ACTIVE' && !key.hasDefaultMapping
}

function AccountCell({ account }: { account?: FicoAccountMapping['debitAccount'] | null }) {
    if (!account) return <span className="text-sm text-gray-400">—</span>
    return (
        <FicoTwoLineCell
            mono
            primary={account.accountCode}
            secondary={account.accountName}
        />
    )
}

/** Account Determination tab of the G/L Accounts workspace; the host page owns the company. */
const AccountDeterminationPanel = ({ companyId }: { companyId: string }) => {
    const [tab, setTab] = useState<DeterminationTab>('all')
    const [data, setData] = useState<FicoAccountDetermination | null>(null)
    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
    const [editing, setEditing] = useState<FicoAccountMapping | null>(null)
    const [form, setForm] = useState<MappingForm>(emptyForm)
    const [deleting, setDeleting] = useState<FicoAccountMapping | null>(null)

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoAccountDeterminationService
            .get(companyId)
            .then(setData)
            .catch((error) => {
                setData(null)
                notifyError(error, 'Unable to load account determination.')
            })
            .finally(() => setLoading(false))
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const chartId = data?.settings?.chartOfAccounts?.id
    useEffect(() => {
        if (!chartId || !companyId) {
            setAccounts([])
            return
        }
        ficoGlAccountService
            .list({ chartOfAccountsId: chartId, companyId, status: 'ACTIVE' })
            .then((rows) =>
                setAccounts(
                    rows.filter((row) => row.isPostingAccount && row.allowAutomaticPosting),
                ),
            )
            .catch(() => setAccounts([]))
    }, [chartId, companyId])

    const keyByCode = useMemo(
        () => new Map((data?.transactionKeys ?? []).map((key) => [key.code, key])),
        [data],
    )

    const rows = useMemo<DeterminationRow[]>(() => {
        if (!data) return []
        const result: DeterminationRow[] = []
        for (const key of data.transactionKeys) {
            const mappings = data.mappings.filter(
                (mapping) => mapping.transactionKeyCode === key.code,
            )
            if (!mappings.length) {
                result.push({ id: `missing-${key.code}`, key, mapping: null })
                continue
            }
            mappings
                .sort((a, b) =>
                    a.valuationScopeKey === '*' ? -1 : b.valuationScopeKey === '*' ? 1 : 0,
                )
                .forEach((mapping) => result.push({ id: mapping.id, key, mapping }))
        }
        return result
    }, [data])

    const attentionRows = useMemo(
        () =>
            rows.filter(
                (row) =>
                    needsAttention(row.key) ||
                    (row.mapping && row.mapping.status !== 'ACTIVE'),
            ),
        [rows],
    )

    const stats = useMemo(() => {
        const keys = data?.transactionKeys ?? []
        return {
            keys: keys.length,
            automatic: keys.filter((key) => key.postsAutomatically).length,
            activeMappings: (data?.mappings ?? []).filter((m) => m.status === 'ACTIVE').length,
            attention: keys.filter(needsAttention).length,
        }
    }, [data])

    const accountOptions = useMemo(
        () =>
            accounts.map((account) => ({
                value: account.id,
                label: `${account.accountCode} — ${account.accountName}`,
            })),
        [accounts],
    )

    const openCreate = (key?: FicoTransactionKey) => {
        setEditing(null)
        setForm({ ...emptyForm, transactionKeyCode: key?.code ?? '' })
        setDialog('create')
    }

    const openEdit = (mapping: FicoAccountMapping) => {
        setEditing(mapping)
        setForm({
            transactionKeyCode: mapping.transactionKeyCode,
            valuationClassId: mapping.valuationClassId ?? '',
            debitAccountId: mapping.debitAccountId,
            creditAccountId: mapping.creditAccountId,
            effectiveFrom: mapping.effectiveFrom?.slice(0, 10) ?? '',
            effectiveTo: mapping.effectiveTo?.slice(0, 10) ?? '',
        })
        setDialog('edit')
    }

    const save = async () => {
        if (!companyId) return
        if (!form.transactionKeyCode || !form.debitAccountId || !form.creditAccountId) {
            notifyError(null, 'Choose the transaction, a debit account and a credit account.')
            return
        }
        setSaving(true)
        try {
            const dates = {
                effectiveFrom: form.effectiveFrom || null,
                effectiveTo: form.effectiveTo || null,
            }
            if (dialog === 'create') {
                await ficoAccountDeterminationService.createMapping({
                    companyId,
                    transactionKeyCode: form.transactionKeyCode,
                    valuationClassId: form.valuationClassId || null,
                    debitAccountId: form.debitAccountId,
                    creditAccountId: form.creditAccountId,
                    ...dates,
                })
                notifySuccess('Account mapping created.')
            } else if (editing) {
                await ficoAccountDeterminationService.updateMapping(editing.id, {
                    debitAccountId: form.debitAccountId,
                    creditAccountId: form.creditAccountId,
                    ...dates,
                })
                notifySuccess('Account mapping updated.')
            }
            setDialog(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to save the account mapping.')
        } finally {
            setSaving(false)
        }
    }

    const toggleStatus = async (mapping: FicoAccountMapping) => {
        try {
            await ficoAccountDeterminationService.updateMapping(mapping.id, {
                status: mapping.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            })
            notifySuccess('Mapping status updated.')
            load()
        } catch (error) {
            notifyError(error, 'Unable to change the mapping status.')
        }
    }

    const remove = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await ficoAccountDeterminationService.removeMapping(deleting.id)
            notifySuccess('Account mapping deleted.')
            setDeleting(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to delete the account mapping.')
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<DeterminationRow>[]>(
        () => [
            {
                header: 'Transaction',
                id: 'key',
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <FicoCodeCell
                            icon="posting"
                            code={row.original.key.code}
                            name={row.original.key.name}
                        />
                        {!row.original.key.postsAutomatically ? (
                            <p className="ml-11 mt-0.5 text-[11px] text-gray-400">
                                Not posted by MM yet
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Valuation class',
                id: 'class',
                cell: ({ row }) =>
                    row.original.mapping ? (
                        row.original.mapping.valuationScopeKey === '*' ? (
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                All classes
                            </span>
                        ) : (
                            <FicoTwoLineCell
                                mono
                                primary={row.original.mapping.valuationScopeKey}
                                secondary={row.original.mapping.valuationClass?.name}
                            />
                        )
                    ) : (
                        <span className="text-xs text-gray-400">—</span>
                    ),
            },
            {
                header: 'Debit',
                id: 'debit',
                cell: ({ row }) => <AccountCell account={row.original.mapping?.debitAccount} />,
            },
            {
                header: '',
                id: 'arrow',
                size: 32,
                cell: ({ row }) =>
                    row.original.mapping ? (
                        <HiOutlineArrowRight className="text-gray-300" />
                    ) : null,
            },
            {
                header: 'Credit',
                id: 'credit',
                cell: ({ row }) => <AccountCell account={row.original.mapping?.creditAccount} />,
            },
            {
                header: 'Effective',
                id: 'effective',
                cell: ({ row }) => {
                    const mapping = row.original.mapping
                    if (!mapping) return <span className="text-xs text-gray-400">—</span>
                    if (!mapping.effectiveFrom && !mapping.effectiveTo) {
                        return <span className="text-xs text-gray-500">Always</span>
                    }
                    return (
                        <span className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                            {mapping.effectiveFrom ? formatFicoDate(mapping.effectiveFrom) : '…'} –{' '}
                            {mapping.effectiveTo ? formatFicoDate(mapping.effectiveTo) : '…'}
                        </span>
                    )
                },
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) => {
                    if (row.original.mapping) {
                        return <FicoStatusCell status={row.original.mapping.status} />
                    }
                    return needsAttention(row.original.key) ? (
                        <StatusBadge tone="danger">Not mapped</StatusBadge>
                    ) : (
                        <StatusBadge tone="default">Not mapped</StatusBadge>
                    )
                },
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => {
                    const mapping = row.original.mapping
                    if (!mapping) {
                        return (
                            <Button
                                size="xs"
                                variant="solid"
                                icon={<HiOutlinePlus />}
                                onClick={() => openCreate(row.original.key)}
                            >
                                Map
                            </Button>
                        )
                    }
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            <Dropdown.Item eventKey="edit" onClick={() => openEdit(mapping)}>
                                <HiOutlinePencil className="text-base" />
                                <span>Edit accounts</span>
                            </Dropdown.Item>
                            <Dropdown.Item eventKey="status" onClick={() => toggleStatus(mapping)}>
                                <HiOutlinePause className="text-base" />
                                <span>{mapping.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</span>
                            </Dropdown.Item>
                            <Dropdown.Item eventKey="delete" onClick={() => setDeleting(mapping)}>
                                <HiOutlineTrash className="text-base text-red-500" />
                                <span className="text-red-500">Delete</span>
                            </Dropdown.Item>
                        </Dropdown>
                    )
                },
            },
        ],
        [],
    )

    const mobile = useMemo(
        () => ({
            title: (row: DeterminationRow) => row.key.code,
            subtitle: (row: DeterminationRow) => row.key.name,
            status: (row: DeterminationRow) =>
                row.mapping
                    ? {
                          text: row.mapping.status,
                          tone: row.mapping.status === 'ACTIVE' ? ('success' as const) : ('warning' as const),
                      }
                    : {
                          text: 'NOT MAPPED',
                          tone: needsAttention(row.key) ? ('danger' as const) : ('default' as const),
                      },
            onPress: (row: DeterminationRow) =>
                row.mapping ? openEdit(row.mapping) : openCreate(row.key),
            fields: [
                {
                    label: 'Debit',
                    value: (row: DeterminationRow) => row.mapping?.debitAccount.accountCode ?? '—',
                },
                {
                    label: 'Credit',
                    value: (row: DeterminationRow) => row.mapping?.creditAccount.accountCode ?? '—',
                },
                {
                    label: 'Class',
                    value: (row: DeterminationRow) =>
                        !row.mapping
                            ? '—'
                            : row.mapping.valuationScopeKey === '*'
                              ? 'All classes'
                              : row.mapping.valuationScopeKey,
                },
                {
                    label: 'Posts by MM',
                    value: (row: DeterminationRow) => (row.key.postsAutomatically ? 'Yes' : 'Not yet'),
                },
            ],
        }),
        [],
    )

    const selectedKey = keyByCode.get(form.transactionKeyCode)
    const keyOptions = (data?.transactionKeys ?? [])
        .filter((key) => key.status === 'ACTIVE')
        .map((key) => ({ value: key.code, label: `${key.code} — ${key.name}` }))
    const classOptions = [
        { value: '', label: 'All valuation classes (default)' },
        ...(data?.valuationClasses ?? []).map((row) => ({
            value: row.id,
            label: `${row.code} — ${row.name}`,
        })),
    ]
    const debitLabel = accountOptions.find((o) => o.value === form.debitAccountId)?.label
    const creditLabel = accountOptions.find((o) => o.value === form.creditAccountId)?.label
    const settings = data?.settings

    return (
        <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Transaction keys"
                    value={data ? stats.keys : '—'}
                    icon={<HiOutlineSwitchHorizontal />}
                    loading={loading}
                />
                <StatCard
                    label="Posted by MM today"
                    value={data ? stats.automatic : '—'}
                    icon={<HiOutlineLightningBolt />}
                    tone="info"
                    loading={loading}
                />
                <StatCard
                    label="Active mappings"
                    value={data ? stats.activeMappings : '—'}
                    icon={<HiOutlineCheckCircle />}
                    tone="success"
                    loading={loading}
                />
                <StatCard
                    label="Needs attention"
                    value={data ? stats.attention : '—'}
                    icon={<HiOutlineExclamation />}
                    tone={stats.attention ? 'danger' : 'default'}
                    loading={loading}
                />
            </div>

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center dark:border-gray-700 dark:bg-gray-800/40">
                    <FicoTwoLineCell
                        primary={
                            settings?.chartOfAccounts
                                ? `${settings.chartOfAccounts.code} — ${settings.chartOfAccounts.name}`
                                : 'No chart assigned'
                        }
                        secondary="Chart of accounts"
                    />
                    <FicoTwoLineCell
                        primary={settings?.profile ? settings.profile.code : 'No profile'}
                        secondary="Determination profile"
                    />
                    <FicoTwoLineCell
                        primary={settings?.status ?? 'Not configured'}
                        secondary="Company accounting"
                    />
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="solid"
                            size="sm"
                            icon={<HiOutlinePlus />}
                            disabled={!settings?.profile}
                            onClick={() => openCreate()}
                        >
                            New mapping
                        </Button>
                    </div>
                </div>

                {data && !settings?.profile ? (
                    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                        This company has no accounting configuration with a determination profile yet. Set
                        it up in{' '}
                        <Link href="/modules/fico/company-settings" className="font-semibold underline">
                            Company Accounting Settings
                        </Link>{' '}
                        first.
                    </p>
                ) : null}

                <Tabs value={tab} onChange={(value) => setTab(value as DeterminationTab)}>
                    <Tabs.TabList className="flex flex-wrap gap-1">
                        <Tabs.TabNav value="all">
                            All transactions
                            <span className="ml-1.5 text-xs text-gray-400">{rows.length}</span>
                        </Tabs.TabNav>
                        <Tabs.TabNav value="attention">
                            Needs attention
                            <span
                                className={`ml-1.5 text-xs ${attentionRows.length ? 'text-red-500' : 'text-gray-400'}`}
                            >
                                {attentionRows.length}
                            </span>
                        </Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>

                <p className="mb-3 mt-4 flex items-start gap-1.5 text-xs text-gray-500">
                    <HiOutlineLink className="mt-0.5 shrink-0" />
                    A class-specific mapping wins over the “All classes” default. An MM posting with no
                    matching active mapping is rejected, never posted to a fallback account.
                </p>

                <p className="mb-3 text-xs text-gray-500">
                    These transaction-key mappings are the MM journal path. Debit/credit rules for MM,
                    SD and PP together are maintained in{' '}
                    <Link
                        href="/modules/fico/account-determination-rules"
                        className="font-semibold underline"
                    >
                        Account Determination Rules
                    </Link>
                    .
                </p>

                <FicoResponsiveTable<DeterminationRow>
                    columns={columns}
                    data={tab === 'all' ? rows : attentionRows}
                    compact
                    loading={loading}
                    noData={!loading && !(tab === 'all' ? rows : attentionRows).length}
                    customNoDataIcon={
                        <p className="py-8 text-center text-sm text-gray-500">
                            {tab === 'attention'
                                ? 'Every transaction MM posts through has an active mapping.'
                                : 'Select a company to see its account determination.'}
                        </p>
                    }
                    rowClassName={(row) =>
                        !row.mapping && needsAttention(row.key)
                            ? 'bg-red-50/40 dark:bg-red-500/5'
                            : undefined
                    }
                    getRowId={(row) => row.id}
                    hidePagination
                    tableMinWidthClass="min-w-[1080px]"
                    mobile={mobile}
                    instanceId="fico-account-determination"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={dialog !== null}
                onClose={() => setDialog(null)}
                size="lg"
                icon={<HiOutlineSwitchHorizontal />}
                title={dialog === 'edit' ? 'Edit account mapping' : 'New account mapping'}
                description={
                    settings?.chartOfAccounts
                        ? `Accounts from ${settings.chartOfAccounts.code} that accept automatic postings for this company.`
                        : undefined
                }
                onSubmit={save}
                confirmText={dialog === 'edit' ? 'Save changes' : 'Create mapping'}
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <FormItem label="Transaction" asterisk className="sm:col-span-2">
                        <Select
                            placeholder="Select a transaction key"
                            isDisabled={dialog === 'edit'}
                            options={keyOptions}
                            value={keyOptions.find((o) => o.value === form.transactionKeyCode) ?? null}
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    transactionKeyCode:
                                        (option as { value: string } | null)?.value ?? '',
                                    valuationClassId: '',
                                }))
                            }
                        />
                        {selectedKey ? (
                            <p className="mt-1.5 text-xs text-gray-500">
                                {selectedKey.description}
                                {!selectedKey.postsAutomatically
                                    ? ' MM does not post this transaction yet, so the mapping is not used today.'
                                    : ''}
                            </p>
                        ) : null}
                    </FormItem>
                    {selectedKey?.requiresValuationClass ? (
                        <FormItem label="Valuation class" className="sm:col-span-2">
                            <Select
                                isDisabled={dialog === 'edit'}
                                options={classOptions}
                                value={
                                    classOptions.find((o) => o.value === form.valuationClassId) ??
                                    classOptions[0]
                                }
                                onChange={(option) =>
                                    setForm((current) => ({
                                        ...current,
                                        valuationClassId:
                                            (option as { value: string } | null)?.value ?? '',
                                    }))
                                }
                            />
                        </FormItem>
                    ) : null}
                    <FormItem label="Debit account" asterisk>
                        <Select
                            placeholder="Select debit account"
                            options={accountOptions}
                            value={accountOptions.find((o) => o.value === form.debitAccountId) ?? null}
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    debitAccountId: (option as { value: string } | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Credit account" asterisk>
                        <Select
                            placeholder="Select credit account"
                            options={accountOptions}
                            value={accountOptions.find((o) => o.value === form.creditAccountId) ?? null}
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    creditAccountId: (option as { value: string } | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Effective from">
                        <Input
                            type="date"
                            value={form.effectiveFrom}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, effectiveFrom: event.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Effective to">
                        <Input
                            type="date"
                            value={form.effectiveTo}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, effectiveTo: event.target.value }))
                            }
                        />
                    </FormItem>
                </div>
                {debitLabel && creditLabel ? (
                    <div className="mt-1 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/40">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Journal this produces
                        </p>
                        <p className="mt-1 text-gray-800 dark:text-gray-100">
                            <span className="font-semibold">Dr</span> {debitLabel}
                        </p>
                        <p className="text-gray-800 dark:text-gray-100">
                            <span className="font-semibold">Cr</span> {creditLabel}
                        </p>
                    </div>
                ) : null}
                {!accountOptions.length && settings?.chartOfAccounts ? (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                        No eligible accounts found. Accounts must be active, allow automatic postings, and be
                        assigned to this company on the G/L Accounts page.
                    </p>
                ) : null}
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete account mapping?"
                confirmText="Delete"
                onRequestClose={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
                onConfirm={remove}
                confirmButtonProps={{
                    loading: saving,
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    Delete the <span className="font-semibold">{deleting?.transactionKeyCode}</span> mapping
                    {deleting && deleting.valuationScopeKey !== '*'
                        ? ` for ${deleting.valuationScopeKey}`
                        : ''}
                    ? MM postings for this transaction will be rejected until another active mapping
                    covers them. Deactivate it instead if you only need to pause it.
                </p>
            </ConfirmDialog>
        </>
    )
}

export default AccountDeterminationPanel
