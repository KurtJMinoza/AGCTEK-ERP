'use client'

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react'
import { motion } from 'framer-motion'
import {
    HiOutlineDownload,
    HiOutlineUpload,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineRefresh,
    HiOutlineArrowRight,
    HiOutlineDocument,
} from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { PRODUCT_DIVISIONS } from '@/modules/sd/catalogs/productDivisions'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import {
    cancelProductImport,
    commitProductImport,
    downloadProductImportErrors,
    downloadProductImportTemplate,
    getProductImportBatch,
    listProductImportBatches,
    postProductImportOpeningStock,
    previewProductImport,
    retryProductImport,
    type ProductImportBatch,
    type ProductImportRow,
} from '@/modules/sd/services/productImportService'

type Props = {
    isOpen: boolean
    source?: 'SD' | 'MM'
    defaultDivisionId?: string
    onClose: () => void
    onImported?: () => void | Promise<void>
}

type Option = { value: string; label: string }

const DIVISION_OPTIONS: Option[] = PRODUCT_DIVISIONS.map((d) => ({
    value: d.id,
    label: d.label,
}))

const STATUS_TONE: Record<string, string> = {
    VALID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    IMPORTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    INVALID: 'bg-rose-50 text-rose-700 border-rose-200',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
    COMMITTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PREVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    CANCELLED: 'bg-slate-50 text-slate-700 border-slate-200',
}

const ACTION_TONE: Record<string, string> = {
    CREATE_MATERIAL: 'bg-blue-50 text-blue-700 border-blue-200',
    ADD_LISTING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    UPDATE: 'bg-purple-50 text-purple-700 border-purple-200',
}

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const newIdempotencyKey = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `import-${Date.now()}-${Math.random().toString(16).slice(2)}`

/**
 * Stat card for the import summary row.
 */
const countCard = (
    value: number,
    label: string,
    icon: React.ReactNode,
    tone: string,
) => (
    <div
        className={`
            rounded-xl border p-4 flex flex-col items-start gap-2
            ${tone}
            hover:border-primary/50 transition-all duration-200
        `}
    >
        <div className="flex items-center gap-2">
            <div className={`rounded bg-gray-100 p-1.5 ${tone}`}>
                {icon}
            </div>
        </div>
        <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {value}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
)

/**
 * Animated circular progress indicator shown during import commit.
 */
const ImportProgress = ({ progress }: { progress: number }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="flex flex-col items-center justify-center py-6"
    >
        <div className="relative w-20 h-20">
            <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 64 64"
            >
                <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    className="stroke-gray-100 stroke-[8px]"
                />
                <motion.circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    className="stroke-primary stroke-[8px] stroke-linecap-round"
                    strokeDasharray="163"
                    strokeDashoffset={String(163 - (163 * progress) / 100)}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(progress)}%
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Importing rows…
                </p>
            </div>
        </div>
    </motion.div>
)

/**
 * A single import result row with staggered entrance animation.
 */
const ImportRow = ({
    row,
    index,
    onRetry,
    busy,
}: {
    row: ProductImportRow
    index: number
    onRetry: () => void
    busy: boolean
}) => {
    const statusTone = STATUS_TONE[row.status] ?? 'bg-slate-50 text-slate-700 border-slate-200'
    const actionTone = row.action ? ACTION_TONE[row.action] : 'bg-gray-50 text-gray-500 border-gray-200'

    return (
        <motion.tr
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ delay: index * 0.02, duration: 0.2 }}
            className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
        >
            <td className="p-3 text-xs font-mono text-gray-400 dark:text-gray-500">
                {row.rowNumber}
            </td>
            <td className="p-3">
                <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${statusTone}`}
                >
                    {row.status}
                </span>
            </td>
            <td className="p-3 text-xs">
                <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${actionTone}`}
                >
                    {row.action ?? '—'}
                </span>
            </td>
            <td className="p-3 text-xs text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                {row.payload?.productName ?? '—'}
            </td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[110px]">
                {row.payload?.barcode ?? '—'}
            </td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                {row.payload?.category ?? '—'}
            </td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[60px]">
                {row.payload?.uom ?? '—'}
            </td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[70px]">
                {row.payload?.unitCost ? `₱${row.payload.unitCost}` : '—'}
            </td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[70px]">
                {row.payload?.srp ? `₱${row.payload.srp}` : '—'}
            </td>
            <td className="p-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[70px]">
                {row.payload?.initialStock ? Number(row.payload.initialStock) : '—'}
            </td>
            <td className="p-3 text-xs text-rose-600 dark:text-rose-400 truncate max-w-[220px]">
                {row.errorMessage ?? '—'}
            </td>
            <td className="p-3 text-right">
                {row.status === 'FAILED' && !busy ? (
                    <Button
                        size="sm"
                        variant="plain"
                        className="text-rose-600 hover:bg-rose-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        onClick={onRetry}
                    >
                        <span className="text-xs">Retry</span>
                    </Button>
                ) : null}
            </td>
        </motion.tr>
    )
}

