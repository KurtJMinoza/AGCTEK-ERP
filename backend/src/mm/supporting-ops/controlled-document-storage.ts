import { createHash } from 'crypto'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import type { ReadStream } from 'fs'

const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'mm', 'controlled-documents')

const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
])

export const CONTROLLED_DOC_MAX_BYTES = 25 * 1024 * 1024

function sanitizeFileName(name: string): string {
    return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'document'
}

export function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex')
}

export function buildControlledDocStorageKey(documentId: string, fileName: string): string {
    const safeName = sanitizeFileName(fileName)
    const ext = extname(safeName).toLowerCase()
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error(`Unsupported file type: ${ext || 'unknown'}`)
    }
    return join(documentId, `${randomUUID()}-${safeName}`)
}

export function saveControlledDocumentFile(storageKey: string, buffer: Buffer): void {
    if (buffer.length > CONTROLLED_DOC_MAX_BYTES) {
        throw new Error('File exceeds maximum allowed size')
    }
    const absolutePath = join(UPLOAD_ROOT, storageKey)
    mkdirSync(join(absolutePath, '..'), { recursive: true })
    writeFileSync(absolutePath, buffer)
}

export function readControlledDocumentFile(storageKey: string): ReadStream {
    const absolutePath = join(UPLOAD_ROOT, storageKey)
    if (!existsSync(absolutePath)) throw new Error('File not found on disk')
    return createReadStream(absolutePath)
}
