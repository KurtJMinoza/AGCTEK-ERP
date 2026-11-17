import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'

const BASE = '/sd/product-imports'

export type ProductImportRowStatus = 'VALID' | 'INVALID' | 'IMPORTED' | 'FAILED'

export type ProductImportRow = {
    id: string
    rowNumber: number
    status: ProductImportRowStatus
    action: 'UPDATE' | 'ADD_LISTING' | 'CREATE_MATERIAL' | null
    payload: Record<string, string | undefined>
    errors: { errors?: string[]; warnings?: string[] } | null
    materialId: string | null
    productId: string | null
    variantId: string | null
    errorMessage: string | null
}

export type ProductImportBatch = {
    id: string
    batchNumber: string
    filename: string
    source: 'SD' | 'MM'
    status: 'PREVIEW' | 'COMMITTING' | 'COMMITTED' | 'CANCELLED'
    companyId: string | null
    divisionId: string | null
    totalRows: number
    validRows: number
    invalidRows: number
    createdMaterialRows: number
    createdListingRows: number
    updatedRows: number
    duplicateBarcodeRows: number
    createdAt: string
    committedAt: string | null
    rows?: ProductImportRow[]
}

export type ProductImportPreviewInput = {
    file: File
    companyId: string
    divisionId: string
    source?: 'SD' | 'MM'
    /** Re-sent preview returns the same batch instead of a new one. */
    idempotencyKey?: string
}

export type OpeningStockResult = {
    batchId: string
    posted: number
    failed: number
    results: Array<{
        rowNumber: number
        materialId: string
        status: 'POSTED' | 'SKIPPED' | 'FAILED'
        message?: string
    }>
}

export async function previewProductImport(
    input: ProductImportPreviewInput,
): Promise<ProductImportBatch> {
    try {
        const form = new FormData()
        form.append('file', input.file)
        form.append('companyId', input.companyId)
        form.append('divisionId', input.divisionId)
        form.append('source', input.source ?? 'SD')
        if (input.idempotencyKey) {
            form.append('idempotencyKey', input.idempotencyKey)
        }
        const { data } = await ErpAxiosBase.post<ProductImportBatch>(
            `${BASE}/preview`,
            form,
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to read the workbook')
    }
}

export async function listProductImportBatches(
    limit = 10,
): Promise<ProductImportBatch[]> {
    try {
        const { data } = await ErpAxiosBase.get<ProductImportBatch[]>(BASE, {
            params: { limit },
        })
        return data
    } catch (error) {
        throw toError(error, 'Unable to load import history')
    }
}

export async function getProductImportBatch(
    id: string,
): Promise<ProductImportBatch> {
    try {
        const { data } = await ErpAxiosBase.get<ProductImportBatch>(
            `${BASE}/${id}`,
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to load the import batch')
    }
}

export async function commitProductImport(
    id: string,
): Promise<ProductImportBatch> {
    try {
        const { data } = await ErpAxiosBase.post<ProductImportBatch>(
            `${BASE}/${id}/commit`,
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to import the workbook')
    }
}

export async function retryProductImport(
    id: string,
): Promise<ProductImportBatch> {
    try {
        const { data } = await ErpAxiosBase.post<ProductImportBatch>(
            `${BASE}/${id}/retry`,
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to retry the failed rows')
    }
}

export async function cancelProductImport(
    id: string,
): Promise<ProductImportBatch> {
    try {
        const { data } = await ErpAxiosBase.post<ProductImportBatch>(
            `${BASE}/${id}/cancel`,
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to cancel the import')
    }
}

export async function postProductImportOpeningStock(
    id: string,
    allowExisting = false,
): Promise<OpeningStockResult> {
    try {
        const { data } = await ErpAxiosBase.post<OpeningStockResult>(
            `${BASE}/${id}/opening-stock`,
            { allowExisting },
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to post the opening stock')
    }
}

export async function downloadProductImportTemplate(): Promise<void> {
    try {
        // The X-User-Id header comes from the axios interceptor, so a plain
        // window.open() would be rejected by the permission guard.
        const { data } = await ErpAxiosBase.get<Blob>(`${BASE}/template`, {
            responseType: 'blob',
        })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(data)
        link.download = 'product-import-template.xlsx'
        link.click()
        URL.revokeObjectURL(link.href)
    } catch (error) {
        throw toError(error, 'Unable to download the template')
    }
}

const csvCell = (value: unknown) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Row-level error report; generated from the stored batch, no extra API. */
export function downloadProductImportErrors(batch: ProductImportBatch): void {
    const rows = batch.rows ?? []
    const header = [
        'Row',
        'Status',
        'Action',
        'Material SKU',
        'Barcode',
        'Product Name',
        'Errors',
        'Warnings',
    ]
    const lines = [header.map(csvCell).join(',')]
    for (const row of rows) {
        if (row.status !== 'INVALID' && row.status !== 'FAILED') continue
        lines.push(
            [
                row.rowNumber,
                row.status,
                row.action ?? '',
                row.payload?.materialSku ?? '',
                row.payload?.barcode ?? '',
                row.payload?.productName ?? '',
                (row.errors?.errors ?? []).join(' | '),
                (row.errors?.warnings ?? []).join(' | '),
            ]
                .map(csvCell)
                .join(','),
        )
    }
    const blob = new Blob([lines.join('\n')], {
        type: 'text/csv;charset=utf-8',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${batch.batchNumber}-errors.csv`
    link.click()
    URL.revokeObjectURL(link.href)
}