/**
 * Styled drop-zone file upload area.
 */
const UploadZone = ({
    file,
    onFileChange,
}: {
    file: File | null
    onFileChange: (file: File | null) => void
}) => {
    return (
        <div
            className={`
                rounded-xl border-2 border-dashed
                ${file ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'}
                p-6 text-center transition-all duration-200
                hover:border-primary hover:bg-primary/5
            `}
            onClick={() => {
                const input = document.getElementById('import-file-input') as HTMLInputElement | null
                input?.click()
            }}
        >
            <input
                id="import-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-col items-center gap-3">
                <HiOutlineUpload className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {file ? file.name : 'Choose Excel file'}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {file ? 'Max 2,000 rows • 10 MB' : 'Drag & drop or click to browse'}
                </p>
            </div>
        </div>
    )
}

/**
 * Professional bulk-import dialog for Material Master and Product Catalog.
 *
 * Features:
 * - Stepped header (Upload → Preview → Review → Commit)
 * - Drag-and-drop style upload zone
 * - Responsive summary cards and data table
 * - Animated import progress
 * - Primary CTA with proper touch targets (min 44px)
 */
const ProductImportDialog = ({
    isOpen,
    source = 'SD',
    defaultDivisionId = RETAIL_DIVISION_ID,
    onClose,
    onImported,
}: Props) => {
    const [companies, setCompanies] = useState<Option[]>([])
    const [companyId, setCompanyId] = useState('')
    const [divisionId, setDivisionId] = useState(defaultDivisionId)
    const [file, setFile] = useState<File | null>(null)
    const [batch, setBatch] = useState<ProductImportBatch | null>(null)
    const [history, setHistory] = useState<ProductImportBatch[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
    const [commitProgress, setCommitProgress] = useState(0)
    const [showCommitAnimation, setShowCommitAnimation] = useState(false)

    const loadHistory = useCallback(() => {
        listProductImportBatches(8)
            .then(setHistory)
            .catch(() => setHistory([]))
    }, [])

    useEffect(() => {
        if (!isOpen) return
        setError(null)
        setBatch(null)
        setFile(null)
        setCommitProgress(0)
        setShowCommitAnimation(false)
        setIdempotencyKey(newIdempotencyKey())
        setDivisionId(defaultDivisionId)
        orgService
            .companies()
            .then((rows) => {
                const options = rows.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.code})`,
                }))
                setCompanies(options)
                setCompanyId((current) => current || options[0]?.value || '')
            })
            .catch(() => setCompanies([]))
        loadHistory()
    }, [isOpen, defaultDivisionId, loadHistory])

    const openHistory = async (id: string) => {
        setBusy(true)
        setError(null)
        try {
            setBatch(await getProductImportBatch(id))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load the import')
        } finally {
            setBusy(false)
        }
    }

    const run = async (action: () => Promise<void>) => {
        setBusy(true)
        setError(null)
        try {
            await action()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import step failed')
        } finally {
            setBusy(false)
        }
    }

    const [previewedFileId, setPreviewedFileId] = useState<string | null>(null)

    const handlePreview = useCallback(
        async () => {
            if (!file) throw new Error('Choose an Excel file first')
            if (!companyId) throw new Error('Select the company that owns the stock')
            const preview = await previewProductImport({
                file,
                companyId,
                divisionId,
                source,
                idempotencyKey,
            })
            setBatch(preview)
            setPreviewedFileId(file.name + '|' + file.size)
            loadHistory()
        },
        [file, companyId, divisionId, source, idempotencyKey, loadHistory],
    )

    // Auto-preview when a new file and company are both selected.
    useEffect(() => {
        if (!file || !companyId) return
        const fileKey = file.name + '|' + file.size
        if (fileKey === previewedFileId) return
        void handlePreview()
    }, [file, companyId, previewedFileId, handlePreview])

    const handleCommit = async () => {
        if (!batch || showCommitAnimation) return
        setShowCommitAnimation(true)
        setCommitProgress(0)
        let progress = 0
        const timer = setInterval(() => {
            progress = Math.min(progress + 8, 90)
            setCommitProgress(progress)
            if (progress >= 90) clearInterval(timer)
        }, 100)
        try {
            const committed = await commitProductImport(batch.id)
            setCommitProgress(100)
            clearInterval(timer)
            setBatch(committed)
            loadHistory()
            const created =
                committed.createdMaterialRows + committed.createdListingRows
            const updated = committed.updatedRows
            const failed = committed.rows?.filter(
                (row) => row.status === 'FAILED' || row.status === 'INVALID',
            ).length
            const summaryParts: string[] = []
            if (created > 0) summaryParts.push(`${created} new`)
            if (updated > 0) summaryParts.push(`${updated} updated`)
            const summary =
                summaryParts.length > 0
                    ? summaryParts.join(' ') + ' listing(s)'
                    : 'no changes'
            notify(
                failed ? 'danger' : 'success',
                'Import committed',
                `${summary}${failed ? `, ${failed} row(s) need attention` : ''}.`,
            )
            // Wait for import refresh to complete so the page shows the
            // newly imported materials when the dialog closes.
            await onImported?.()
            // Auto-close after successful commit so the user sees the refreshed
            // catalog / materials page with the updated items.
            if (!failed) {
                onClose?.()
            }
        } catch (err) {
            clearInterval(timer)
            setCommitProgress(0)
            setError(err instanceof Error ? err.message : 'Commit failed')
        } finally {
            setShowCommitAnimation(false)
        }
    }

    const handleRetry = () =>
        run(async () => {
            if (!batch) return
            const retried = await retryProductImport(batch.id)
            setBatch(retried)
            loadHistory()
            onImported?.()
            notify('success', 'Retry finished', 'Failed rows were imported again.')
        })

    const handleCancel = () =>
        run(async () => {
            if (!batch) return
            setBatch(await cancelProductImport(batch.id))
            loadHistory()
        })

    const handleOpeningStock = (allowExisting: boolean) =>
        run(async () => {
            if (!batch) return
            const result = await postProductImportOpeningStock(
                batch.id,
                allowExisting,
            )
            notify(
                result.failed ? 'danger' : 'success',
                'Opening stock',
                `${result.posted} posted${result.failed ? `, ${result.failed} failed` : ''}.`,
            )
            if (result.failed) {
                setError(
                    result.results
                        .filter((row) => row.status === 'FAILED')
                        .map((row) => `Row ${row.rowNumber}: ${row.message}`)
                        .join('; '),
                )
            }
            onImported?.()
        })

    const rows = batch?.rows ?? []
    const invalidRows = rows.filter(
        (row) => row.status === 'INVALID' || row.status === 'FAILED',
    )
    const hasStock = rows.some(
        (row) =>
            Number(row.payload?.initialStock ?? 0) > 0 &&
            row.status === 'IMPORTED',
    )
    const canCommit =
        batch?.status === 'PREVIEW' && (batch?.validRows ?? 0) > 0

    const summaryCards = useMemo(
        () => [
            countCard(
                batch?.totalRows ?? 0,
                'Total rows',
                <HiOutlineDocument className="w-4 h-4" />,
                'border-gray-200 bg-gray-50',
            ),
            countCard(
                batch?.validRows ?? 0,
                'Valid',
                <HiOutlineCheckCircle className="w-4 h-4" />,
                'border-emerald-200 bg-emerald-50',
            ),
            countCard(
                batch?.invalidRows ?? 0,
                'Invalid',
                <HiOutlineExclamation className="w-4 h-4" />,
                'border-rose-200 bg-rose-50',
            ),
            countCard(
                batch?.createdMaterialRows ?? 0,
                'New materials',
                <HiOutlineArrowRight className="w-4 h-4" />,
                'border-blue-200 bg-blue-50',
            ),
            countCard(
                batch?.createdListingRows ?? 0,
                'New listings',
                <HiOutlineArrowRight className="w-4 h-4" />,
                'border-indigo-200 bg-indigo-50',
            ),
            countCard(
                batch?.duplicateBarcodeRows ?? 0,
                'Barcode conflicts',
                <HiOutlineClock className="w-4 h-4" />,
                'border-amber-200 bg-amber-50',
            ),
        ],
        [batch],
    )

    const columns = [
        { key: 'row', label: 'Row', width: 'w-[44px]' },
        { key: 'status', label: 'Status', width: 'w-[72px]' },
        { key: 'action', label: 'Action', width: 'w-[80px]' },
        { key: 'product', label: 'Product', width: 'w-[200px]' },
        { key: 'barcode', label: 'Barcode', width: 'w-[100px]' },
        { key: 'category', label: 'Category', width: 'w-[110px]' },
        { key: 'uom', label: 'UoM', width: 'w-[56px]' },
        { key: 'cost', label: 'Unit Cost', width: 'w-[80px]' },
        { key: 'price', label: 'Price', width: 'w-[80px]' },
        { key: 'stock', label: 'Available', width: 'w-[72px]' },
        { key: 'issues', label: 'Issues', width: 'w-[220px]' },
        { key: 'actions', label: '', width: 'w-[64px]' },
    ]

    const stepLabels = ['Upload', 'Preview', 'Review', 'Commit']
    const currentStep = batch ? (batch.status === 'COMMITTED' ? 4 : 2) : 1

    const stepIndicator = (
        <div className="flex items-center gap-1 text-xs font-medium">
            {stepLabels.map((label, i) => (
                <>
                    <div
                        className={`
                            flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors
                            ${
                                i + 1 < currentStep
                                    ? 'bg-emerald-600 text-white'
                                    : i + 1 === currentStep
                                    ? 'bg-primary text-white'
                                    : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                            }
                        `}
                    >
                        {i + 1}
                    </div>
                    <span
                        className={`
                            font-medium transition-colors
                            ${
                                i + 1 <= currentStep
                                    ? 'text-gray-900 dark:text-gray-100'
                                    : 'text-gray-400 dark:text-gray-500'
                            }
                        `}
                    >
                        {label}
                    </span>
                    {i < stepLabels.length - 1 && (
                        <div
                            className={`w-px h-2 ${
                                i + 1 < currentStep
                                    ? 'bg-emerald-600'
                                    : i + 1 === currentStep
                                    ? 'bg-primary'
                                    : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                        />
                    )}
                </>
            ))}
        </div>
    )

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={busy || showCommitAnimation ? () => undefined : onClose}
            title="Bulk import products"
            description="Match by SKU or barcode — duplicates are never created. Opening stock is posted only after commit."
            icon={<HiOutlineUpload className="w-5 h-5" />}
            width={1050}
            footer={
                <div className="flex w-full flex-wrap items-center justify-between gap-2 p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-800">
                    <Button
                        size="sm"
                        disabled={busy || showCommitAnimation}
                        icon={<HiOutlineDownload />}
                        onClick={() => void downloadProductImportTemplate()}
                    >
                        Template
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            disabled={busy || showCommitAnimation}
                            onClick={onClose}
                        >
                            Close
                        </Button>
                        {batch?.status === 'PREVIEW' ? (
                            <>
                                <Button
                                    size="sm"
                                    disabled={busy || showCommitAnimation}
                                    variant="plain"
                                    onClick={() => void handleCancel()}
                                >
                                    Cancel import
                                </Button>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    className="w-full sm:w-auto min-w-[140px] bg-gradient-to-r from-primary to-primary-deep hover:from-primary-deep hover:to-primary"
                                    loading={busy || showCommitAnimation}
                                    disabled={
                                        !canCommit ||
                                        showCommitAnimation ||
                                        busy
                                    }
                                    onClick={() => void handleCommit()}
                                >
                                    {showCommitAnimation ? (
                                        <motion.span
                                            animate={{ rotate: 360 }}
                                            transition={{
                                                duration: 1,
                                                repeat: Infinity,
                                                ease: 'linear',
                                            }}
                                            className="w-4 h-4"
                                        >
                                            <HiOutlineRefresh className="w-4 h-4" />
                                        </motion.span>
                                    ) : (
                                        <>
                                            <HiOutlineUpload className="w-4 h-4 mr-2" />
                                            Import valid rows
                                        </>
                                    )}
                                </Button>
                            </>
                        ) : null}
                    </div>
                </div>
            }
            footerClassName="!pt-4 !pb-4"
            bodyClassName="p-0"
        >
            <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {batch ? 'Import preview' : 'Step 1 — Upload workbook'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {batch
                                ? `${batch.batchNumber} — ${batch.filename}`
                                : 'Upload an Excel (.xlsx / .xls) or CSV file to preview and import products.'}
                        </p>
                    </div>
                    {batch ? (
                        <div className="flex items-center gap-2">
                            <Tag>{batch.status}</Tag>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                {source === 'MM'
                                    ? 'Material Master entry'
                                    : 'Product Catalog entry'}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="p-6">
                {error ? (
                    <Alert
                        showIcon
                        type="danger"
                        className="mb-4 rounded-lg border-rose-200 bg-rose-50/50"
                    >
                        {error}
                    </Alert>
                ) : null}

                {!batch ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <FormItem label="Excel file">
                                <UploadZone
                                    file={file}
                                    onFileChange={setFile}
                                />
                                <p className="mt-1 text-xs text-gray-400">
                                    Max 2,000 rows • 10 MB
                                </p>
                            </FormItem>
                            <FormItem label="Company">
                                <Select<Option>
                                    options={companies}
                                    value={companies.find(
                                        (c) => c.value === companyId,
                                    )}
                                    onChange={(option) =>
                                        setCompanyId(option?.value ?? '')
                                    }
                                    isSearchable
                                    placeholder="Select company"
                                />
                            </FormItem>
                            <FormItem label="Sales division">
                                <Select<Option>
                                    options={DIVISION_OPTIONS}
                                    value={DIVISION_OPTIONS.find(
                                        (d) => d.value === divisionId,
                                    )}
                                    onChange={(option) =>
                                        setDivisionId(
                                            option?.value ?? RETAIL_DIVISION_ID,
                                        )}
                                    isSearchable={false}
                                />
                            </FormItem>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="solid"
                                className="min-w-[140px] min-h-[44px] bg-gradient-to-r from-primary to-primary-deep hover:from-primary-deep hover:to-primary"
                                loading={busy}
                                disabled={!file || !companyId || busy}
                                onClick={() => void handlePreview()}
                            >
                                <HiOutlineUpload className="w-4 h-4 mr-2" />
                                Preview workbook
                            </Button>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                Initial stock is posted only after commit.
                            </span>
                        </div>
                    </div>
                ) : null}

                {batch ? (
                    <div className="mt-6 space-y-6">
                        {/* Step indicator */}
                        <div className="flex items-center justify-between px-4">
                            {stepIndicator}
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {batch.status === 'COMMITTED'
                                    ? 'Import complete'
                                    : 'Review before commit'}
                            </div>
                        </div>

                        {/* Summary cards */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            {summaryCards.map((card, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03, duration: 0.3 }}
                                >
                                    {card}
                                </motion.div>
                            ))}
                        </div>

                        {/* Import progress animation during commit */}
                        {showCommitAnimation && (
                            <div className="flex justify-center py-4">
                                <ImportProgress progress={commitProgress} />
                            </div>
                        )}

                        {/* Batch info */}
                        <div className="flex flex-wrap items-center gap-2 text-sm px-4">
                            <Tag>{batch.batchNumber}</Tag>
                            <Tag>{batch.status}</Tag>
                            <span className="text-gray-500 dark:text-gray-400">
                                {batch.filename}
                            </span>
                        </div>

                        {/* Data table */}
                        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                                        <tr>
                                            {columns.map((col) => (
                                                <th
                                                    key={col.key}
                                                    className={`px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 ${col.width} [&:last-child]:pr-2`}
                                                >
                                                    {col.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, i) => (
                                            <ImportRow
                                                key={row.id}
                                                row={row}
                                                index={i}
                                                onRetry={() => void handleRetry()}
                                                busy={busy || showCommitAnimation}
                                            />
                                        ))}
                                        {rows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={columns.length}
                                                    className="p-4 text-center text-gray-500 dark:text-gray-400"
                                                >
                                                    No rows
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table actions */}
                            {batch.rows?.length && (
                                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        {invalidRows.length > 0 ? (
                                            <Button
                                                size="sm"
                                                icon={<HiOutlineDownload />}
                                                onClick={() =>
                                                    void downloadProductImportErrors(batch)
                                                }
                                            >
                                                Download errors
                                            </Button>
                                        ) : null}
                                        {batch.rows.some(
                                            (row) => row.status === 'FAILED',
                                        ) && !showCommitAnimation ? (
                                            <Button
                                                size="sm"
                                                loading={busy}
                                                onClick={() => void handleRetry()}
                                            >
                                                Retry failed rows
                                            </Button>
                                        ) : null}
                                        {batch.status === 'COMMITTED' && hasStock ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="solid"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void handleOpeningStock(false)
                                                    }
                                                >
                                                    Post opening stock
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void handleOpeningStock(true)
                                                    }
                                                >
                                                    Post as extra receipt
                                                </Button>
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {rows.length} row(s) •
                                        {invalidRows.length} need attention
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Import history */}
                        {history.length > 0 && (
                            <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Import history
                                    </h4>
                                </div>
                                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                                    {history.map((item) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            transition={{ duration: 0.2 }}
                                            onClick={() => void openHistory(item.id)}
                                            className="px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className={`rounded-full border px-2 py-1 text-[10px] font-medium ${STATUS_TONE[item.status] ?? ''}`}
                                                >
                                                    {item.status}
                                                </span>
                                                <span className="truncate max-w-[200px]">
                                                    {item.batchNumber} ·
                                                    {item.filename}
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {item.totalRows} row(s)
                                            </span>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </FormDialog>
    )
}

export default ProductImportDialog
