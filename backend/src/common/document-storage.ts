import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { randomUUID } from 'crypto'
import type { ReadStream } from 'fs'

/** Office / PDF / image documents accepted as attachments. */
const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
])

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

export function sanitizeDocumentFileName(name: string): string {
    return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'document'
}

/** Thrown for a file type outside ALLOWED_EXTENSIONS. */
export class UnsupportedDocumentTypeError extends Error {}

/**
 * Local-disk document store under `uploads/<...segments>`. Storage keys are generated here
 * (`<entityType>/<entityId>/<uuid>-<name>`) and never come from the client, so reads stay inside
 * the root. Files are served only through authenticated controllers.
 */
export function createDocumentStorage(...segments: string[]) {
    const root = join(process.cwd(), 'uploads', ...segments)
    return {
        buildKey(entityType: string, entityId: string, fileName: string): string {
            const safeName = sanitizeDocumentFileName(fileName)
            const ext = extname(safeName).toLowerCase()
            if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
                throw new UnsupportedDocumentTypeError(`Unsupported file type: ${ext || 'unknown'}`)
            }
            return join(entityType, entityId, `${randomUUID()}-${safeName}`)
        },
        save(storageKey: string, buffer: Buffer): void {
            const absolutePath = join(root, storageKey)
            mkdirSync(join(absolutePath, '..'), { recursive: true })
            writeFileSync(absolutePath, buffer)
        },
        read(storageKey: string): ReadStream {
            const absolutePath = join(root, storageKey)
            if (!existsSync(absolutePath)) throw new Error('File not found on disk')
            return createReadStream(absolutePath)
        },
        remove(storageKey: string | null | undefined): void {
            if (!storageKey) return
            const absolutePath = join(root, storageKey)
            if (existsSync(absolutePath)) unlinkSync(absolutePath)
        },
    }
}
