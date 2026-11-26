import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Private on-disk store for the quotation PDFs emailed to customers. Deliberately NOT under
 * `public/`: these documents carry prices and may only be served through the authenticated SD
 * download endpoint. Override with QUOTATION_DOCUMENT_DIR when the API has its own volume.
 */
const DOCUMENT_ROOT = resolve(
    process.env.QUOTATION_DOCUMENT_DIR ?? join(process.cwd(), 'storage', 'quotations'),
)

/** Only generated file names are accepted: no separators, no traversal. */
const FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.pdf$/

export const QUOTATION_DOCUMENT_CONTENT_TYPE = 'application/pdf'
export const QUOTATION_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export type StoredQuotationDocument = {
    storageKey: string
    contentType: string
    byteSize: number
    checksum: string
}

function isPdf(buffer: Buffer): boolean {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
}

/** Persists PDF bytes under a generated name; returns the metadata stored on the quotation row. */
export function saveQuotationDocumentPdf(buffer: Buffer): StoredQuotationDocument {
    if (!buffer.length) throw new Error('Quotation PDF is empty')
    if (buffer.length > QUOTATION_DOCUMENT_MAX_BYTES) {
        throw new Error('Quotation PDF exceeds the 25 MB limit')
    }
    if (!isPdf(buffer)) throw new Error('Quotation document is not a PDF')
    mkdirSync(DOCUMENT_ROOT, { recursive: true })
    const storageKey = `${randomUUID()}.pdf`
    writeFileSync(join(DOCUMENT_ROOT, storageKey), buffer)
    return {
        storageKey,
        contentType: QUOTATION_DOCUMENT_CONTENT_TYPE,
        byteSize: buffer.length,
        checksum: checksumOf(buffer),
    }
}

/** Reads stored PDF bytes; null when the row points at a file that is gone or the key is unsafe. */
export function readQuotationDocumentPdf(storageKey: string): Buffer | null {
    if (!FILE_NAME_PATTERN.test(storageKey)) return null
    const absolutePath = join(DOCUMENT_ROOT, storageKey)
    return existsSync(absolutePath) ? readFileSync(absolutePath) : null
}

/** Overwrites a stored PDF in place (used to regenerate a snapshot whose file went missing). */
export function rewriteQuotationDocumentPdf(storageKey: string, buffer: Buffer): StoredQuotationDocument {
    if (!FILE_NAME_PATTERN.test(storageKey)) throw new Error('Invalid quotation document key')
    if (!isPdf(buffer)) throw new Error('Quotation document is not a PDF')
    mkdirSync(DOCUMENT_ROOT, { recursive: true })
    writeFileSync(join(DOCUMENT_ROOT, storageKey), buffer)
    return {
        storageKey,
        contentType: QUOTATION_DOCUMENT_CONTENT_TYPE,
        byteSize: buffer.length,
        checksum: checksumOf(buffer),
    }
}

export function checksumOf(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex')
}

/** Attachment/download name: `Q-000012_rev3.pdf`. */
export function quotationDocumentFilename(quotationNumber: string, revision: number): string {
    const safe = quotationNumber.replace(/[^A-Za-z0-9_-]/g, '')
    return `${safe || 'quotation'}_rev${revision}.pdf`
}
