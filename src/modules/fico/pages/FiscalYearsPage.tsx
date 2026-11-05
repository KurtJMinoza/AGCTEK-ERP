'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCalendar,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineDuplicate,
    HiOutlineEye,
    HiOutlineLightningBolt,
    HiOutlineLockOpen,
    HiOutlinePause,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoCountCell,
    FicoStatusCell,
    FicoStatusMix,
    FicoTwoLineCell,
    ficoStatusTone,
    formatFicoDate,
} from '../components/ficoTableUi'
import FiscalYearPreview from '../components/FiscalYearPreview'
import { ficoCalendarService } from '../services/ficoService'
import type {
    FicoFiscalVariant,
    FicoFiscalYearPreview,
    FicoFiscalYearSummary,
    FicoPostingVariant,
} from '../types'

const ROUTE = '/modules/fico/fiscal-years'

const PERIOD_COUNT_OPTIONS = [
    { value: 12, label: '12 — monthly' },
    { value: 6, label: '6 — every 2 months' },
    { value: 4, label: '4 — quarterly' },
    { value: 3, label: '3 — every 4 months' },
    { value: 2, label: '2 — half-yearly' },
    { value: 1, label: '1 — annual' },
]

const YEAR_ASSIGNMENT_OPTIONS = [
    { value: 'YEAR_START', label: 'Year it starts in (Apr 2027 – Mar 2028 = FY 2027)' },
    { value: 'YEAR_END', label: 'Year it ends in (Apr 2027 – Mar 2028 = FY 2028)' },
]

const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const dayLabel = (month: number, day: number) => `${MONTH_SHORT[month - 1]} ${day}`

type FyTab = 'variants' | 'posting' | 'years'

type FiscalForm = {
    code: string
    name: string
    description: string
    startMonth: number
    startDay: number
    normalPeriodCount: number
    specialPeriodCount: number
    yearAssignment: 'YEAR_START' | 'YEAR_END'
}

const emptyFiscalForm: FiscalForm = {
    code: '',
    name: '',
    description: '',
    startMonth: 1,
    startDay: 1,
    normalPeriodCount: 12,
    specialPeriodCount: 4,
    yearAssignment: 'YEAR_START',
}

