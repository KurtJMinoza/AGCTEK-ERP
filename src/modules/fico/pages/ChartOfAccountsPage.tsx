'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineBookOpen,
    HiOutlineCheckCircle,
    HiOutlineCollection,
    HiOutlineDuplicate,
    HiOutlineExternalLink,
    HiOutlineHashtag,
    HiOutlinePause,
    HiOutlinePencil,
    HiOutlinePencilAlt,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineViewList,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoAccountTypeTag,
    FicoCodeCell,
    FicoCountCell,
    FicoRangeCell,
    FicoStatusCell,
    ficoStatusTone,
} from '../components/ficoTableUi'
import { ficoChartService, ficoGlAccountService } from '../services/ficoService'
import type { FicoAccountGroup, FicoChart, FicoGlAccount } from '../types'

const ROUTE = '/modules/fico/chart-of-accounts'

const glAccountsHref = (chartOfAccountsId: string) =>
    `/modules/fico/gl-accounts?chartOfAccountsId=${encodeURIComponent(chartOfAccountsId)}`
const CATEGORIES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

type CoaTab = 'charts' | 'groups'

type ChartForm = {
    code: string
    name: string
    description: string
    countryCode: string
    accountCodeLength: string
}

type GroupForm = {
    code: string
    name: string
    category: string
    parentGroupId: string
    rangeFrom: string
    rangeTo: string
    sortOrder: number
}

type TreeGroup = FicoAccountGroup & { depth: number }

type PendingDelete =
    | { kind: 'chart'; chart: FicoChart }
    | { kind: 'group'; group: FicoAccountGroup }
    | null

const emptyChart: ChartForm = {
    code: '',
    name: '',
    description: '',
    countryCode: 'PH',
    accountCodeLength: '',
}

const emptyGroup: GroupForm = {
    code: '',
    name: '',
    category: 'ASSET',
    parentGroupId: '',
    rangeFrom: '',
    rangeTo: '',
    sortOrder: 0,
}

function codeLengthPayload(value: string) {
    return value.trim() ? Number(value) : null
}

