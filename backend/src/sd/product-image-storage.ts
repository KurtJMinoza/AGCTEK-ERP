import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ReadStream } from 'fs'

const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'sd', 'product-images')

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Public path prefix; requests reach Nest through the Next.js `/api/v1` rewrite. */
export const PRODUCT_IMAGE_URL_PREFIX = '/api/v1/sd/products/images/'

const KEY_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
}

/** Detects the image type from file content; the client-sent name and MIME type are not trusted. */
function detectImageExtension(buffer: Buffer): string | null {
    if (buffer.length < 12) return null
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'png'
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'webp'
    }
    const header = buffer.toString('ascii', 0, 6)
    if (header === 'GIF87a' || header === 'GIF89a') return 'gif'
    return null
}

/** Saves a validated image and returns its storage key (`<uuid>.<ext>`). */
export function saveProductImage(buffer: Buffer): string {
    const ext = detectImageExtension(buffer)
    if (!ext) throw new Error('Only PNG, JPG, WEBP or GIF images are allowed')
    mkdirSync(UPLOAD_ROOT, { recursive: true })
    const key = `${randomUUID()}.${ext}`
    writeFileSync(join(UPLOAD_ROOT, key), buffer)
    return key
}

export function isProductImageKey(key: string): boolean {
    return KEY_PATTERN.test(key)
}

export function readProductImage(key: string): { stream: ReadStream; mimeType: string } {
    const absolutePath = join(UPLOAD_ROOT, key)
    if (!isProductImageKey(key) || !existsSync(absolutePath)) {
        throw new Error('Image not found')
    }
    return {
        stream: createReadStream(absolutePath),
        mimeType: MIME_BY_EXT[key.split('.').pop() as string],
    }
}

/** Deletes an uploaded image referenced by `imageUrl`; ignores external or seeded paths. */
export function deleteProductImageByUrl(imageUrl: string | null | undefined): void {
    if (!imageUrl?.startsWith(PRODUCT_IMAGE_URL_PREFIX)) return
    const key = imageUrl.slice(PRODUCT_IMAGE_URL_PREFIX.length)
    if (!isProductImageKey(key)) return
    const absolutePath = join(UPLOAD_ROOT, key)
    if (existsSync(absolutePath)) unlinkSync(absolutePath)
}
