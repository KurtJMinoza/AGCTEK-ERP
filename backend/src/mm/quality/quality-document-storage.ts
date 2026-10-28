import type { ReadStream } from 'fs'
import { createDocumentStorage, DOCUMENT_MAX_BYTES } from '../../common/document-storage'

const storage = createDocumentStorage('mm', 'quality-attachments')

export const QUALITY_ATTACHMENT_MAX_BYTES = DOCUMENT_MAX_BYTES

export function buildQualityStorageKey(entityType: string, entityId: string, fileName: string): string {
    return storage.buildKey(entityType, entityId, fileName)
}

export function saveQualityAttachmentFile(storageKey: string, buffer: Buffer): void {
    storage.save(storageKey, buffer)
}

export function readQualityAttachmentFile(storageKey: string): ReadStream {
    return storage.read(storageKey)
}

export function deleteQualityAttachmentFile(storageKey: string | null | undefined): void {
    storage.remove(storageKey)
}