const FiscalYearsPage = () => {
    const { companies, companyId, selectedRow, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [tab, setTab] = useState<FyTab>('variants')
    const [fiscalVariants, setFiscalVariants] = useState<FicoFiscalVariant[]>([])
    const [postingVariants, setPostingVariants] = useState<FicoPostingVariant[]>([])
    const [years, setYears] = useState<FicoFiscalYearSummary[]>([])
    const [variantSearch, setVariantSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [fiscalDialog, setFiscalDialog] = useState<
        'create' | 'edit' | 'duplicate' | null
    >(null)
    const [editingFiscal, setEditingFiscal] = useState<FicoFiscalVariant | null>(null)
    const [fiscalForm, setFiscalForm] = useState<FiscalForm>(emptyFiscalForm)
    const fiscalStructureLocked =
        fiscalDialog === 'duplicate' ||
        (fiscalDialog === 'edit' && (editingFiscal?._count?.periods ?? 0) > 0)

    const [previewVariant, setPreviewVariant] = useState<FicoFiscalVariant | null>(null)
    const [previewYear, setPreviewYear] = useState(new Date().getFullYear() + 1)
    const [preview, setPreview] = useState<FicoFiscalYearPreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [formPreview, setFormPreview] = useState<FicoFiscalYearPreview | null>(null)
    const [generatePreview, setGeneratePreview] =
        useState<FicoFiscalYearPreview | null>(null)

    const [postingDialog, setPostingDialog] = useState<'create' | 'edit' | null>(null)
    const [editingPosting, setEditingPosting] = useState<FicoPostingVariant | null>(
        null,
    )
    const [postingForm, setPostingForm] = useState({
        code: '',
        name: '',
        description: '',
        allowSpecialPeriods: true,
    })

    const [generateOpen, setGenerateOpen] = useState(false)
    const [generateForm, setGenerateForm] = useState({
        fiscalYear: new Date().getFullYear(),
        fiscalYearVariantId: '',
        postingPeriodVariantId: '',
        specialPeriodCount: 4,
    })

    const loadRefs = useCallback(() => {
        Promise.all([
            ficoCalendarService.listFiscalVariants(),
            ficoCalendarService.listPostingVariants(),
        ])
            .then(([fiscalRows, postingRows]) => {
                setFiscalVariants(fiscalRows)
                setPostingVariants(postingRows)
                setGenerateForm((current) => ({
                    ...current,
                    fiscalYearVariantId:
                        current.fiscalYearVariantId ||
                        fiscalRows.find((row) => row.status === 'ACTIVE')?.id ||
                        '',
                    postingPeriodVariantId:
                        current.postingPeriodVariantId ||
                        postingRows.find((row) => row.status === 'ACTIVE')?.id ||
                        '',
                }))
            })
            .catch((error) => notifyError(error, 'Unable to load fiscal variants.'))
    }, [])

    const loadYears = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoCalendarService
            .listFiscalYears(companyId)
            .then(setYears)
            .catch((error) => notifyError(error, 'Unable to load fiscal years.'))
            .finally(() => setLoading(false))
    }, [companyId])

    useEffect(() => {
        loadRefs()
    }, [loadRefs])

    useEffect(() => {
        loadYears()
    }, [loadYears])

    useEffect(() => {
        const settings = selectedRow?.settings
        setGenerateForm((current) => ({
            ...current,
            fiscalYearVariantId: settings?.fiscalYearVariantId ?? '',
            postingPeriodVariantId: settings?.postingPeriodVariantId ?? '',
        }))
    }, [selectedRow])

    const variantToForm = (variant: FicoFiscalVariant): FiscalForm => ({
        code: variant.code,
        name: variant.name,
        description: variant.description,
        startMonth: variant.startMonth,
        startDay: variant.startDay,
        normalPeriodCount: variant.normalPeriodCount,
        specialPeriodCount: variant.specialPeriodCount,
        yearAssignment: variant.yearAssignment ?? 'YEAR_START',
    })

    const openCreateFiscal = () => {
        setEditingFiscal(null)
        setFiscalForm(emptyFiscalForm)
        setFormPreview(null)
        setFiscalDialog('create')
    }

    const openEditFiscal = (variant: FicoFiscalVariant) => {
        setEditingFiscal(variant)
        setFiscalForm(variantToForm(variant))
        setFormPreview(null)
        setFiscalDialog('edit')
    }

    const openDuplicateFiscal = (variant: FicoFiscalVariant) => {
        setEditingFiscal(variant)
        setFiscalForm({
            ...variantToForm(variant),
            code: `${variant.code}_COPY`,
            name: `${variant.name} (copy)`,
        })
        setFormPreview(null)
        setFiscalDialog('duplicate')
    }

    const saveFiscal = async () => {
        if (!fiscalForm.code.trim() || !fiscalForm.name.trim()) {
            notifyError(null, 'Code and name are required.')
            return
        }
        setSaving(true)
        try {
            if (fiscalDialog === 'create') {
                await ficoCalendarService.createFiscalVariant(fiscalForm)
                notifySuccess('Fiscal year variant created.')
            } else if (fiscalDialog === 'duplicate' && editingFiscal) {
                await ficoCalendarService.duplicateFiscalVariant(editingFiscal.id, {
                    code: fiscalForm.code,
                    name: fiscalForm.name,
                    description: fiscalForm.description,
                })
                notifySuccess('Fiscal year variant duplicated.')
            } else if (editingFiscal) {
                await ficoCalendarService.updateFiscalVariant(editingFiscal.id, {
                    name: fiscalForm.name,
                    description: fiscalForm.description,
                    ...(fiscalStructureLocked
                        ? {}
                        : {
                              startMonth: fiscalForm.startMonth,
                              startDay: fiscalForm.startDay,
                              normalPeriodCount: fiscalForm.normalPeriodCount,
                              specialPeriodCount: fiscalForm.specialPeriodCount,
                              yearAssignment: fiscalForm.yearAssignment,
                          }),
                })
                notifySuccess('Fiscal year variant updated.')
            }
            setFiscalDialog(null)
            loadRefs()
        } catch (error) {
            notifyError(error, 'Unable to save the fiscal year variant.')
        } finally {
            setSaving(false)
        }
    }

    const toggleFiscal = async (variant: FicoFiscalVariant) => {
        try {
            await ficoCalendarService.updateFiscalVariant(variant.id, {
                status: variant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            })
            notifySuccess('Fiscal year variant status updated.')
            loadRefs()
        } catch (error) {
            notifyError(error, 'Unable to change the variant status.')
        }
    }

    const loadPreview = useCallback(
        async (variant: FicoFiscalVariant, fiscalYear: number) => {
            setPreviewLoading(true)
            try {
                setPreview(
                    await ficoCalendarService.preview({
                        fiscalYear,
                        fiscalYearVariantId: variant.id,
                    }),
                )
            } catch (error) {
                setPreview(null)
                notifyError(error, 'Unable to preview the fiscal year.')
            } finally {
                setPreviewLoading(false)
            }
        },
        [],
    )

    const openPreview = (variant: FicoFiscalVariant) => {
        setPreviewVariant(variant)
        setPreview(null)
        void loadPreview(variant, previewYear)
    }

    const changePreviewYear = (year: number) => {
        setPreviewYear(year)
        if (previewVariant && year >= 2000 && year <= 2100) {
            void loadPreview(previewVariant, year)
        }
    }

    const previewFormConfig = async () => {
        setPreviewLoading(true)
        try {
            setFormPreview(
                await ficoCalendarService.preview({
                    fiscalYear: new Date().getFullYear() + 1,
                    startMonth: fiscalForm.startMonth,
                    startDay: fiscalForm.startDay,
                    normalPeriodCount: fiscalForm.normalPeriodCount,
                    specialPeriodCount: fiscalForm.specialPeriodCount,
                    yearAssignment: fiscalForm.yearAssignment,
                }),
            )
        } catch (error) {
            setFormPreview(null)
            notifyError(error, 'This configuration cannot produce a valid calendar.')
        } finally {
            setPreviewLoading(false)
        }
    }

    useEffect(() => {
        if (!generateOpen || !generateForm.fiscalYearVariantId || !generateForm.fiscalYear) {
            setGeneratePreview(null)
            return
        }
        const handle = window.setTimeout(() => {
            ficoCalendarService
                .preview({
                    fiscalYear: generateForm.fiscalYear,
                    fiscalYearVariantId: generateForm.fiscalYearVariantId,
                    specialPeriodCount: generateForm.specialPeriodCount,
                })
                .then(setGeneratePreview)
                .catch(() => setGeneratePreview(null))
        }, 300)
        return () => window.clearTimeout(handle)
    }, [
        generateOpen,
        generateForm.fiscalYear,
        generateForm.fiscalYearVariantId,
        generateForm.specialPeriodCount,
    ])

    const openCreatePosting = () => {
        setEditingPosting(null)
        setPostingForm({
            code: '',
            name: '',
            description: '',
            allowSpecialPeriods: true,
        })
        setPostingDialog('create')
    }

    const openEditPosting = (variant: FicoPostingVariant) => {
        setEditingPosting(variant)
        setPostingForm({
            code: variant.code,
            name: variant.name,
            description: variant.description,
            allowSpecialPeriods: variant.allowSpecialPeriods,
        })
        setPostingDialog('edit')
    }

    const savePosting = async () => {
        setSaving(true)
        try {
            if (postingDialog === 'create') {
                await ficoCalendarService.createPostingVariant(postingForm)
                notifySuccess('Posting period variant created.')
            } else if (editingPosting) {
                await ficoCalendarService.updatePostingVariant(editingPosting.id, {
                    name: postingForm.name,
                    description: postingForm.description,
                    allowSpecialPeriods: postingForm.allowSpecialPeriods,
                })
                notifySuccess('Posting period variant updated.')
            }
            setPostingDialog(null)
            loadRefs()
        } catch (error) {
            notifyError(error, 'Unable to save the posting period variant.')
        } finally {
            setSaving(false)
        }
    }

    const generate = async () => {
        if (!companyId) {
            notifyError(null, 'Select a company first.')
            return
        }
        if (
            !selectedRow?.settings?.fiscalYearVariantId ||
            !selectedRow.settings.postingPeriodVariantId
        ) {
            notifyError(
                null,
                'Configure the company fiscal and posting period variants before generating a fiscal year.',
            )
            return
        }
        setSaving(true)
        try {
            const result = await ficoCalendarService.generate({
                companyId,
                ...generateForm,
            })
            notifySuccess(
                result.existing
                    ? 'This fiscal year already exists with the same calendar.'
                    : `Generated ${result.periods.length} posting periods.`,
            )
            setGenerateOpen(false)
            loadYears()
        } catch (error) {
            notifyError(error, 'Unable to generate the fiscal year.')
        } finally {
            setSaving(false)
        }
    }

    const fiscalColumns = useMemo<ColumnDef<FicoFiscalVariant>[]>(
        () => [
            {
                header: 'Fiscal year variant',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="calendar"
                        code={row.original.code}
                        name={row.original.name}
                        onClick={() => openPreview(row.original)}
                    />
                ),
            },
            {
                header: 'Fiscal year',
                accessorKey: 'startMonth',
                cell: ({ row }) => {
                    const v = row.original
                    return (
                        <FicoTwoLineCell
                            primary={
                                v.endMonth && v.endDay
                                    ? `${dayLabel(v.startMonth, v.startDay)} – ${dayLabel(v.endMonth, v.endDay)}`
                                    : dayLabel(v.startMonth, v.startDay)
                            }
                            secondary={v.calendarYearBased ? 'Calendar year' : 'Non-calendar year'}
                        />
                    )
                },
            },
            {
                header: 'Periods',
                accessorKey: 'normalPeriodCount',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={`${row.original.normalPeriodCount} regular + ${row.original.specialPeriodCount} special`}
                        secondary={(row.original.periodType ?? '').replace(/_/g, ' ').toLowerCase()}
                    />
                ),
            },
            {
                header: 'Year label',
                accessorKey: 'yearAssignment',
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.yearAssignment === 'YEAR_END' ? 'info' : 'default'}>
                        {row.original.yearAssignment === 'YEAR_END' ? 'End year' : 'Start year'}
                    </StatusBadge>
                ),
            },
            {
                header: 'In use',
                id: 'usage',
                cell: ({ row }) => {
                    const usage = row.original._count
                    if (!usage?.periods && !usage?.settings) {
                        return <span className="text-xs text-gray-400">Not used</span>
                    }
                    return (
                        <FicoTwoLineCell
                            primary={`${usage?.settings ?? 0} ${usage?.settings === 1 ? 'company' : 'companies'}`}
                            secondary={`${usage?.periods ?? 0} periods generated · structure locked`}
                        />
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
                        <Dropdown.Item eventKey="preview" onClick={() => openPreview(row.original)}>
                            <HiOutlineEye className="text-base" />
                            <span>Preview fiscal year</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="edit" onClick={() => openEditFiscal(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit variant</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="duplicate"
                            onClick={() => openDuplicateFiscal(row.original)}
                        >
                            <HiOutlineDuplicate className="text-base" />
                            <span>Duplicate variant</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="status" onClick={() => toggleFiscal(row.original)}>
                            <HiOutlinePause className="text-base" />
                            <span>
                                {row.original.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [previewYear],
    )

    const postingColumns = useMemo<ColumnDef<FicoPostingVariant>[]>(
        () => [
            {
                header: 'Posting period variant',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.code}
                        name={row.original.name}
                        onClick={() => openEditPosting(row.original)}
                    />
                ),
            },
            {
                header: 'Description',
                accessorKey: 'description',
                cell: ({ row }) => (
                    <span className="block max-w-[22rem] truncate text-sm text-gray-600 dark:text-gray-300">
                        {row.original.description || '—'}
                    </span>
                ),
            },
            {
                header: 'Special periods',
                accessorKey: 'allowSpecialPeriods',
                cell: ({ row }) =>
                    row.original.allowSpecialPeriods ? (
                        <StatusBadge tone="info">Allowed</StatusBadge>
                    ) : (
                        <StatusBadge tone="default">Blocked</StatusBadge>
                    ),
            },
            {
                header: 'Assigned to',
                id: 'usage',
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
                        <Dropdown.Item eventKey="edit" onClick={() => openEditPosting(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit variant</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [],
    )

    const yearColumns = useMemo<ColumnDef<FicoFiscalYearSummary>[]>(
        () => [
            {
                header: 'Fiscal year',
                accessorKey: 'fiscalYear',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="calendar"
                        code={`FY ${row.original.fiscalYear}`}
                        name={row.original.periods[0]?.fiscalYearVariant?.name ?? null}
                    />
                ),
            },
            {
                header: 'Calendar',
                id: 'calendar',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={`${formatFicoDate(row.original.firstStartDate)} – ${formatFicoDate(row.original.lastEndDate)}`}
                    />
                ),
            },
            {
                header: 'Regular',
                id: 'normal',
                cell: ({ row }) => <FicoCountCell value={row.original.normalCount} label="periods" />,
            },
            {
                header: 'Special',
                id: 'special',
                cell: ({ row }) => <FicoCountCell value={row.original.specialCount} label="periods" />,
            },
            {
                header: 'Period status',
                accessorKey: 'statuses',
                cell: ({ row }) => <FicoStatusMix statuses={row.original.statuses} />,
            },
        ],
        [],
    )

    const fiscalMobile = useMemo(
        () => ({
            title: (variant: FicoFiscalVariant) => variant.code,
            subtitle: (variant: FicoFiscalVariant) => variant.name,
            status: (variant: FicoFiscalVariant) => ({
                text: variant.status,
                tone: ficoStatusTone(variant.status),
            }),
            onPress: openPreview,
            fields: [
                {
                    label: 'Fiscal year',
                    value: (variant: FicoFiscalVariant) =>
                        variant.endMonth && variant.endDay
                            ? `${dayLabel(variant.startMonth, variant.startDay)} – ${dayLabel(variant.endMonth, variant.endDay)}`
                            : dayLabel(variant.startMonth, variant.startDay),
                },
                {
                    label: 'Periods',
                    value: (variant: FicoFiscalVariant) =>
                        `${variant.normalPeriodCount} + ${variant.specialPeriodCount} special`,
                },
                {
                    label: 'Year label',
                    value: (variant: FicoFiscalVariant) =>
                        variant.yearAssignment === 'YEAR_END' ? 'End year' : 'Start year',
                },
                {
                    label: 'Periods generated',
                    value: (variant: FicoFiscalVariant) => variant._count?.periods ?? 0,
                },
            ],
        }),
        [previewYear],
    )

    const postingMobile = useMemo(
        () => ({
            title: (variant: FicoPostingVariant) => variant.code,
            subtitle: (variant: FicoPostingVariant) => variant.name,
            status: (variant: FicoPostingVariant) => ({
                text: variant.status,
                tone: ficoStatusTone(variant.status),
            }),
            onPress: openEditPosting,
            fields: [
                {
                    label: 'Special periods',
                    value: (variant: FicoPostingVariant) =>
                        variant.allowSpecialPeriods ? 'Allowed' : 'Blocked',
                },
                {
                    label: 'Companies',
                    value: (variant: FicoPostingVariant) => variant._count?.settings ?? 0,
                },
            ],
        }),
        [],
    )

    const yearMobile = useMemo(
        () => ({
            title: (year: FicoFiscalYearSummary) => `FY ${year.fiscalYear}`,
            subtitle: (year: FicoFiscalYearSummary) =>
                `${formatFicoDate(year.firstStartDate)} – ${formatFicoDate(year.lastEndDate)}`,
            fields: [
                {
                    label: 'Regular',
                    value: (year: FicoFiscalYearSummary) => year.normalCount,
                },
                {
                    label: 'Special',
                    value: (year: FicoFiscalYearSummary) => year.specialCount,
                },
                {
                    label: 'Open',
                    value: (year: FicoFiscalYearSummary) => year.statuses.OPEN ?? 0,
                },
                {
                    label: 'Closed / locked',
                    value: (year: FicoFiscalYearSummary) =>
                        (year.statuses.CLOSED ?? 0) + (year.statuses.LOCKED ?? 0),
                },
            ],
        }),
        [],
    )

    const openPeriodCount = years.reduce(
        (total, year) => total + (year.statuses.OPEN ?? 0),
        0,
    )
    const activeFiscalCount = fiscalVariants.filter(
        (variant) => variant.status === 'ACTIVE',
    ).length

    const fiscalOptions = fiscalVariants
        .filter((variant) => variant.status === 'ACTIVE')
        .map((variant) => ({
            value: variant.id,
            label: `${variant.code} — ${variant.name}`,
        }))
    const postingOptions = postingVariants
        .filter((variant) => variant.status === 'ACTIVE')
        .map((variant) => ({
            value: variant.id,
            label: `${variant.code} — ${variant.name}`,
        }))

    const matchesVariantSearch = (value: { code: string; name: string }) => {
        const search = variantSearch.trim().toLowerCase()
        return !search || value.code.toLowerCase().includes(search) || value.name.toLowerCase().includes(search)
    }
    const visibleFiscalVariants = fiscalVariants.filter(matchesVariantSearch)
    const visiblePostingVariants = postingVariants.filter(matchesVariantSearch)

    const headerAction =
        tab === 'variants' ? (
            <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreateFiscal}>
                New fiscal variant
            </Button>
        ) : tab === 'posting' ? (
            <Button variant="solid" size="sm" icon={<HiOutlinePlus />} onClick={openCreatePosting}>
                New posting variant
            </Button>
        ) : (
            <Button
                variant="solid"
                size="sm"
                icon={<HiOutlineLightningBolt />}
                onClick={() => setGenerateOpen(true)}
                disabled={!companyId}
            >
                Generate fiscal year
            </Button>
        )

    const searchToolbar = (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Input
                size="sm"
                className="sm:max-w-xs"
                prefix={<HiOutlineSearch className="text-lg" />}
                placeholder="Search code or variant name"
                value={variantSearch}
                onChange={(event) => setVariantSearch(event.target.value)}
            />
            <Button size="sm" variant="plain" icon={<HiOutlineRefresh />} onClick={loadRefs}>
                Refresh
            </Button>
        </div>
    )

    return (
        <PageContainer>
            <PageHeader
                title="Fiscal Years & Variants"
                description="Define reusable fiscal calendars, then generate each company's fiscal years from its assigned variant."
                breadcrumbs={buildErpBreadcrumbs(ROUTE).slice(0, -1)}
                actions={headerAction}
            />

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Fiscal year variants"
                    value={fiscalVariants.length}
                    icon={<HiOutlineCalendar />}
                    badge={{ tone: 'success', label: `${activeFiscalCount} active` }}
                />
                <StatCard
                    label="Posting period variants"
                    value={postingVariants.length}
                    icon={<HiOutlineClipboardList />}
                    tone="info"
                />
                <StatCard
                    label="Fiscal years generated"
                    value={companyId ? years.length : '—'}
                    icon={<HiOutlineCollection />}
                    tone="default"
                    loading={loading}
                />
                <StatCard
                    label="Open posting periods"
                    value={companyId ? openPeriodCount : '—'}
                    icon={<HiOutlineLockOpen />}
                    tone="success"
                    loading={loading}
                />
            </div>

            <AdaptiveCard>
                <Tabs value={tab} onChange={(value) => setTab(value as FyTab)}>
                    <Tabs.TabList className="flex flex-wrap gap-1">
                        <Tabs.TabNav value="variants">
                            Fiscal year variants
                            <span className="ml-1.5 text-xs text-gray-400">
                                {fiscalVariants.length}
                            </span>
                        </Tabs.TabNav>
                        <Tabs.TabNav value="posting">
                            Posting period variants
                            <span className="ml-1.5 text-xs text-gray-400">
                                {postingVariants.length}
                            </span>
                        </Tabs.TabNav>
                        <Tabs.TabNav value="years">
                            Generated fiscal years
                            {companyId ? (
                                <span className="ml-1.5 text-xs text-gray-400">{years.length}</span>
                            ) : null}
                        </Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="mt-4">
                        <Tabs.TabContent value="variants">
                            {searchToolbar}
                            <FicoResponsiveTable<FicoFiscalVariant>
                                columns={fiscalColumns}
                                data={visibleFiscalVariants}
                                compact
                                noData={!visibleFiscalVariants.length}
                                getRowId={(row) => row.id}
                                hidePagination
                                tableMinWidthClass="min-w-[1000px]"
                                mobile={fiscalMobile}
                                instanceId="fico-fiscal-variants"
                            />
                        </Tabs.TabContent>

                        <Tabs.TabContent value="posting">
                            {searchToolbar}
                            <FicoResponsiveTable<FicoPostingVariant>
                                columns={postingColumns}
                                data={visiblePostingVariants}
                                compact
                                noData={!visiblePostingVariants.length}
                                getRowId={(row) => row.id}
                                hidePagination
                                tableMinWidthClass="min-w-[820px]"
                                mobile={postingMobile}
                                instanceId="fico-posting-variants"
                            />
                        </Tabs.TabContent>

                        <Tabs.TabContent value="years">
                            <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/40 md:grid-cols-[minmax(0,16rem)_1fr_1fr_auto] md:items-center">
                                <FicoCompanySelect
                                    companies={companies}
                                    value={companyId}
                                    onChange={setCompanyId}
                                    loading={companyLoading}
                                />
                                <FicoTwoLineCell
                                    primary={
                                        selectedRow?.settings?.fiscalYearVariant?.name ??
                                        'Not assigned'
                                    }
                                    secondary="Assigned fiscal year variant"
                                />
                                <FicoTwoLineCell
                                    primary={
                                        selectedRow?.settings?.postingPeriodVariant?.name ??
                                        'Not assigned'
                                    }
                                    secondary="Assigned posting period variant"
                                />
                                <Button
                                    size="sm"
                                    variant="plain"
                                    icon={<HiOutlineRefresh />}
                                    loading={loading}
                                    onClick={loadYears}
                                >
                                    Refresh
                                </Button>
                            </div>
                            <FicoResponsiveTable<FicoFiscalYearSummary>
                                columns={yearColumns}
                                data={years}
                                compact
                                loading={loading}
                                noData={!loading && !years.length}
                                customNoDataIcon={
                                    <p className="py-8 text-center text-sm text-gray-500">
                                        {companyId
                                            ? 'No fiscal years generated yet. Use “Generate fiscal year” to create the periods.'
                                            : 'Select a company to see its fiscal years.'}
                                    </p>
                                }
                                getRowId={(row) => String(row.fiscalYear)}
                                hidePagination
                                tableMinWidthClass="min-w-[820px]"
                                mobile={yearMobile}
                                instanceId="fico-fiscal-years"
                            />
                        </Tabs.TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>

            <FormDialog
                isOpen={fiscalDialog !== null}
                onClose={() => setFiscalDialog(null)}
                title={
                    fiscalDialog === 'edit'
                        ? 'Edit fiscal year variant'
                        : fiscalDialog === 'duplicate'
                          ? 'Duplicate fiscal year variant'
                          : 'New fiscal year variant'
                }
                description={
                    fiscalDialog === 'duplicate'
                        ? 'The copy keeps the same calendar structure under a new code.'
                        : fiscalStructureLocked
                          ? 'This variant already generated periods, so its calendar structure is locked. Duplicate it to define a different calendar.'
                          : undefined
                }
                size="lg"
                onSubmit={saveFiscal}
                confirmText="Save variant"
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Code" asterisk>
                        <Input
                            placeholder="e.g. AGCTEK_FY"
                            value={fiscalForm.code}
                            disabled={fiscalDialog === 'edit'}
                            onChange={(event) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    code: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" asterisk>
                        <Input
                            placeholder="e.g. AGCTEK Calendar Fiscal Year"
                            value={fiscalForm.name}
                            onChange={(event) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Start month">
                        <Select
                            isDisabled={fiscalStructureLocked}
                            options={MONTH_SHORT.map((label, index) => ({
                                value: index + 1,
                                label,
                            }))}
                            value={{
                                value: fiscalForm.startMonth,
                                label: MONTH_SHORT[fiscalForm.startMonth - 1],
                            }}
                            onChange={(option) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    startMonth:
                                        (option as { value: number } | null)?.value ?? 1,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Start day">
                        <Input
                            type="number"
                            min={1}
                            max={31}
                            placeholder="e.g. 1"
                            disabled={fiscalStructureLocked}
                            value={fiscalForm.startDay}
                            onChange={(event) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    startDay: Number(event.target.value || 1),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Regular periods">
                        <Select
                            isDisabled={fiscalStructureLocked}
                            options={PERIOD_COUNT_OPTIONS}
                            value={
                                PERIOD_COUNT_OPTIONS.find(
                                    (option) =>
                                        option.value === fiscalForm.normalPeriodCount,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    normalPeriodCount:
                                        (option as { value: number } | null)?.value ?? 12,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Special periods (max 4)">
                        <Input
                            type="number"
                            min={0}
                            max={4}
                            placeholder="0 – 4"
                            disabled={fiscalStructureLocked}
                            value={fiscalForm.specialPeriodCount}
                            onChange={(event) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    specialPeriodCount: Number(event.target.value || 0),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Fiscal year is labelled by" className="sm:col-span-2">
                        <Select
                            isDisabled={fiscalStructureLocked}
                            options={YEAR_ASSIGNMENT_OPTIONS}
                            value={
                                YEAR_ASSIGNMENT_OPTIONS.find(
                                    (option) => option.value === fiscalForm.yearAssignment,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    yearAssignment:
                                        ((option as { value: string } | null)?.value as
                                            | FiscalForm['yearAssignment']
                                            | undefined) ?? 'YEAR_START',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Description" className="sm:col-span-2">
                        <Input
                            textArea
                            rows={3}
                            placeholder="e.g. January to December fiscal calendar with 12 monthly periods"
                            value={fiscalForm.description}
                            onChange={(event) =>
                                setFiscalForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-gray-500">
                            Check the generated periods before saving.
                        </p>
                        <Button
                            size="sm"
                            type="button"
                            loading={previewLoading && !previewVariant}
                            onClick={previewFormConfig}
                        >
                            Preview next year
                        </Button>
                    </div>
                    {formPreview ? <FiscalYearPreview preview={formPreview} compact /> : null}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={previewVariant !== null}
                onClose={() => setPreviewVariant(null)}
                title={
                    previewVariant
                        ? `Fiscal year preview — ${previewVariant.code}`
                        : 'Fiscal year preview'
                }
                description="Read-only. Nothing is created until a fiscal year is generated for a company."
                size="lg"
                footer={
                    <Button size="sm" onClick={() => setPreviewVariant(null)}>
                        Close
                    </Button>
                }
            >
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                            <Button
                                size="sm"
                                variant="plain"
                                icon={<HiOutlineChevronLeft />}
                                aria-label="Previous fiscal year"
                                disabled={previewYear <= 2000}
                                onClick={() => changePreviewYear(previewYear - 1)}
                            />
                            <Input
                                size="sm"
                                type="number"
                                min={2000}
                                max={2100}
                                placeholder="e.g. 2027"
                                className="w-24 text-center font-semibold tabular-nums"
                                value={previewYear}
                                onChange={(event) =>
                                    changePreviewYear(Number(event.target.value || 0))
                                }
                            />
                            <Button
                                size="sm"
                                variant="plain"
                                icon={<HiOutlineChevronRight />}
                                aria-label="Next fiscal year"
                                disabled={previewYear >= 2100}
                                onClick={() => changePreviewYear(previewYear + 1)}
                            />
                        </div>
                        {previewVariant ? (
                            <p className="text-xs text-gray-500">
                                {previewVariant.name} · starts{' '}
                                {dayLabel(previewVariant.startMonth, previewVariant.startDay)}
                            </p>
                        ) : null}
                    </div>
                    <FiscalYearPreview preview={preview} loading={previewLoading} />
                </div>
            </FormDialog>

            <FormDialog
                isOpen={postingDialog !== null}
                onClose={() => setPostingDialog(null)}
                title={
                    postingDialog === 'edit'
                        ? 'Edit posting period variant'
                        : 'New posting period variant'
                }
                onSubmit={savePosting}
                confirmText="Save variant"
                confirmLoading={saving}
            >
                <div className="space-y-4">
                    <FormItem label="Code" asterisk>
                        <Input
                            placeholder="e.g. PH_STANDARD"
                            value={postingForm.code}
                            disabled={postingDialog === 'edit'}
                            onChange={(event) =>
                                setPostingForm((current) => ({
                                    ...current,
                                    code: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" asterisk>
                        <Input
                            placeholder="e.g. Philippines Standard Posting Periods"
                            value={postingForm.name}
                            onChange={(event) =>
                                setPostingForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Description">
                        <Input
                            textArea
                            rows={3}
                            placeholder="e.g. Monthly periods with controlled year-end special periods"
                            value={postingForm.description}
                            onChange={(event) =>
                                setPostingForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <Checkbox
                        checked={postingForm.allowSpecialPeriods}
                        onChange={(checked) =>
                            setPostingForm((current) => ({
                                ...current,
                                allowSpecialPeriods: checked,
                            }))
                        }
                    >
                        Allow special periods
                    </Checkbox>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={generateOpen}
                onClose={() => setGenerateOpen(false)}
                title="Generate fiscal year"
                description="Creates normal periods plus optional year-end special periods. The first period starts as FUTURE and must be opened before posting."
                size="lg"
                onSubmit={generate}
                confirmText="Generate periods"
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Fiscal year">
                        <Input
                            type="number"
                            min={2000}
                            max={2100}
                            placeholder="e.g. 2027"
                            value={generateForm.fiscalYear}
                            onChange={(event) =>
                                setGenerateForm((current) => ({
                                    ...current,
                                    fiscalYear: Number(event.target.value || 0),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Special periods">
                        <Input
                            type="number"
                            min={0}
                            max={4}
                            placeholder="0 – 4"
                            value={generateForm.specialPeriodCount}
                            onChange={(event) =>
                                setGenerateForm((current) => ({
                                    ...current,
                                    specialPeriodCount: Number(
                                        event.target.value || 0,
                                    ),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Fiscal year variant" className="sm:col-span-2">
                        <Select
                            options={fiscalOptions}
                            value={
                                fiscalOptions.find(
                                    (option) =>
                                        option.value ===
                                        generateForm.fiscalYearVariantId,
                                ) ?? null
                            }
                            isDisabled
                        />
                    </FormItem>
                    <FormItem label="Posting period variant" className="sm:col-span-2">
                        <Select
                            options={postingOptions}
                            value={
                                postingOptions.find(
                                    (option) =>
                                        option.value ===
                                        generateForm.postingPeriodVariantId,
                                ) ?? null
                            }
                            isDisabled
                        />
                    </FormItem>
                </div>
                <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                    <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        Periods that will be created
                    </p>
                    <FiscalYearPreview preview={generatePreview} compact />
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default FiscalYearsPage
