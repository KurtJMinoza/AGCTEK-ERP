import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import type { ReadStream } from 'fs'

const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'mm', 'supplier-documents')

const ALLOWED_EXTENSIONS = new Set([
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.csv',
    '.txt',
])

export const SUPPLIER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'document'
}

export function buildSupplierDocumentStorageKey(
    supplierId: string,
    fileName: string,
): string {
    const safeName = sanitizeFileName(fileName)
    const ext = extname(safeName).toLowerCase()
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error(`Unsupported file type: ${ext || 'unknown'}`)
    }
    return join(supplierId, `${randomUUID()}-${safeName}`)
}

export function saveSupplierDocumentFile(
    storageKey: string,
    buffer: Buffer,
): void {
    const absolutePath = join(UPLOAD_ROOT, storageKey)
    const dir = join(absolutePath, '..')
    mkdirSync(dir, { recursive: true })
    writeFileSync(absolutePath, buffer)
}

export function readSupplierDocumentFile(storageKey: string): ReadStream {
    const absolutePath = join(UPLOAD_ROOT, storageKey)
    if (!existsSync(absolutePath)) {
        throw new Error('File not found on disk')
    }
    return createReadStream(absolutePath)
}

export function deleteSupplierDocumentFile(storageKey: string | null | undefined): void {
    if (!storageKey) return
    const absolutePath = join(UPLOAD_ROOT, storageKey)
    if (existsSync(absolutePath)) {
        unlinkSync(absolutePath)
    }
}