const ChartOfAccountsPage = () => {
    const router = useRouter()
    const [tab, setTab] = useState<CoaTab>('charts')
    const [charts, setCharts] = useState<FicoChart[]>([])
    const [groups, setGroups] = useState<FicoAccountGroup[]>([])
    /** null = the user may not read G/L accounts. */
    const [accounts, setAccounts] = useState<FicoGlAccount[] | null>([])
    const [selected, setSelected] = useState<FicoChart | null>(null)
    const [search, setSearch] = useState('')
    const [groupSearch, setGroupSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [groupLoading, setGroupLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [chartDialog, setChartDialog] = useState<
        'create' | 'edit' | 'duplicate' | null
    >(null)
    const [chartForm, setChartForm] = useState<ChartForm>(emptyChart)
    const [groupDialog, setGroupDialog] = useState<'create' | 'edit' | null>(null)
    const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroup)
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)

    const loadCharts = useCallback(() => {
        setLoading(true)
        ficoChartService
            .list({ search: search || undefined })
            .then((rows) => {
                setCharts(rows)
                setSelected((current) => {
                    if (!current) return rows[0] ?? null
                    return rows.find((row) => row.id === current.id) ?? rows[0] ?? null
                })
            })
            .catch((error) => notifyError(error, 'Unable to load charts of accounts.'))
            .finally(() => setLoading(false))
    }, [search])

    useEffect(() => {
        loadCharts()
    }, [loadCharts])

    const loadGroups = useCallback((chartId: string) => {
        setGroupLoading(true)
        // Account figures need `fico.gl-accounts`; a user without it still manages groups.
        Promise.allSettled([
            ficoChartService.listGroups(chartId),
            ficoGlAccountService.list({ chartOfAccountsId: chartId }),
        ])
            .then(([groupResult, accountResult]) => {
                if (groupResult.status === 'fulfilled') {
                    setGroups(groupResult.value)
                } else {
                    setGroups([])
                    notifyError(groupResult.reason, 'Unable to load account groups.')
                }
                setAccounts(accountResult.status === 'fulfilled' ? accountResult.value : null)
            })
            .finally(() => setGroupLoading(false))
    }, [])

    useEffect(() => {
        if (selected) loadGroups(selected.id)
        else {
            setGroups([])
            setAccounts([])
        }
    }, [selected, loadGroups])

    const accountStats = useMemo(() => {
        if (!selected || !accounts) return { active: '—', inactive: '—', postable: '—' }
        return {
            active: accounts.filter((account) => account.status === 'ACTIVE').length,
            inactive: accounts.filter((account) => account.status !== 'ACTIVE').length,
            postable: accounts.filter(
                (account) => account.status === 'ACTIVE' && account.isPostingAccount,
            ).length,
        }
    }, [accounts, selected])

    const manageGroups = (chart: FicoChart) => {
        setSelected(chart)
        setGroupSearch('')
        setTab('groups')
    }

    const openCreateChart = () => {
        setChartForm(emptyChart)
        setChartDialog('create')
    }

    const chartToForm = (chart: FicoChart): ChartForm => ({
        code: chart.code,
        name: chart.name,
        description: chart.description,
        countryCode: chart.countryCode,
        accountCodeLength: chart.accountCodeLength ? String(chart.accountCodeLength) : '',
    })

    const openEditChart = (chart: FicoChart) => {
        setChartForm(chartToForm(chart))
        setSelected(chart)
        setChartDialog('edit')
    }

    const openDuplicateChart = (chart: FicoChart) => {
        setChartForm({
            ...chartToForm(chart),
            code: `${chart.code}_COPY`,
            name: `${chart.name} (copy)`,
        })
        setSelected(chart)
        setChartDialog('duplicate')
    }

    const saveChart = async () => {
        if (!chartForm.code.trim() || !chartForm.name.trim()) {
            notifyError(null, 'Code and name are required.')
            return
        }
        setSaving(true)
        try {
            if (chartDialog === 'create') {
                await ficoChartService.create({
                    code: chartForm.code,
                    name: chartForm.name,
                    description: chartForm.description,
                    countryCode: chartForm.countryCode,
                    accountCodeLength: codeLengthPayload(chartForm.accountCodeLength),
                })
                notifySuccess('Chart of accounts created.')
            } else if (chartDialog === 'duplicate' && selected) {
                await ficoChartService.duplicate(selected.id, {
                    code: chartForm.code,
                    name: chartForm.name,
                    description: chartForm.description,
                })
                notifySuccess('Chart of accounts duplicated.')
            } else if (chartDialog === 'edit' && selected) {
                await ficoChartService.update(selected.id, {
                    name: chartForm.name,
                    description: chartForm.description,
                    countryCode: chartForm.countryCode,
                    accountCodeLength: codeLengthPayload(chartForm.accountCodeLength),
                })
                notifySuccess('Chart of accounts updated.')
            }
            setChartDialog(null)
            loadCharts()
        } catch (error) {
            notifyError(error, 'Unable to save the chart of accounts.')
        } finally {
            setSaving(false)
        }
    }

    const toggleChart = async (chart: FicoChart) => {
        try {
            await ficoChartService.update(chart.id, {
                status: chart.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            })
            notifySuccess('Chart status updated.')
            loadCharts()
        } catch (error) {
            notifyError(error, 'Unable to change chart status.')
        }
    }

    const openCreateGroup = (parent?: FicoAccountGroup) => {
        setEditingGroupId(null)
        setGroupForm({
            ...emptyGroup,
            category: parent?.category ?? 'ASSET',
            parentGroupId: parent?.id ?? '',
        })
        setGroupDialog('create')
    }

    const openEditGroup = (group: FicoAccountGroup) => {
        setEditingGroupId(group.id)
        setGroupForm({
            code: group.code,
            name: group.name,
            category: group.category,
            parentGroupId: group.parentGroupId ?? '',
            rangeFrom: group.rangeFrom ?? '',
            rangeTo: group.rangeTo ?? '',
            sortOrder: group.sortOrder,
        })
        setGroupDialog('edit')
    }

    const saveGroup = async () => {
        if (!selected) return
        if (!groupForm.code.trim() || !groupForm.name.trim()) {
            notifyError(null, 'Code and name are required.')
            return
        }
        setSaving(true)
        try {
            const payload = {
                ...groupForm,
                parentGroupId: groupForm.parentGroupId || null,
                rangeFrom: groupForm.rangeFrom.trim() || null,
                rangeTo: groupForm.rangeTo.trim() || null,
            }
            if (groupDialog === 'create') {
                await ficoChartService.createGroup(selected.id, payload)
                notifySuccess('Account group created.')
            } else if (editingGroupId) {
                await ficoChartService.updateGroup(selected.id, editingGroupId, payload)
                notifySuccess('Account group updated.')
            }
            setGroupDialog(null)
            loadGroups(selected.id)
        } catch (error) {
            notifyError(error, 'Unable to save the account group.')
        } finally {
            setSaving(false)
        }
    }

    const confirmDelete = async () => {
        if (!pendingDelete) return
        setSaving(true)
        try {
            if (pendingDelete.kind === 'chart') {
                await ficoChartService.remove(pendingDelete.chart.id)
                notifySuccess('Chart of accounts deleted.')
                if (selected?.id === pendingDelete.chart.id) setSelected(null)
                loadCharts()
            } else if (selected) {
                await ficoChartService.removeGroup(selected.id, pendingDelete.group.id)
                notifySuccess('Account group deleted.')
                loadGroups(selected.id)
            }
            setPendingDelete(null)
        } catch (error) {
            notifyError(error, 'Unable to delete.')
        } finally {
            setSaving(false)
        }
    }

    const orderedGroups = useMemo(() => {
        const byParent = new Map<string | null, FicoAccountGroup[]>()
        for (const group of groups) {
            const key = group.parentGroupId ?? null
            byParent.set(key, [...(byParent.get(key) ?? []), group])
        }
        const result: TreeGroup[] = []
        const walk = (parentId: string | null, depth: number) => {
            const children = [...(byParent.get(parentId) ?? [])].sort(
                (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
            )
            for (const child of children) {
                result.push({ ...child, depth })
                walk(child.id, depth + 1)
            }
        }
        walk(null, 0)
        return result
    }, [groups])

    const visibleGroups = useMemo(() => {
        const term = groupSearch.trim().toLowerCase()
        if (!term) return orderedGroups
        return orderedGroups.filter(
            (group) =>
                group.code.toLowerCase().includes(term) ||
                group.name.toLowerCase().includes(term),
        )
    }, [orderedGroups, groupSearch])

    const chartColumns = useMemo<ColumnDef<FicoChart>[]>(
        () => [
            {
                header: 'Chart of accounts',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="chart"
                        code={row.original.code}
                        name={row.original.name}
                        onClick={() => manageGroups(row.original)}
                    />
                ),
            },
            {
                header: 'Code length',
                accessorKey: 'accountCodeLength',
                cell: ({ row }) =>
                    row.original.accountCodeLength ? (
                        <FicoCountCell value={row.original.accountCodeLength} label="digits" />
                    ) : (
                        <span className="text-xs text-gray-400">Free</span>
                    ),
            },
            {
                header: 'Groups',
                id: 'groups',
                cell: ({ row }) => <FicoCountCell value={row.original._count?.groups} />,
            },
            {
                header: 'G/L accounts',
                id: 'accounts',
                cell: ({ row }) => (
                    <Link
                        href={glAccountsHref(row.original.id)}
                        className="group/link inline-flex items-end gap-1 rounded-md hover:text-primary"
                        title={`View the G/L accounts in ${row.original.code}`}
                    >
                        <FicoCountCell value={row.original._count?.accounts} label="view" />
                        <HiOutlineExternalLink className="mb-1 text-gray-400 group-hover/link:text-primary" />
                    </Link>
                ),
            },
            {
                header: 'Assigned to',
                id: 'companies',
                cell: ({ row }) => {
                    const count = row.original._count?.settings ?? 0
                    return count ? (
                        <FicoCountCell value={count} label={count === 1 ? 'company' : 'companies'} />
                    ) : (
                        <span className="text-xs text-gray-400">Unassigned</span>
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <FicoStatusCell status={row.original.status} />,
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="groups" onClick={() => manageGroups(row.original)}>
                            <HiOutlineViewList className="text-base" />
                            <span>Manage account groups</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="accounts"
                            onClick={() => router.push(glAccountsHref(row.original.id))}
                        >
                            <HiOutlineHashtag className="text-base" />
                            <span>View G/L accounts</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="edit" onClick={() => openEditChart(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit chart</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="duplicate"
                            onClick={() => openDuplicateChart(row.original)}
                        >
                            <HiOutlineDuplicate className="text-base" />
                            <span>Duplicate chart</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="status" onClick={() => toggleChart(row.original)}>
                            <HiOutlinePause className="text-base" />
                            <span>
                                {row.original.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="delete"
                            onClick={() => setPendingDelete({ kind: 'chart', chart: row.original })}
                        >
                            <HiOutlineTrash className="text-base text-red-500" />
                            <span className="text-red-500">Delete chart</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [],
    )

    const groupColumns = useMemo<ColumnDef<TreeGroup>[]>(
        () => [
            {
                header: 'Account group',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="group"
                        code={row.original.code}
                        name={row.original.name}
                        depth={groupSearch.trim() ? 0 : row.original.depth}
                        onClick={() => openEditGroup(row.original)}
                    />
                ),
            },
            {
                header: 'Classification',
                accessorKey: 'category',
                cell: ({ row }) => <FicoAccountTypeTag type={row.original.category} />,
            },
            {
                header: 'Account range',
                id: 'range',
                cell: ({ row }) => (
                    <FicoRangeCell
                        rangeFrom={row.original.rangeFrom}
                        rangeTo={row.original.rangeTo}
                    />
                ),
            },
            {
                header: 'G/L accounts',
                id: 'accounts',
                cell: ({ row }) => <FicoCountCell value={row.original._count?.accounts} />,
            },
            {
                header: 'Subgroups',
                id: 'children',
                cell: ({ row }) => <FicoCountCell value={row.original._count?.children} />,
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <FicoStatusCell status={row.original.status} />,
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="sub" onClick={() => openCreateGroup(row.original)}>
                            <HiOutlinePlus className="text-base" />
                            <span>Add subgroup</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="edit" onClick={() => openEditGroup(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit group</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="delete"
                            onClick={() => setPendingDelete({ kind: 'group', group: row.original })}
                        >
                            <HiOutlineTrash className="text-base text-red-500" />
                            <span className="text-red-500">Delete group</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [groupSearch],
    )

    const chartMobile = useMemo(
        () => ({
            title: (chart: FicoChart) => chart.code,
            subtitle: (chart: FicoChart) => chart.name,
            status: (chart: FicoChart) => ({
                text: chart.status,
                tone: ficoStatusTone(chart.status),
            }),
            onPress: manageGroups,
            fields: [
                {
                    label: 'Code length',
                    value: (chart: FicoChart) =>
                        chart.accountCodeLength ? `${chart.accountCodeLength} digits` : 'Free',
                },
                { label: 'Groups', value: (chart: FicoChart) => chart._count?.groups ?? 0 },
                { label: 'Accounts', value: (chart: FicoChart) => chart._count?.accounts ?? 0 },
                {
                    label: 'Companies',
                    value: (chart: FicoChart) => chart._count?.settings ?? 0,
                },
            ],
        }),
        [],
    )

    const groupMobile = useMemo(
        () => ({
            title: (group: TreeGroup) => group.code,
            subtitle: (group: TreeGroup) => group.name,
            status: (group: TreeGroup) => ({
                text: group.status,
                tone: ficoStatusTone(group.status),
            }),
            onPress: openEditGroup,
            fields: [
                {
                    label: 'Classification',
                    value: (group: TreeGroup) => group.category.toLowerCase(),
                },
                {
                    label: 'Range',
                    value: (group: TreeGroup) =>
                        group.rangeFrom && group.rangeTo
                            ? `${group.rangeFrom} – ${group.rangeTo}`
                            : 'Any code',
                },
                { label: 'Accounts', value: (group: TreeGroup) => group._count?.accounts ?? 0 },
                { label: 'Subgroups', value: (group: TreeGroup) => group._count?.children ?? 0 },
            ],
        }),
        [],
    )

    const chartOptions = charts.map((chart) => ({
        value: chart.id,
        label: `${chart.code} — ${chart.name}`,
    }))

    const parentOptions = groups
        .filter((group) => group.id !== editingGroupId)
        .map((group) => ({
            value: group.id,
            label: `${group.code} — ${group.name} (${group.category})`,
        }))

    const headerAction =
        tab === 'charts' ? (
            <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreateChart}>
                New chart
            </Button>
        ) : (
            <Button
                variant="solid"
                size="sm"
                icon={<HiOutlinePlus />}
                disabled={!selected}
                onClick={() => openCreateGroup()}
            >
                New group
            </Button>
        )

    return (
        <PageContainer>
            <PageHeader
                title="Chart of Accounts"
                description="Maintain the ledger structure: charts, numbered account groups, and their hierarchy."
                breadcrumbs={buildErpBreadcrumbs(ROUTE).slice(0, -1)}
                actions={headerAction}
            />

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard
                    label="Charts of accounts"
                    value={charts.length}
                    icon={<HiOutlineBookOpen />}
                    loading={loading}
                />
                <StatCard
                    label="Account groups"
                    value={selected ? groups.length : '—'}
                    icon={<HiOutlineCollection />}
                    tone="info"
                    loading={groupLoading}
                />
                <StatCard
                    label="Active G/L accounts"
                    value={accountStats.active}
                    icon={<HiOutlineCheckCircle />}
                    tone="success"
                    loading={groupLoading}
                />
                <StatCard
                    label="Inactive G/L accounts"
                    value={accountStats.inactive}
                    icon={<HiOutlinePause />}
                    tone="warning"
                    loading={groupLoading}
                />
                <StatCard
                    label="Postable accounts"
                    value={accountStats.postable}
                    icon={<HiOutlinePencilAlt />}
                    loading={groupLoading}
                />
            </div>
            {selected && accounts === null && !groupLoading ? (
                <p className="-mt-2 mb-4 text-xs text-gray-500">
                    G/L account figures need the G/L Accounts read permission.
                </p>
            ) : null}

            <AdaptiveCard>
                <Tabs value={tab} onChange={(value) => setTab(value as CoaTab)}>
                    <Tabs.TabList className="flex flex-wrap gap-1">
                        <Tabs.TabNav value="charts">
                            Charts of accounts
                            <span className="ml-1.5 text-xs text-gray-400">{charts.length}</span>
                        </Tabs.TabNav>
                        <Tabs.TabNav value="groups">
                            Account groups
                            {selected ? (
                                <span className="ml-1.5 text-xs text-gray-400">
                                    {selected.code}
                                </span>
                            ) : null}
                        </Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="mt-4">
                        <Tabs.TabContent value="charts">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <Input
                                    size="sm"
                                    className="sm:max-w-xs"
                                    prefix={<HiOutlineSearch className="text-lg" />}
                                    placeholder="Search code or chart name"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                                <Button
                                    size="sm"
                                    variant="plain"
                                    icon={<HiOutlineRefresh />}
                                    loading={loading}
                                    onClick={loadCharts}
                                >
                                    Refresh
                                </Button>
                            </div>
                            <FicoResponsiveTable<FicoChart>
                                columns={chartColumns}
                                data={charts}
                                compact
                                loading={loading}
                                noData={!loading && !charts.length}
                                getRowId={(row) => row.id}
                                rowClassName={(row) =>
                                    row.id === selected?.id ? 'bg-primary-subtle/30' : undefined
                                }
                                hidePagination
                                tableMinWidthClass="min-w-[880px]"
                                mobile={chartMobile}
                                instanceId="fico-charts"
                            />
                        </Tabs.TabContent>

                        <Tabs.TabContent value="groups">
                            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,22rem)_minmax(0,18rem)_1fr] md:items-center">
                                <Select
                                    size="sm"
                                    placeholder="Select a chart"
                                    options={chartOptions}
                                    value={
                                        chartOptions.find((option) => option.value === selected?.id) ??
                                        null
                                    }
                                    onChange={(option) => {
                                        const next = charts.find(
                                            (chart) =>
                                                chart.id ===
                                                (option as { value: string } | null)?.value,
                                        )
                                        setSelected(next ?? null)
                                    }}
                                />
                                <Input
                                    size="sm"
                                    prefix={<HiOutlineSearch className="text-lg" />}
                                    placeholder="Search group code or name"
                                    value={groupSearch}
                                    onChange={(event) => setGroupSearch(event.target.value)}
                                />
                                <p className="text-xs text-gray-500 md:text-right">
                                    {selected?.accountCodeLength
                                        ? `Codes in ${selected.code} have ${selected.accountCodeLength} digits.`
                                        : 'Codes in this chart can be any length.'}
                                </p>
                            </div>
                            <FicoResponsiveTable<TreeGroup>
                                columns={groupColumns}
                                data={selected ? visibleGroups : []}
                                compact
                                loading={groupLoading}
                                noData={!groupLoading && !visibleGroups.length}
                                customNoDataIcon={
                                    <p className="py-8 text-center text-sm text-gray-500">
                                        {selected
                                            ? 'No account groups yet. Create the first group for this chart.'
                                            : 'Select a chart to see its account groups.'}
                                    </p>
                                }
                                getRowId={(row) => row.id}
                                hidePagination
                                tableMinWidthClass="min-w-[880px]"
                                mobile={groupMobile}
                                instanceId="fico-groups"
                            />
                        </Tabs.TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>

            <FormDialog
                isOpen={chartDialog !== null}
                onClose={() => setChartDialog(null)}
                icon={<HiOutlineBookOpen />}
                title={
                    chartDialog === 'create'
                        ? 'New chart of accounts'
                        : chartDialog === 'duplicate'
                          ? 'Duplicate chart of accounts'
                          : 'Edit chart of accounts'
                }
                description={
                    chartDialog === 'duplicate'
                        ? 'Copies every group, range and account into a new chart.'
                        : undefined
                }
                onSubmit={saveChart}
                confirmText="Save chart"
                confirmLoading={saving}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormItem label="Code" asterisk>
                            <Input
                                placeholder="e.g. AGCTEK_COA"
                                value={chartForm.code}
                                disabled={chartDialog === 'edit'}
                                onChange={(event) =>
                                    setChartForm((current) => ({
                                        ...current,
                                        code: event.target.value.toUpperCase(),
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Name" asterisk>
                            <Input
                                placeholder="e.g. AGCTEK Operating Chart of Accounts"
                                value={chartForm.name}
                                onChange={(event) =>
                                    setChartForm((current) => ({
                                        ...current,
                                        name: event.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Country code">
                            <Input
                                maxLength={2}
                                placeholder="e.g. PH"
                                disabled={chartDialog === 'duplicate'}
                                value={chartForm.countryCode}
                                onChange={(event) =>
                                    setChartForm((current) => ({
                                        ...current,
                                        countryCode: event.target.value.toUpperCase(),
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem
                            label="Account code length"
                            extra={<span className="text-xs text-gray-500">Blank = any length</span>}
                        >
                            <Input
                                type="number"
                                min={1}
                                max={32}
                                placeholder="e.g. 4"
                                disabled={chartDialog === 'duplicate'}
                                value={chartForm.accountCodeLength}
                                onChange={(event) =>
                                    setChartForm((current) => ({
                                        ...current,
                                        accountCodeLength: event.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
                    <FormItem label="Description">
                        <Input
                            textArea
                            rows={3}
                            placeholder="e.g. Standard 4-digit financial account structure for AGCTEK Corporation"
                            value={chartForm.description}
                            onChange={(event) =>
                                setChartForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={groupDialog !== null}
                onClose={() => setGroupDialog(null)}
                icon={<HiOutlineCollection />}
                title={groupDialog === 'edit' ? 'Edit account group' : 'New account group'}
                description={selected ? `${selected.code} — ${selected.name}` : undefined}
                onSubmit={saveGroup}
                confirmText="Save group"
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Code" asterisk>
                        <Input
                            placeholder="e.g. ASSET"
                            value={groupForm.code}
                            disabled={groupDialog === 'edit'}
                            onChange={(event) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    code: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" asterisk>
                        <Input
                            placeholder="e.g. Assets"
                            value={groupForm.name}
                            onChange={(event) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Classification">
                        <Select
                            options={CATEGORIES.map((category) => ({
                                value: category,
                                label: category,
                            }))}
                            value={{ value: groupForm.category, label: groupForm.category }}
                            onChange={(option) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    category:
                                        (option as { value: string } | null)?.value ?? 'ASSET',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Parent group">
                        <Select
                            isClearable
                            placeholder="Top level"
                            options={parentOptions}
                            value={
                                parentOptions.find(
                                    (option) => option.value === groupForm.parentGroupId,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    parentGroupId:
                                        (option as { value: string } | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Account range from">
                        <Input
                            placeholder={
                                selected?.accountCodeLength
                                    ? '1'.padEnd(selected.accountCodeLength, '0')
                                    : 'Optional'
                            }
                            value={groupForm.rangeFrom}
                            onChange={(event) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    rangeFrom: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Account range to">
                        <Input
                            placeholder={
                                selected?.accountCodeLength
                                    ? '1'.padEnd(selected.accountCodeLength, '9')
                                    : 'Optional'
                            }
                            value={groupForm.rangeTo}
                            onChange={(event) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    rangeTo: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Sort order">
                        <Input
                            type="number"
                            min={0}
                            placeholder="e.g. 10"
                            value={groupForm.sortOrder}
                            onChange={(event) =>
                                setGroupForm((current) => ({
                                    ...current,
                                    sortOrder: Number(event.target.value || 0),
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                type="danger"
                title={
                    pendingDelete?.kind === 'chart'
                        ? 'Delete chart of accounts?'
                        : 'Delete account group?'
                }
                confirmText="Delete"
                onRequestClose={() => setPendingDelete(null)}
                onCancel={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                confirmButtonProps={{
                    loading: saving,
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    {pendingDelete?.kind === 'chart' ? (
                        <>
                            Delete <span className="font-semibold">{pendingDelete.chart.code}</span>?
                            Only an empty chart that no company uses can be deleted — deactivate it
                            otherwise.
                        </>
                    ) : pendingDelete?.kind === 'group' ? (
                        <>
                            Delete <span className="font-semibold">{pendingDelete.group.code}</span>?
                            Groups with subgroups or accounts cannot be deleted.
                        </>
                    ) : null}
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ChartOfAccountsPage
